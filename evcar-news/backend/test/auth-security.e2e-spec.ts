import {
  captureMail,
  createUser,
  login,
  STRONG_PASSWORD,
  uniqueEmail,
  type MailBox,
} from './auth-test-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown; requestId: string };
}

describe('Auth security: enumeration, brute force, policy (e2e)', () => {
  let t: TestApp;
  let mail: MailBox;

  beforeAll(async () => {
    t = await createTestApp();
    mail = captureMail(t);
  });
  afterAll(async () => {
    mail?.restore();
    await t?.close();
  });

  const loginAttempt = (email: string, password: string) =>
    t.http().post('/api/v1/auth/login?lang=en').send({ email, password });

  it('answers identically for an unknown e-mail and a wrong password', async () => {
    const u = await createUser(t);
    const wrong = await loginAttempt(u.email, 'Not-The-Password-1');
    const unknown = await loginAttempt(uniqueEmail('ghost'), 'Not-The-Password-1');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    const strip = (b: ErrorBody) => ({ ...b.error, requestId: undefined });
    expect(strip(wrong.body as ErrorBody)).toEqual(strip(unknown.body as ErrorBody));
    expect((wrong.body as ErrorBody).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('does not reveal registered addresses on register / resend / forgot', async () => {
    const existing = await createUser(t, { displayName: 'Owner Of Address' });
    const fresh = uniqueEmail('fresh');
    const body = (email: string) => ({
      email,
      password: STRONG_PASSWORD,
      displayName: 'Someone',
      locale: 'ar',
    });

    const a = await t.http().post('/api/v1/auth/register').send(body(existing.email)).expect(201);
    const b = await t.http().post('/api/v1/auth/register').send(body(fresh)).expect(201);
    const shape = (u: Record<string, unknown>) => Object.keys(u).sort();
    type Reg = { data: { user: Record<string, unknown> } };
    expect(shape((a.body as Reg).data.user)).toEqual(shape((b.body as Reg).data.user));
    expect(a.body.data.user).toMatchObject({ email: existing.email, emailVerified: false });
    // No second account; the real owner is told by e-mail instead.
    expect(await t.prisma.user.count({ where: { email: existing.email } })).toBe(1);
    const notice = await mail.waitFor(existing.email, 'auth.account_exists');
    expect(notice.text).not.toMatch(/token=/);
    await mail.waitFor(fresh, 'auth.verify_email');

    for (const path of ['resend-verification', 'forgot-password']) {
      const known = await t.http().post(`/api/v1/auth/${path}`).send({ email: existing.email });
      const ghost = await t
        .http()
        .post(`/api/v1/auth/${path}`)
        .send({ email: uniqueEmail('x') });
      expect([known.status, ghost.status]).toEqual([202, 202]);
      expect(known.body).toEqual(ghost.body);
    }
  });

  it('answers concurrent sign-ups with one address identically and creates one account', async () => {
    const email = uniqueEmail('race');
    const send = () =>
      t
        .http()
        .post('/api/v1/auth/register')
        .send({ email, password: STRONG_PASSWORD, displayName: 'Racer', locale: 'en' });
    const results = await Promise.all([send(), send(), send()]);
    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(await t.prisma.user.count({ where: { email } })).toBe(1);
  });

  it('locks an address after repeated failures (existing or not) with Retry-After', async () => {
    const u = await createUser(t);
    const ghost = uniqueEmail('ghost-lock');
    for (const email of [u.email, ghost]) {
      for (let i = 0; i < 5; i++) {
        const r = await loginAttempt(email, `Wrong-Password-${i}`);
        expect(r.status).toBe(401);
      }
      const locked = await loginAttempt(email, STRONG_PASSWORD);
      expect(locked.status).toBe(429);
      expect((locked.body as ErrorBody).error.code).toBe('TOO_MANY_ATTEMPTS');
      expect(Number(locked.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    }
    const row = await t.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.failedLoginCount).toBe(5);
    expect(row.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
    const failures = await t.prisma.auditLog.count({
      where: { action: 'auth.login_failed', entityId: u.id },
    });
    expect(failures).toBe(5);
  });

  it('clears the failure counter after a successful login', async () => {
    const u = await createUser(t);
    for (let i = 0; i < 3; i++) await loginAttempt(u.email, 'Wrong-Password-x').expect(401);
    await login(t, u.email, u.password);
    for (let i = 0; i < 3; i++) await loginAttempt(u.email, 'Wrong-Password-y').expect(401);
    await login(t, u.email, u.password); // still below the threshold → not locked
    const row = await t.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.failedLoginCount).toBe(0);
    expect(row.lastLoginAt).not.toBeNull();
  });

  it('enforces the password policy with field errors', async () => {
    const cases: Array<[string, string]> = [
      ['short', 'Ab1!'],
      ['common', 'password123'],
      ['repeated', 'aaaaaaaaaaaa'],
    ];
    for (const [, password] of cases) {
      const res = await t
        .http()
        .post('/api/v1/auth/register?lang=en')
        .send({ email: uniqueEmail('weak'), password, displayName: 'Weak', locale: 'en' })
        .expect(422);
      const details = (res.body as ErrorBody).error.details as { field: string }[];
      expect(details.map((d) => d.field)).toEqual(['password']);
    }
    const email = uniqueEmail('personal');
    const personal = await t
      .http()
      .post('/api/v1/auth/register?lang=en')
      .send({ email, password: `${email}!1`, displayName: 'Personal', locale: 'en' })
      .expect(422);
    expect((personal.body as ErrorBody).error.details).toEqual([
      expect.objectContaining({ field: 'password' }),
    ]);
  });

  it('rejects unknown fields and malformed input (422)', async () => {
    const res = await t
      .http()
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: 'x', isAdmin: true })
      .expect(422);
    const fields = ((res.body as ErrorBody).error.details as { field: string }[])
      .map((d) => d.field)
      .sort();
    expect(fields).toEqual(['email', 'isAdmin']);
  });

  it('refuses suspended accounts at login (after the password) and on existing sessions', async () => {
    const u = await createUser(t);
    const s = await login(t, u.email, u.password);
    await t.prisma.user.update({ where: { id: u.id }, data: { status: 'suspended' } });
    const res = await loginAttempt(u.email, u.password).expect(403);
    expect((res.body as ErrorBody).error.code).toBe('ACCOUNT_DISABLED');
    const me = await t
      .http()
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .expect(401);
    expect((me.body as ErrorBody).error.code).toBe('ACCOUNT_DISABLED');
    const refresh = await t
      .http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: s.refreshToken })
      .expect(401);
    expect((refresh.body as ErrorBody).error.code).toBe('ACCOUNT_DISABLED');
  });

  it('stores only hashes of refresh tokens and e-mail tokens', async () => {
    const u = await createUser(t, { verified: false });
    await t.http().post('/api/v1/auth/resend-verification').send({ email: u.email }).expect(202);
    const token = mail.tokenOf(await mail.waitFor(u.email, 'auth.verify_email'));
    const stored = await t.prisma.emailToken.findFirstOrThrow({ where: { userId: u.id } });
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.tokenHash).not.toContain(token);

    await t.prisma.user.update({ where: { id: u.id }, data: { emailVerifiedAt: new Date() } });
    const s = await login(t, u.email, u.password);
    const session = await t.prisma.userSession.findUniqueOrThrow({ where: { id: s.sessionId } });
    expect(session.refreshTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(session.refreshTokenHash).not.toBe(s.refreshToken);
    expect(session.deviceName).toBe('jest');
    expect(session.clientType).toBe('mobile');
  });

  it('rate-limits resending e-mails per account (cool-down)', async () => {
    const u = await createUser(t, { verified: false });
    await t.http().post('/api/v1/auth/resend-verification').send({ email: u.email }).expect(202);
    await t.http().post('/api/v1/auth/resend-verification').send({ email: u.email }).expect(202);
    await mail.waitFor(u.email, 'auth.verify_email');
    await new Promise((r) => setTimeout(r, 200));
    const count = await t.prisma.emailToken.count({
      where: { userId: u.id, purpose: 'verify_email' },
    });
    expect(count).toBe(1);
  });
});

