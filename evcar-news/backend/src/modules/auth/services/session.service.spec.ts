import { AppException } from '../../../common/errors/app.exception';
import { hashToken } from '../../../common/security/tokens';
import { AppConfig } from '../../../config/app-config';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { AuditService } from '../../audit/audit.service';
import { SessionService } from './session.service';

interface Row {
  id: string;
  userId: string;
  refreshTokenHash: string;
  previousRefreshTokenHash: string | null;
  clientType: string;
  deviceName: string | null;
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  lastRotatedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
}

type Where = Partial<Record<keyof Row, unknown>> & { id?: unknown };

/** Minimal in-memory user_sessions + refresh_token_history with the semantics SessionService relies on. */
function fakePrisma(userStatus: () => string = () => 'active') {
  const rows: Row[] = [];
  const history: { tokenHash: string; sessionId: string; rotatedAt: Date }[] = [];
  let seq = 0;
  const matches = (row: Row, where: Where) =>
    Object.entries(where).every(([k, v]) => {
      const value = row[k as keyof Row];
      if (v && typeof v === 'object' && 'not' in v) return value !== v.not;
      if (v && typeof v === 'object' && 'gt' in v) {
        return (value as Date) > (v as { gt: Date }).gt;
      }
      return value === v;
    });
  const withUser = (row: Row | undefined) =>
    row ? { ...row, user: { status: userStatus() } } : null;
  const userSession = {
    create: jest.fn(({ data }: { data: Partial<Row> }) => {
      const defaults: Omit<Row, 'userId' | 'refreshTokenHash' | 'expiresAt'> = {
        id: `s${++seq}`,
        previousRefreshTokenHash: null,
        clientType: 'mobile',
        deviceName: null,
        userAgent: null,
        ip: null,
        createdAt: new Date(),
        lastUsedAt: new Date(),
        lastRotatedAt: null,
        revokedAt: null,
        revokedReason: null,
      };
      const row = Object.assign(defaults, data) as Row;
      rows.push(row);
      return Promise.resolve({ id: row.id });
    }),
    findUnique: jest.fn(({ where }: { where: Where }) =>
      Promise.resolve(withUser(rows.find((r) => matches(r, where)))),
    ),
    findFirst: jest.fn(({ where }: { where: Where }) =>
      Promise.resolve(withUser(rows.find((r) => matches(r, where)))),
    ),
    updateMany: jest.fn(({ where, data }: { where: Where; data: Partial<Row> }) => {
      const hit = rows.filter((r) => matches(r, where));
      for (const r of hit) Object.assign(r, data);
      return Promise.resolve({ count: hit.length });
    }),
  };
  const refreshTokenHistory = {
    create: jest.fn(({ data }: { data: (typeof history)[number] }) => {
      if (history.some((h) => h.tokenHash === data.tokenHash)) {
        return Promise.reject(new Error('duplicate key'));
      }
      history.push(data);
      return Promise.resolve(data);
    }),
    findUnique: jest.fn(({ where }: { where: { tokenHash: string } }) => {
      const h = history.find((x) => x.tokenHash === where.tokenHash);
      const session = h && withUser(rows.find((r) => r.id === h.sessionId));
      return Promise.resolve(session ? { session } : null);
    }),
  };
  const client = { userSession, refreshTokenHistory };
  const $transaction = jest.fn((fn: (tx: typeof client) => Promise<unknown>) => fn(client));
  return {
    rows,
    history,
    prisma: { ...client, $transaction } as unknown as PrismaService,
  };
}

function setup(userStatus?: () => string, env: Record<string, string> = {}) {
  const { rows, history, prisma } = fakePrisma(userStatus);
  const audit = { recordSafe: jest.fn(() => Promise.resolve()) };
  const config = AppConfig.fromEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://x:y@localhost:5432/unit',
    JWT_REFRESH_TTL_DAYS: '30',
    JWT_SESSION_MAX_AGE_DAYS: '90',
    AUTH_REFRESH_REUSE_GRACE_SECONDS: '60',
    ...env,
  });
  const service = new SessionService(prisma, config, audit as unknown as AuditService);
  return { service, rows, history, audit };
}

/** Moves the last rotation of a session `ms` into the past (leaves the grace window). */
function ageRotation(rows: Row[], sessionId: string, ms: number) {
  const row = rows.find((r) => r.id === sessionId)!;
  row.lastRotatedAt = new Date(row.lastRotatedAt!.getTime() - ms);
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof AppException) return `${err.getStatus()} ${err.code}`;
    throw err;
  }
  throw new Error('expected rejection');
}

