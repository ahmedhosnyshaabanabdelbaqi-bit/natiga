import { createHmac } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../../../common/redis/redis.module';
import { AppConfig } from '../../../config/app-config';

/** Failures per (ip, e-mail) pair within the window before that pair is blocked. */
export const IP_EMAIL_MAX_FAILURES = 10;
export const IP_EMAIL_WINDOW_MS = 15 * 60_000;
/** Consecutive failures per e-mail (any IP) before the account backoff starts. */
export const EMAIL_LOCK_THRESHOLD = 5;
/** Failure counter per e-mail resets after this long without failures. */
export const EMAIL_FAILURE_TTL_MS = 60 * 60_000;
export const LOCK_BASE_MS = 30_000;
export const LOCK_MAX_MS = 15 * 60_000;
/** A client (IP or device id) that signed in successfully stays "known" this long. */
export const KNOWN_CLIENT_TTL_MS = 90 * 24 * 3600_000;
/** Known clients kept per account (most recent first). */
export const KNOWN_CLIENT_MAX = 20;

/** Lock duration after the n-th consecutive failure (0 below the threshold). */
export function lockDurationMs(failures: number): number {
  if (failures < EMAIL_LOCK_THRESHOLD) return 0;
  const exp = Math.min(failures - EMAIL_LOCK_THRESHOLD, 20);
  return Math.min(LOCK_BASE_MS * 2 ** exp, LOCK_MAX_MS);
}

export interface AttemptState {
  blocked: boolean;
  retryAfterSeconds: number;
}

/** Who is asking, for the account-wide lock (see LoginAttemptsService). */
export interface AttemptClient {
  /** Opaque per-device id (web cookie `evcar_dev` / mobile `X-Device-Id`). */
  deviceId?: string;
  /**
   * The caller already holds a valid session of this account (re-auth for
   * account deletion / password change): the account-wide lock does not
   * apply, only the per-(IP, e-mail) limit.
   */
  trusted?: boolean;
}

export interface FailureResult extends AttemptState {
  /** Consecutive failures for this e-mail. */
  failures: number;
  lockedUntil: Date | null;
}

interface MemoryEntry {
  value: number;
  expiresAt: number;
}

/**
 * Brute-force protection for password checks (login, account deletion):
 *  1. per (ip, e-mail): at most IP_EMAIL_MAX_FAILURES failures per 15 min —
 *     blocks that pair even with the right password (the per-IP route
 *     throttle adds a global budget per IP);
 *  2. per e-mail across all IPs: after EMAIL_LOCK_THRESHOLD consecutive
 *     failures the address is locked with exponential backoff
 *     (30 s, 1 min, 2 min … max 15 min). The lock does NOT apply to a
 *     "known client" of the account — an IP or device id that signed in
 *     successfully in the last 90 days — so anonymous requests cannot keep
 *     the real owner locked out; for everybody else it refuses even the right
 *     password (hides whether a guess was correct during a distributed attack).
 * Keyed by e-mail whether or not the account exists, so lockouts never
 * reveal which addresses are registered. Counters live in Redis (shared by
 * all instances) and fall back to process memory when Redis is down.
 * Keys and members are HMACs of the e-mail/IP/device id, never raw values.
 */
