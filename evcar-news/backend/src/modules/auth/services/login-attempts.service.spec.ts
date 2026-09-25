import type { Redis } from 'ioredis';
import { AppConfig } from '../../../config/app-config';
import {
  EMAIL_LOCK_THRESHOLD,
  IP_EMAIL_MAX_FAILURES,
  LOCK_BASE_MS,
  LOCK_MAX_MS,
  lockDurationMs,
  LoginAttemptsService,
} from './login-attempts.service';

const config = AppConfig.fromEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://x:y@localhost:5432/unit',
  IP_HASH_SALT: 'unit-test-salt-unit-test-salt',
});

/** Redis that is not connected → the service uses its in-memory fallback. */
const offlineRedis = { status: 'end' } as unknown as Redis;

describe('lockDurationMs (backoff)', () => {
  it('starts at the threshold and doubles up to the cap', () => {
    expect(lockDurationMs(EMAIL_LOCK_THRESHOLD - 1)).toBe(0);
    expect(lockDurationMs(EMAIL_LOCK_THRESHOLD)).toBe(LOCK_BASE_MS);
    expect(lockDurationMs(EMAIL_LOCK_THRESHOLD + 1)).toBe(2 * LOCK_BASE_MS);
    expect(lockDurationMs(EMAIL_LOCK_THRESHOLD + 2)).toBe(4 * LOCK_BASE_MS);
    expect(lockDurationMs(EMAIL_LOCK_THRESHOLD + 50)).toBe(LOCK_MAX_MS);
  });
});