describe('SessionService (refresh token rotation)', () => {
  it('stores only the SHA-256 of the refresh token', async () => {
    const { service, rows } = setup();
    const issued = await service.create('u1', { clientType: 'mobile', deviceName: ' Pixel ' });
    expect(rows[0].refreshTokenHash).toBe(hashToken(issued.refreshToken));
    expect(rows[0].refreshTokenHash).not.toContain(issued.refreshToken);
    expect(rows[0].deviceName).toBe('Pixel');
    expect(issued.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 24 * 3600 * 1000);
  });

  it('rotates: new token works, the old hash moves to previous_refresh_token_hash', async () => {
    const { service, rows } = setup();
    const first = await service.create('u1', { clientType: 'mobile' });
    const second = await service.rotate(first.refreshToken, { ip: '10.0.0.1' });
    expect(second.sessionId).toBe(first.sessionId);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(rows[0]).toMatchObject({
      refreshTokenHash: hashToken(second.refreshToken),
      previousRefreshTokenHash: hashToken(first.refreshToken),
      ip: '10.0.0.1',
    });
    const third = await service.rotate(second.refreshToken, {});
    expect(third.userId).toBe('u1');
  });

  it('detects reuse of a rotated token (after the grace window) and revokes the whole session', async () => {
    const { service, rows, audit } = setup();
    const first = await service.create('u1', { clientType: 'mobile' });
    const second = await service.rotate(first.refreshToken, {});
    ageRotation(rows, first.sessionId, 61_000);

    expect(await codeOf(service.rotate(first.refreshToken, {}))).toBe('401 REFRESH_TOKEN_REUSED');
    expect(rows[0].revokedAt).toBeInstanceOf(Date);
    expect(rows[0].revokedReason).toBe('refresh_token_reuse');
    expect(audit.recordSafe).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.refresh_token_reused', entityId: first.sessionId }),
    );
    // The legitimate newest token dies with the family.
    expect(await codeOf(service.rotate(second.refreshToken, {}))).toBe('401 INVALID_REFRESH_TOKEN');
  });

  it('detects reuse of ANY older token of the family, however many rotations ago', async () => {
    // Attacker steals RT1 and rotates twice; the victim then presents RT1.
    const { service, rows, history, audit } = setup();
    const rt1 = await service.create('u1', { clientType: 'mobile' });
    const rt2 = await service.rotate(rt1.refreshToken, {});
    const rt3 = await service.rotate(rt2.refreshToken, {});
    expect(history.map((h) => h.tokenHash)).toEqual([
      hashToken(rt1.refreshToken),
      hashToken(rt2.refreshToken),
    ]);

    // Still inside the grace window, but RT1 is not the immediately previous token.
    expect(await codeOf(service.rotate(rt1.refreshToken, {}))).toBe('401 REFRESH_TOKEN_REUSED');
    expect(rows[0].revokedReason).toBe('refresh_token_reuse');
    expect(audit.recordSafe).toHaveBeenCalledTimes(1);
    // The attacker's newest token is dead too.
    expect(await codeOf(service.rotate(rt3.refreshToken, {}))).toBe('401 INVALID_REFRESH_TOKEN');
  });

  it('grace window: a retry with the previous token returns the SAME successor', async () => {
    const { service, rows, audit } = setup();
    const first = await service.create('u1', { clientType: 'mobile' });
    const second = await service.rotate(first.refreshToken, {});
    // The response carrying `second` was lost; the client retries with `first`.
    const retry = await service.rotate(first.refreshToken, {});
    expect(retry.refreshToken).toBe(second.refreshToken);
    expect(retry.expiresAt).toEqual(second.expiresAt);
    expect(rows[0].revokedAt).toBeNull();
    expect(audit.recordSafe).not.toHaveBeenCalled();
    // The successor keeps working normally.
    const third = await service.rotate(retry.refreshToken, {});
    expect(third.refreshToken).not.toBe(second.refreshToken);
  });

  it('grace window ends once the successor has been used', async () => {
    const { service, rows } = setup();
    const first = await service.create('u1', { clientType: 'mobile' });
    const second = await service.rotate(first.refreshToken, {});
    await service.rotate(second.refreshToken, {});
    // `first` is no longer the immediately previous token.
    expect(await codeOf(service.rotate(first.refreshToken, {}))).toBe('401 REFRESH_TOKEN_REUSED');
    expect(rows[0].revokedReason).toBe('refresh_token_reuse');
  });

  it('strict mode (grace 0) treats any replay as reuse', async () => {
    const { service, rows } = setup(undefined, { AUTH_REFRESH_REUSE_GRACE_SECONDS: '0' });
    const first = await service.create('u1', { clientType: 'mobile' });
    await service.rotate(first.refreshToken, {});
    expect(await codeOf(service.rotate(first.refreshToken, {}))).toBe('401 REFRESH_TOKEN_REUSED');
    expect(rows[0].revokedReason).toBe('refresh_token_reuse');
  });

  it('concurrent refreshes with one token both get the same successor', async () => {
    const { service, rows } = setup();
    const first = await service.create('u1', { clientType: 'mobile' });
    const results = await Promise.all([
      service.rotate(first.refreshToken, {}),
      service.rotate(first.refreshToken, {}),
    ]);
    expect(results[0].refreshToken).toBe(results[1].refreshToken);
    expect(rows[0].revokedAt).toBeNull();
    expect(rows[0].refreshTokenHash).toBe(hashToken(results[0].refreshToken));
  });

  it('never extends a session beyond JWT_SESSION_MAX_AGE_DAYS', async () => {
    const { service, rows } = setup();
    const s = await service.create('u1', { clientType: 'mobile' });
    const row = rows.find((r) => r.id === s.sessionId)!;
    // Signed in 80 days ago: the sliding 30 days are capped at day 90.
    row.createdAt = new Date(Date.now() - 80 * 24 * 3600 * 1000);
    const next = await service.rotate(s.refreshToken, {});
    expect(next.expiresAt.getTime()).toBe(row.createdAt.getTime() + 90 * 24 * 3600 * 1000);

    // Signed in 91 days ago (e.g. the limit was lowered): refresh refused.
    row.createdAt = new Date(Date.now() - 91 * 24 * 3600 * 1000);
    expect(await codeOf(service.rotate(next.refreshToken, {}))).toBe('401 INVALID_REFRESH_TOKEN');
  });

  it('a new session never outlives the maximum age', async () => {
    const { service } = setup(undefined, {
      JWT_REFRESH_TTL_DAYS: '30',
      JWT_SESSION_MAX_AGE_DAYS: '7',
    });
    const s = await service.create('u1', { clientType: 'mobile' });
    const days = (s.expiresAt.getTime() - Date.now()) / (24 * 3600 * 1000);
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThanOrEqual(7);
  });

  it('rejects unknown, malformed, revoked and expired tokens', async () => {
    const { service, rows } = setup();
    expect(await codeOf(service.rotate(undefined, {}))).toBe('401 INVALID_REFRESH_TOKEN');
    expect(await codeOf(service.rotate('short', {}))).toBe('401 INVALID_REFRESH_TOKEN');
    expect(await codeOf(service.rotate('x'.repeat(43), {}))).toBe('401 INVALID_REFRESH_TOKEN');

    const revoked = await service.create('u1', { clientType: 'mobile' });
    await service.revoke(revoked.sessionId, 'logout');
    expect(await codeOf(service.rotate(revoked.refreshToken, {}))).toBe(
      '401 INVALID_REFRESH_TOKEN',
    );

    const expired = await service.create('u1', { clientType: 'mobile' });
    rows.find((r) => r.id === expired.sessionId)!.expiresAt = new Date(Date.now() - 1000);
    expect(await codeOf(service.rotate(expired.refreshToken, {}))).toBe(
      '401 INVALID_REFRESH_TOKEN',
    );
  });

  it('revokes the session when the account is disabled', async () => {
    let status = 'active';
    const { service, rows } = setup(() => status);
    const s = await service.create('u1', { clientType: 'web' });
    status = 'suspended';
    expect(await codeOf(service.rotate(s.refreshToken, {}))).toBe('401 ACCOUNT_DISABLED');
    expect(rows[0].revokedReason).toBe('account_disabled');
  });

  it('revokes only sessions owned by the given user', async () => {
    const { service } = setup();
    const mine = await service.create('u1', { clientType: 'mobile' });
    expect(await service.revokeOwned('u2', mine.sessionId, 'user_revoked')).toBe(false);
    expect(await service.revokeOwned('u1', mine.sessionId, 'user_revoked')).toBe(true);
    expect(await service.revokeOwned('u1', mine.sessionId, 'user_revoked')).toBe(false);
  });
});