@Injectable()
export class LoginAttemptsService {
  private readonly logger = new Logger(LoginAttemptsService.name);
  private readonly memory = new Map<string, MemoryEntry>();
  private readonly knownMemory = new Map<string, Map<string, number>>();
  private lastWarn = 0;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly config: AppConfig,
  ) {}

  async check(
    ip: string | undefined,
    email: string,
    client: AttemptClient = {},
  ): Promise<AttemptState> {
    const k = this.keys(ip, email);
    const [lockTtl, pairCount, pairTtl] = await this.run(
      async () => {
        const res = await this.redis.multi().pttl(k.lock).get(k.pair).pttl(k.pair).exec();
        return (res ?? []).map(([, v]) => Number(v ?? 0)) as [number, number, number];
      },
      () => [this.memTtl(k.lock), this.memGet(k.pair), this.memTtl(k.pair)],
    );
    if (pairCount >= IP_EMAIL_MAX_FAILURES) {
      return { blocked: true, retryAfterSeconds: Math.max(1, Math.ceil(pairTtl / 1000)) };
    }
    if (lockTtl > 0 && !client.trusted && !(await this.isKnownClient(ip, email, client.deviceId))) {
      return { blocked: true, retryAfterSeconds: Math.ceil(lockTtl / 1000) };
    }
    return { blocked: false, retryAfterSeconds: 0 };
  }

  /**
   * Remembers the IP and device id of a successful sign-in as "known
   * clients" of the account (exempt from the account-wide lock).
   */
  async rememberClient(
    ip: string | undefined,
    email: string,
    deviceId: string | undefined,
  ): Promise<void> {
    const key = this.keys(ip, email).known;
    const members = this.clientMembers(ip, email, deviceId);
    if (members.length === 0) return;
    const now = Date.now();
    await this.run(
      async () => {
        const multi = this.redis.multi();
        for (const m of members) multi.zadd(key, now, m);
        await multi
          .zremrangebyscore(key, '-inf', now - KNOWN_CLIENT_TTL_MS)
          .zremrangebyrank(key, 0, -(KNOWN_CLIENT_MAX + 1))
          .pexpire(key, KNOWN_CLIENT_TTL_MS)
          .exec();
      },
      () => {
        const set = this.knownMemory.get(key) ?? new Map<string, number>();
        for (const m of members) set.set(m, now);
        const recent = [...set.entries()]
          .filter(([, t]) => t > now - KNOWN_CLIENT_TTL_MS)
          .sort((a, b) => b[1] - a[1])
          .slice(0, KNOWN_CLIENT_MAX);
        this.knownMemory.set(key, new Map(recent));
        if (this.knownMemory.size > 50_000) this.knownMemory.clear();
      },
    );
  }

  private async isKnownClient(
    ip: string | undefined,
    email: string,
    deviceId: string | undefined,
  ): Promise<boolean> {
    const key = this.keys(ip, email).known;
    const members = this.clientMembers(ip, email, deviceId);
    if (members.length === 0) return false;
    const since = Date.now() - KNOWN_CLIENT_TTL_MS;
    const scores = await this.run(
      async () => (await this.redis.zmscore(key, ...members)).map((v) => Number(v ?? 0)),
      () => members.map((m) => this.knownMemory.get(key)?.get(m) ?? 0),
    );
    return scores.some((t) => t > since);
  }

  private clientMembers(
    ip: string | undefined,
    email: string,
    deviceId: string | undefined,
  ): string[] {
    const e = email.trim().toLowerCase();
    const members: string[] = [];
    if (ip) members.push(`ip:${this.hmac(`k:${ip}|${e}`)}`);
    if (deviceId) members.push(`dev:${this.hmac(`d:${deviceId}|${e}`)}`);
    return members;
  }

  async recordFailure(ip: string | undefined, email: string): Promise<FailureResult> {
    const k = this.keys(ip, email);
    const failures = await this.run(
      async () => {
        const res = await this.redis
          .multi()
          .incr(k.email)
          .pexpire(k.email, EMAIL_FAILURE_TTL_MS)
          .incr(k.pair)
          .pttl(k.pair)
          .exec();
        const values = (res ?? []).map(([, v]) => Number(v ?? 0));
        if (values[3] < 0) await this.redis.pexpire(k.pair, IP_EMAIL_WINDOW_MS);
        return values[0];
      },
      () => {
        const n = this.memIncr(k.email, EMAIL_FAILURE_TTL_MS, true);
        this.memIncr(k.pair, IP_EMAIL_WINDOW_MS, false);
        return n;
      },
    );
    const lockMs = lockDurationMs(failures);
    if (lockMs > 0) {
      await this.run(
        async () => {
          await this.redis.set(k.lock, '1', 'PX', lockMs);
        },
        () => {
          this.memory.set(k.lock, { value: 1, expiresAt: Date.now() + lockMs });
        },
      );
    }
    return {
      failures,
      blocked: lockMs > 0,
      retryAfterSeconds: Math.ceil(lockMs / 1000),
      lockedUntil: lockMs > 0 ? new Date(Date.now() + lockMs) : null,
    };
  }

  /** Clears the counters after a successful password check. */
  async recordSuccess(ip: string | undefined, email: string): Promise<void> {
    const k = this.keys(ip, email);
    await this.run(
      async () => {
        await this.redis.del(k.email, k.lock, k.pair);
      },
      () => {
        this.memory.delete(k.email);
        this.memory.delete(k.lock);
        this.memory.delete(k.pair);
      },
    );
  }

  /** Clears the per-e-mail counter and lock (e.g. after a password reset). */
  async clearEmail(email: string): Promise<void> {
    const k = this.keys(undefined, email);
    await this.run(
      async () => {
        await this.redis.del(k.email, k.lock);
      },
      () => {
        this.memory.delete(k.email);
        this.memory.delete(k.lock);
      },
    );
  }

  private hmac(value: string): string {
    return createHmac('sha256', this.config.auth.ipHashSalt)
      .update(value)
      .digest('hex')
      .slice(0, 40);
  }

  private keys(ip: string | undefined, email: string) {
    const e = this.hmac(`e:${email.trim().toLowerCase()}`);
    const pair = this.hmac(`p:${ip ?? 'unknown'}|${email.trim().toLowerCase()}`);
    const prefix = `${this.config.redis.keyPrefix}auth:`;
    return {
      email: `${prefix}fail:email:${e}`,
      lock: `${prefix}lock:email:${e}`,
      pair: `${prefix}fail:pair:${pair}`,
      known: `${prefix}known:${e}`,
    };
  }

  private async run<T>(redisFn: () => Promise<T>, memoryFn: () => T): Promise<T> {
    if (this.redis.status === 'ready') {
      try {
        return await redisFn();
      } catch (err) {
        this.warn(err);
      }
    }
    return memoryFn();
  }

  private warn(err: unknown): void {
    if (Date.now() - this.lastWarn > 30_000) {
      this.logger.warn(
        `Redis unavailable for login attempt tracking, using memory: ${(err as Error).message}`,
      );
      this.lastWarn = Date.now();
    }
  }

  private live(key: string): MemoryEntry | undefined {
    const entry = this.memory.get(key);
    if (entry && entry.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return undefined;
    }
    return entry;
  }

  private memGet(key: string): number {
    return this.live(key)?.value ?? 0;
  }

  private memTtl(key: string): number {
    const entry = this.live(key);
    return entry ? entry.expiresAt - Date.now() : -2;
  }

  private memIncr(key: string, ttlMs: number, sliding: boolean): number {
    const entry = this.live(key);
    const value = (entry?.value ?? 0) + 1;
    const expiresAt = entry && !sliding ? entry.expiresAt : Date.now() + ttlMs;
    this.memory.set(key, { value, expiresAt });
    if (this.memory.size > 50_000) this.prune();
    return value;
  }

  private prune(): void {
    const now = Date.now();
    for (const [k, v] of this.memory) if (v.expiresAt <= now) this.memory.delete(k);
  }
}