describe('LoginAttemptsService (memory fallback)', () => {
  it('locks an e-mail after the threshold, across IPs, and clears on success', async () => {
    const svc = new LoginAttemptsService(offlineRedis, config);
    const email = 'victim@example.com';
    for (let i = 1; i < EMAIL_LOCK_THRESHOLD; i++) {
      const r = await svc.recordFailure(`10.0.0.${i}`, email);
      expect(r).toMatchObject({ failures: i, blocked: false, lockedUntil: null });
    }
    expect((await svc.check('10.9.9.9', email)).blocked).toBe(false);
    const locked = await svc.recordFailure('10.0.0.99', email);
    expect(locked.blocked).toBe(true);
    expect(locked.retryAfterSeconds).toBe(LOCK_BASE_MS / 1000);
    // Blocked from any IP, case-insensitively.
    const state = await svc.check('192.168.1.1', ' VICTIM@example.com ');
    expect(state.blocked).toBe(true);
    expect(state.retryAfterSeconds).toBeGreaterThan(0);
    // Other addresses are unaffected.
    expect((await svc.check('192.168.1.1', 'other@example.com')).blocked).toBe(false);

    await svc.recordSuccess('10.0.0.99', email);
    expect((await svc.check('192.168.1.1', email)).blocked).toBe(false);
  });

  it('blocks one ip+email pair after too many failures in the window', async () => {
    jest.useFakeTimers({ now: Date.now() });
    try {
      const svc = new LoginAttemptsService(offlineRedis, config);
      const email = 'pair@example.com';
      for (let i = 0; i < IP_EMAIL_MAX_FAILURES; i++) {
        await svc.recordFailure('10.1.1.1', email);
        // Let every e-mail lock expire so only the pair counter matters.
        jest.setSystemTime(Date.now() + LOCK_MAX_MS + 1);
      }
      expect((await svc.check('10.1.1.1', email)).blocked).toBe(false); // window already over
      for (let i = 0; i < IP_EMAIL_MAX_FAILURES; i++) await svc.recordFailure('10.2.2.2', email);
      // Remove the per-e-mail lock: only the ip+email pair counter remains.
      await svc.clearEmail(email);
      const pair = await svc.check('10.2.2.2', email);
      expect(pair.blocked).toBe(true);
      expect((await svc.check('10.3.3.3', email)).blocked).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('never stores raw e-mails or IPs in keys', async () => {
    const svc = new LoginAttemptsService(offlineRedis, config);
    await svc.recordFailure('10.0.0.1', 'secret.person@example.com');
    const keys = [...(svc as unknown as { memory: Map<string, unknown> }).memory.keys()];
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(k).not.toContain('secret.person');
      expect(k).not.toContain('10.0.0.1');
    }
  });
});

describe('LoginAttemptsService — known clients are exempt from the account-wide lock', () => {
  async function lock(svc: LoginAttemptsService, email: string) {
    for (let i = 0; i < EMAIL_LOCK_THRESHOLD; i++) {
      await svc.recordFailure(`203.0.113.${i + 1}`, email);
    }
  }

  it('anonymous failures do not lock out an IP that signed in before', async () => {
    const svc = new LoginAttemptsService(offlineRedis, config);
    const email = 'owner@example.com';
    await svc.rememberClient('198.51.100.7', email, undefined);
    await lock(svc, email);
    // Unknown clients are refused (even with the right password).
    expect((await svc.check('192.0.2.1', email)).blocked).toBe(true);
    // The owner's usual IP is not.
    expect((await svc.check('198.51.100.7', email)).blocked).toBe(false);
    // A known IP of ANOTHER account does not help.
    await svc.rememberClient('192.0.2.50', 'other@example.com', undefined);
    expect((await svc.check('192.0.2.50', email)).blocked).toBe(true);
  });

  it('a remembered device id works from a new IP', async () => {
    const svc = new LoginAttemptsService(offlineRedis, config);
    const email = 'admin@example.com';
    await svc.rememberClient('198.51.100.8', email, 'device-abcdefghijklmnop');
    await lock(svc, email);
    expect(
      (await svc.check('192.0.2.99', email, { deviceId: 'device-abcdefghijklmnop' })).blocked,
    ).toBe(false);
    expect(
      (await svc.check('192.0.2.99', email, { deviceId: 'device-zzzzzzzzzzzzzzzz' })).blocked,
    ).toBe(true);
  });

  it('trusted callers (valid session) skip the account lock but not the pair limit', async () => {
    const svc = new LoginAttemptsService(offlineRedis, config);
    const email = 'reauth@example.com';
    await lock(svc, email);
    expect((await svc.check('192.0.2.2', email, { trusted: true })).blocked).toBe(false);
    for (let i = 0; i < IP_EMAIL_MAX_FAILURES; i++) await svc.recordFailure('192.0.2.2', email);
    expect((await svc.check('192.0.2.2', email, { trusted: true })).blocked).toBe(true);
  });

  it('a known client is still limited by the per-(IP, e-mail) counter', async () => {
    const svc = new LoginAttemptsService(offlineRedis, config);
    const email = 'known@example.com';
    await svc.rememberClient('198.51.100.9', email, undefined);
    for (let i = 0; i < IP_EMAIL_MAX_FAILURES; i++) await svc.recordFailure('198.51.100.9', email);
    expect((await svc.check('198.51.100.9', email)).blocked).toBe(true);
  });

  it('never stores raw IPs or device ids in the known-client set', async () => {
    const svc = new LoginAttemptsService(offlineRedis, config);
    await svc.rememberClient('10.9.8.7', 'raw@example.com', 'my-device-id-123456');
    const known = (svc as unknown as { knownMemory: Map<string, Map<string, number>> }).knownMemory;
    const dump = JSON.stringify([...known.entries()].map(([k, v]) => [k, [...v.keys()]]));
    expect(dump).not.toContain('10.9.8.7');
    expect(dump).not.toContain('my-device-id');
    expect(dump).not.toContain('raw@example.com');
  });
});

describe('LoginAttemptsService with a real Redis', () => {
  // Uses the local Redis when reachable (dev container / CI service); skipped otherwise.
  let redis: import('ioredis').Redis | undefined;
  beforeAll(async () => {
    const { Redis } = await import('ioredis');
    const client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    try {
      await client.connect();
      redis = client;
    } catch {
      client.disconnect();
    }
  });
  afterAll(() => redis?.disconnect());

  it('exempts a remembered client from the lock (ZSET storage)', async () => {
    if (!redis) return;
    const prefix = `evcar-unit-${Date.now()}-${Math.random().toString(36).slice(2)}:`;
    const cfg = AppConfig.fromEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://x:y@localhost:5432/unit',
      IP_HASH_SALT: 'unit-test-salt-unit-test-salt',
      REDIS_KEY_PREFIX: prefix,
    });
    const svc = new LoginAttemptsService(redis, cfg);
    const email = 'redis-owner@example.com';
    try {
      await svc.rememberClient('198.51.100.1', email, 'dev-redis-abcdefghijk');
      for (let i = 0; i < EMAIL_LOCK_THRESHOLD; i++) await svc.recordFailure(`192.0.2.${i}`, email);
      expect((await svc.check('192.0.2.200', email)).blocked).toBe(true);
      expect((await svc.check('198.51.100.1', email)).blocked).toBe(false);
      expect(
        (await svc.check('192.0.2.201', email, { deviceId: 'dev-redis-abcdefghijk' })).blocked,
      ).toBe(false);
    } finally {
      const keys = await redis.keys(`${prefix}*`);
      if (keys.length) await redis.del(...keys);
    }
  });
});
