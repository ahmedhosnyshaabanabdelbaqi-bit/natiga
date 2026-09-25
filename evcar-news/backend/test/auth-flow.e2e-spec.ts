import { TokenService } from '../src/modules/auth/services/token.service';
import {
  bearer,
  captureMail,
  createAndLogin,
  createUser,
  login,
  refreshCookieOf,
  STRONG_PASSWORD,
  uniqueEmail,
  type MailBox,
} from './auth-test-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

describe('Auth flow: register → verify → login → refresh → logout (e2e)', () => {
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

  it('runs the complete mobile flow with the contract shapes', async () => {
    const email = uniqueEmail('flow');
    const reg = await t
      .http()
      .post('/api/v1/auth/register')
      .send({
        email: `  ${email.toUpperCase()} `,
        password: STRONG_PASSWORD,
        displayName: ' Sara  Ali ',
        locale: 'en',
      })
      .expect(201);
    expect(reg.body.data.user).toEqual({
      id: expect.any(String),
      email,
      displayName: 'Sara Ali',
      emailVerified: false,
      locale: 'en',
      roles: ['user'],
      permissions: [],
      createdAt: expect.any(String),
    });

    // Not verified yet → login refused after a correct password.
    const early = await t
      .http()
      .post('/api/v1/auth/login')
      .send({ email, password: STRONG_PASSWORD })
      .expect(403);
    expect(early.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    const verification = await mail.waitFor(email, 'auth.verify_email');
    expect(verification.subject).toContain('Verify');
    expect(verification.text).toContain('https://evcar.news/verify-email?token=');
    const token = mail.tokenOf(verification);

    const verified = await t.http().post('/api/v1/auth/verify-email').send({ token }).expect(200);
    expect(verified.body).toEqual({ data: { verified: true } });
    // Single use.
    const again = await t.http().post('/api/v1/auth/verify-email').send({ token }).expect(400);
    expect(again.body.error.code).toBe('INVALID_OR_EXPIRED_TOKEN');

    const loginRes = await t
      .http()
      .post('/api/v1/auth/login')
      .send({ email, password: STRONG_PASSWORD, deviceName: 'Pixel 9' })
      .expect(200);
    expect(loginRes.headers['cache-control']).toBe('no-store');
    const first = loginRes.body.data;
    expect(first).toEqual({
      accessToken: expect.any(String),
      accessTokenExpiresIn: 900,
      refreshToken: expect.any(String),
      user: expect.objectContaining({ email, emailVerified: true, roles: ['user'] }),
    });
    expect(refreshCookieOf(loginRes)).toBeUndefined();

    const me = await t
      .http()
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(200);
    expect(me.body.data).toMatchObject({ email, displayName: 'Sara Ali' });

    const refreshed = await t
      .http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(200);
    const second = refreshed.body.data;
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.accessToken).toEqual(expect.any(String));
    expect(second.user.email).toBe(email);

    await t
      .http()
      .post('/api/v1/auth/logout')
      .send({ refreshToken: second.refreshToken })
      .expect(204);

    // The refresh token of the ended session no longer works…
    const afterLogout = await t
      .http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: second.refreshToken })
      .expect(401);
    expect(afterLogout.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    // …and neither does its access token.
    const revoked = await t
      .http()
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .expect(401);
    expect(revoked.body.error.code).toBe('SESSION_REVOKED');
  });

  it('web clients get the refresh token only as an httpOnly SameSite=Strict cookie', async () => {
    const u = await createUser(t);
    const res = await t
      .http()
      .post('/api/v1/auth/login')
      .set('X-Client-Type', 'web')
      .send({ email: u.email, password: u.password })
      .expect(200);
    expect(res.body.data.refreshToken).toBeUndefined();
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    const cookie = refreshCookieOf(res);
    expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(cookie?.attributes).toMatch(/HttpOnly/i);
    expect(cookie?.attributes).toMatch(/SameSite=Strict/i);
    expect(cookie?.attributes).toMatch(/Path=\/api\/v1\/auth/i);
    expect(cookie?.attributes).not.toMatch(/Secure/i); // AUTH_COOKIE_SECURE=false outside production

    // Refresh with the cookie (web) rotates it.
    const refreshed = await t
      .http()
      .post('/api/v1/auth/refresh')
      .set('X-Client-Type', 'web')
      .set('Cookie', `evcar_rt=${cookie!.value}`)
      .send({})
      .expect(200);
    expect(refreshed.body.data.refreshToken).toBeUndefined();
    const rotated = refreshCookieOf(refreshed);
    expect(rotated?.value).toBeDefined();
    expect(rotated?.value).not.toBe(cookie!.value);

    // Without the X-Client-Type header the cookie is ignored (CSRF defence).
    const noHeader = await t
      .http()
      .post('/api/v1/auth/refresh')
      .set('Cookie', `evcar_rt=${rotated!.value}`)
      .send({})
      .expect(401);
    expect(noHeader.body.error.code).toBe('INVALID_REFRESH_TOKEN');

    // Logout clears the cookie and ends the session.
    const out = await t
      .http()
      .post('/api/v1/auth/logout')
      .set('X-Client-Type', 'web')
      .set('Cookie', `evcar_rt=${rotated!.value}`)
      .send({})
      .expect(204);
    const cleared = refreshCookieOf(out);
    expect(cleared?.value).toBe('');
    expect(cleared?.attributes).toMatch(/Expires=Thu, 01 Jan 1970/i);
    await t
      .http()
      .post('/api/v1/auth/refresh')
      .set('X-Client-Type', 'web')
      .set('Cookie', `evcar_rt=${rotated!.value}`)
      .send({})
      .expect(401);
  });

  /** Moves the last rotation of a session out of the grace window. */
  async function leaveGraceWindow(sessionId: string): Promise<void> {
    await t.prisma.userSession.update({
      where: { id: sessionId },
      data: { lastRotatedAt: new Date(Date.now() - 5 * 60_000) },
    });
  }

  const refresh = (token: string) =>
    t.http().post('/api/v1/auth/refresh').send({ refreshToken: token });

  it('detects refresh token reuse and revokes the whole session (token family)', async () => {
    const s = await createAndLogin(t);
    const r1 = await refresh(s.refreshToken).expect(200);
    const current = r1.body.data as { refreshToken: string; accessToken: string };
    await leaveGraceWindow(s.sessionId);

    // The already-rotated token is presented again (e.g. stolen copy).
    const reuse = await refresh(s.refreshToken).expect(401);
    expect(reuse.body.error.code).toBe('REFRESH_TOKEN_REUSED');

    // The legitimate latest token is now dead too, and so is the access token.
    const latest = await refresh(current.refreshToken).expect(401);
    expect(latest.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    const me = await t.http().get('/api/v1/me').set(bearer(current.accessToken)).expect(401);
    expect(me.body.error.code).toBe('SESSION_REVOKED');

    const session = await t.prisma.userSession.findUniqueOrThrow({ where: { id: s.sessionId } });
    expect(session.revokedReason).toBe('refresh_token_reuse');
    const audit = await t.prisma.auditLog.findFirst({
      where: { action: 'auth.refresh_token_reused', entityId: s.sessionId },
    });
    expect(audit).not.toBeNull();
  });

  it('detects reuse of a token rotated several times ago (attacker refreshed twice)', async () => {
    // Reviewer scenario: victim logs in (RT1); attacker refreshes RT1 → RT2 → RT3;
    // the victim then presents RT1.
    const victim = await createAndLogin(t);
    const rt2 = (await refresh(victim.refreshToken).expect(200)).body.data.refreshToken as string;
    const rt3Res = await refresh(rt2).expect(200);
    const rt3 = rt3Res.body.data as { refreshToken: string; accessToken: string };

    const reuse = await refresh(victim.refreshToken).expect(401);
    expect(reuse.body.error.code).toBe('REFRESH_TOKEN_REUSED');
    // The attacker's newest tokens are dead.
    expect((await refresh(rt3.refreshToken).expect(401)).body.error.code).toBe(
      'INVALID_REFRESH_TOKEN',
    );
    await t.http().get('/api/v1/me').set(bearer(rt3.accessToken)).expect(401);
    const session = await t.prisma.userSession.findUniqueOrThrow({
      where: { id: victim.sessionId },
    });
    expect(session.revokedReason).toBe('refresh_token_reuse');
    expect(
      await t.prisma.auditLog.count({
        where: { action: 'auth.refresh_token_reused', entityId: victim.sessionId },
      }),
    ).toBe(1);
    // Every rotated hash of the family is kept (never the raw token).
    const history = await t.prisma.refreshTokenHistory.findMany({
      where: { sessionId: victim.sessionId },
    });
    expect(history).toHaveLength(2);
    for (const h of history) expect(h.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a retry with the previous token inside the grace window returns the same new token', async () => {
    // Lost response on a mobile network: the server rotated, the client never saw it.
    const s = await createAndLogin(t);
    const first = await refresh(s.refreshToken).expect(200);
    const retry = await refresh(s.refreshToken).expect(200);
    expect(retry.body.data.refreshToken).toBe(first.body.data.refreshToken);
    await t
      .http()
      .get('/api/v1/me')
      .set(bearer(retry.body.data.accessToken as string))
      .expect(200);
    // The session is intact and keeps rotating normally.
    const next = await refresh(retry.body.data.refreshToken as string).expect(200);
    expect(next.body.data.refreshToken).not.toBe(retry.body.data.refreshToken);
    const session = await t.prisma.userSession.findUniqueOrThrow({ where: { id: s.sessionId } });
    expect(session.revokedAt).toBeNull();
  });

  it('two concurrent refreshes with the same token both succeed with the same new token', async () => {
    const s = await createAndLogin(t);
    const results = await Promise.all([0, 1].map(() => refresh(s.refreshToken)));
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(results[0].body.data.refreshToken).toBe(results[1].body.data.refreshToken);
    await refresh(results[0].body.data.refreshToken as string).expect(200);
  });

  it('never extends a session beyond JWT_SESSION_MAX_AGE_DAYS', async () => {
    const s = await createAndLogin(t);
    // Pretend the sign-in happened 89 days ago.
    const createdAt = new Date(Date.now() - 89 * 24 * 3600 * 1000);
    await t.prisma.userSession.update({ where: { id: s.sessionId }, data: { createdAt } });
    const res = await refresh(s.refreshToken).expect(200);
    const session = await t.prisma.userSession.findUniqueOrThrow({ where: { id: s.sessionId } });
    expect(session.expiresAt.getTime()).toBe(createdAt.getTime() + 90 * 24 * 3600 * 1000);
    // Past the maximum age the refresh is refused.
    await t.prisma.userSession.update({
      where: { id: s.sessionId },
      data: { createdAt: new Date(Date.now() - 91 * 24 * 3600 * 1000) },
    });
    const late = await refresh(res.body.data.refreshToken as string).expect(401);
    expect(late.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('answers 401 TOKEN_EXPIRED for an expired access token and 401 UNAUTHORIZED for bad ones', async () => {
    const s = await createAndLogin(t);
    const tokens = t.app.get(TokenService);
    const past = new Date(Date.now() - 2 * 3600 * 1000);
    const expired = await tokens.signAccessToken(s.userId, s.sessionId, past);
    const res = await t.http().get('/api/v1/me').set(bearer(expired)).expect(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');

    const tampered = `${s.accessToken.slice(0, -4)}AAAA`;
    const bad = await t.http().get('/api/v1/me').set(bearer(tampered)).expect(401);
    expect(bad.body.error.code).toBe('UNAUTHORIZED');

    const [, payload] = s.accessToken.split('.');
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${payload}.`;
    expect((await t.http().get('/api/v1/me').set(bearer(none)).expect(401)).body.error.code).toBe(
      'UNAUTHORIZED',
    );

    const missing = await t.http().get('/api/v1/me').expect(401);
    expect(missing.body.error.code).toBe('UNAUTHORIZED');

    // The client refreshes once and retries with the new token.
    const refreshed = await t
      .http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: s.refreshToken })
      .expect(200);
    await t
      .http()
      .get('/api/v1/me')
      .set(bearer((refreshed.body.data as { accessToken: string }).accessToken))
      .expect(200);
  });

  it('logout with only an (even expired) access token ends that session', async () => {
    const s = await createAndLogin(t);
    const expired = await t.app
      .get(TokenService)
      .signAccessToken(s.userId, s.sessionId, new Date(Date.now() - 3600 * 1000));
    await t.http().post('/api/v1/auth/logout').set(bearer(expired)).send({}).expect(204);
    const refresh = await t
      .http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: s.refreshToken })
      .expect(401);
    expect(refresh.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    // Unknown tokens are fine too (idempotent).
    await t
      .http()
      .post('/api/v1/auth/logout')
      .send({ refreshToken: 'x'.repeat(43) })
      .expect(204);
  });

  it('resets a forgotten password, signs out everywhere and burns the token', async () => {
    const u = await createUser(t);
    const s = await login(t, u.email, u.password);

    await t.http().post('/api/v1/auth/forgot-password').send({ email: u.email }).expect(202);
    const resetMail = await mail.waitFor(u.email, 'auth.reset_password');
    expect(resetMail.text).toContain('https://evcar.news/reset-password?token=');
    const token = mail.tokenOf(resetMail);

    // A weak password is rejected on the field and does NOT burn the token.
    const weak = await t
      .http()
      .post('/api/v1/auth/reset-password?lang=en')
      .send({ token, password: 'password123' })
      .expect(422);
    expect(weak.body.error.details[0]).toMatchObject({ field: 'password' });

    const newPassword = 'Another-Strong-Pass-99';
    await t
      .http()
      .post('/api/v1/auth/reset-password')
      .send({ token, password: newPassword })
      .expect(204);
    await mail.waitFor(u.email, 'auth.password_changed');

    // Old session gone, old password refused, new one works, token single-use.
    await t.http().get('/api/v1/me').set(bearer(s.accessToken)).expect(401);
    await t
      .http()
      .post('/api/v1/auth/login')
      .send({ email: u.email, password: u.password })
      .expect(401);
    await login(t, u.email, newPassword);
    const reused = await t
      .http()
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'Yet-Another-Pass-77' })
      .expect(400);
    expect(reused.body.error.code).toBe('INVALID_OR_EXPIRED_TOKEN');
    const audit = await t.prisma.auditLog.findFirst({
      where: { action: 'auth.password_reset', entityId: u.id },
    });
    expect(audit?.after).toMatchObject({ sessionsRevoked: 1 });
  });

  it('web forgot-password links to the admin panel', async () => {
    const u = await createUser(t);
    await t
      .http()
      .post('/api/v1/auth/forgot-password')
      .set('X-Client-Type', 'web')
      .send({ email: u.email })
      .expect(202);
    const m = await mail.waitFor(u.email, 'auth.reset_password');
    expect(m.text).toContain(`${t.config.http.adminBaseUrl}/reset-password?token=`);
  });

  it('rejects expired e-mail tokens', async () => {
    const u = await createUser(t, { verified: false });
    await t.http().post('/api/v1/auth/resend-verification').send({ email: u.email }).expect(202);
    const token = mail.tokenOf(await mail.waitFor(u.email, 'auth.verify_email'));
    await t.prisma.emailToken.updateMany({
      where: { userId: u.id },
      data: { createdAt: new Date(Date.now() - 7200_000), expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await t.http().post('/api/v1/auth/verify-email').send({ token }).expect(400);
    expect(res.body.error.code).toBe('INVALID_OR_EXPIRED_TOKEN');
  });
});