describe('Auth security behind a proxy: lockout DoS, timing, mail content (e2e)', () => {
  // TRUST_PROXY=1 lets the tests present different client IPs (X-Forwarded-For)
  // exactly like the shipped nginx / Vite proxies do.
  let t: TestApp;
  let mail: MailBox;
  const FLOOR_MS = 300;

  beforeAll(async () => {
    t = await createTestApp({
      env: { TRUST_PROXY: '1', AUTH_UNIFORM_RESPONSE_MS: String(FLOOR_MS) },
    });
    mail = captureMail(t);
  });
  afterAll(async () => {
    mail?.restore();
    await t?.close();
  });

  const loginFrom = (ip: string, email: string, password: string) =>
    t.http().post('/api/v1/auth/login').set('X-Forwarded-For', ip).send({ email, password });

  it('anonymous failures cannot lock the owner out of a device/IP that signed in before', async () => {
    const owner = await createUser(t, { roles: ['owner', 'user'] });
    // The owner signs in once from the office IP (becomes a known client).
    await loginFrom('198.51.100.10', owner.email, owner.password).expect(200);

    // An anonymous attacker triggers the account-wide lock from other IPs.
    for (let i = 0; i < 6; i++) {
      await loginFrom(`203.0.113.${i + 1}`, owner.email, `Wrong-Password-${i}`);
    }
    // The attacker (and any unknown client) is refused, even with the right password.
    const unknown = await loginFrom('203.0.113.200', owner.email, owner.password).expect(429);
    expect((unknown.body as ErrorBody).error.code).toBe('TOO_MANY_ATTEMPTS');
    // The owner still gets in from the known IP with the right password…
    await loginFrom('198.51.100.10', owner.email, owner.password).expect(200);
    // …and a wrong password from the known IP is still just a wrong password.
    await loginFrom('198.51.100.10', owner.email, 'Still-Wrong-1').expect(401);
  });

  it('a web browser that signed in before is recognised by its device cookie from a new IP', async () => {
    const admin = await createUser(t, { roles: ['admin', 'user'] });
    const first = await t
      .http()
      .post('/api/v1/auth/login')
      .set('X-Client-Type', 'web')
      .set('X-Forwarded-For', '198.51.100.20')
      .send({ email: admin.email, password: admin.password })
      .expect(200);
    const setCookie = ([] as string[]).concat(first.headers['set-cookie'] ?? []);
    const device = setCookie.find((c) => c.startsWith('evcar_dev='));
    expect(device).toMatch(/HttpOnly/i);
    expect(device).toMatch(/SameSite=Strict/i);
    expect(device).toMatch(/Path=\/api\/v1\/auth/i);
    const deviceValue = /^evcar_dev=([^;]+)/.exec(device!)![1];

    for (let i = 0; i < 6; i++) {
      await loginFrom(`203.0.113.${50 + i}`, admin.email, `Wrong-Password-${i}`);
    }
    // An unknown device from a new IP is refused during the lock…
    await t
      .http()
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '192.0.2.78')
      .set('X-Device-Id', 'unknown-device-0000000000')
      .send({ email: admin.email, password: admin.password })
      .expect(429);
    // …the same browser from a new IP (e.g. mobile hotspot) is not.
    await t
      .http()
      .post('/api/v1/auth/login')
      .set('X-Client-Type', 'web')
      .set('X-Forwarded-For', '192.0.2.77')
      .set('Cookie', `evcar_dev=${deviceValue}`)
      .send({ email: admin.email, password: admin.password })
      .expect(200);
  });

  it('a mobile installation id (X-Device-Id) that signed in before is recognised from a new IP', async () => {
    const u = await createUser(t);
    const deviceId = 'install-0123456789abcdef';
    await t
      .http()
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '198.51.100.30')
      .set('X-Device-Id', deviceId)
      .send({ email: u.email, password: u.password })
      .expect(200);
    for (let i = 0; i < 6; i++) {
      await loginFrom(`203.0.113.${80 + i}`, u.email, `Wrong-Password-${i}`);
    }
    await t
      .http()
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '100.64.9.9')
      .set('X-Device-Id', deviceId)
      .send({ email: u.email, password: u.password })
      .expect(200);
  });

  it('pads register / resend / forgot to the same minimum duration', async () => {
    const existing = await createUser(t);
    const timed = async (fn: () => Promise<unknown>) => {
      const start = performance.now();
      await fn();
      return performance.now() - start;
    };
    const reg = (email: string) => () =>
      t
        .http()
        .post('/api/v1/auth/register')
        .set('X-Forwarded-For', '192.0.2.10')
        .send({ email, password: STRONG_PASSWORD, displayName: 'Someone', locale: 'en' })
        .expect(201);
    const forgot = (email: string) => () =>
      t
        .http()
        .post('/api/v1/auth/forgot-password')
        .set('X-Forwarded-For', '192.0.2.11')
        .send({ email })
        .expect(202);
    for (const d of [
      await timed(reg(existing.email)),
      await timed(reg(uniqueEmail('timing'))),
      await timed(forgot(existing.email)),
      await timed(forgot(uniqueEmail('timing-ghost'))),
    ]) {
      expect(d).toBeGreaterThanOrEqual(FLOOR_MS - 5);
    }
  });

  it('never puts the user-chosen display name into e-mails', async () => {
    const victim = uniqueEmail('victim-inbox');
    const phishing = 'your account is locked. Restore it at https://evcar-news-support.example now';
    await t
      .http()
      .post('/api/v1/auth/register')
      .set('X-Forwarded-For', '192.0.2.12')
      .send({ email: victim, password: STRONG_PASSWORD, displayName: phishing, locale: 'en' })
      .expect(201);
    const verify = await mail.waitFor(victim, 'auth.verify_email');
    expect(verify.text).not.toContain('evcar-news-support');
    expect(verify.html).not.toContain('evcar-news-support');
    expect(verify.text.startsWith('Hello,')).toBe(true);
    // Same for the reset mail and the "account exists" notice to that address.
    await t
      .http()
      .post('/api/v1/auth/forgot-password')
      .set('X-Forwarded-For', '192.0.2.13')
      .send({ email: victim })
      .expect(202);
    expect((await mail.waitFor(victim, 'auth.reset_password')).text).not.toContain(
      'evcar-news-support',
    );
    await t
      .http()
      .post('/api/v1/auth/register')
      .set('X-Forwarded-For', '192.0.2.14')
      .send({ email: victim, password: STRONG_PASSWORD, displayName: 'x', locale: 'en' })
      .expect(201);
  });
});
