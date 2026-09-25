import { createOwnerSetup, ownerSetupLink } from '../src/cli/owner-setup';
import { hashToken } from '../src/common/security/tokens';
import { bearer, createUser, login, STRONG_PASSWORD } from './auth-test-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

/**
 * `npm run create-owner -- --email x` (src/cli/create-owner.ts) issues a
 * one-time setup token that is redeemed through POST /auth/reset-password.
 */
describe('create-owner setup token → reset-password (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.close();
  });

  it('creates an owner without any password until the setup link is used', async () => {
    const result = await createOwnerSetup(t.prisma, '  Boss@Example.com ', 'The Boss');
    expect(result).toMatchObject({ email: 'boss@example.com', created: true });

    const user = await t.prisma.user.findUniqueOrThrow({
      where: { id: result.userId },
      include: { roles: { include: { role: true } } },
    });
    expect(user.passwordHash).toBeNull();
    expect(user.roles.map((r) => r.role.key).sort()).toEqual(['owner', 'user']);
    const stored = await t.prisma.emailToken.findFirstOrThrow({
      where: { userId: user.id, purpose: 'setup_password' },
    });
    expect(stored.tokenHash).toBe(hashToken(result.token));

    // No password works before setup.
    await t
      .http()
      .post('/api/v1/auth/login')
      .send({ email: 'boss@example.com', password: STRONG_PASSWORD })
      .expect(401);

    await t
      .http()
      .post('/api/v1/auth/reset-password')
      .send({ token: result.token, password: STRONG_PASSWORD })
      .expect(204);
    const s = await login(t, 'boss@example.com');
    const me = await t.http().get('/api/v1/me').set(bearer(s.accessToken)).expect(200);
    expect(me.body.data.roles).toEqual(['owner', 'user']);
    expect(me.body.data.permissions).toEqual(expect.arrayContaining(['users.manage_admins']));
    await t.http().get('/api/v1/admin/roles').set(bearer(s.accessToken)).expect(200);
    const audit = await t.prisma.auditLog.findFirst({
      where: { action: 'auth.password_setup', entityId: user.id },
    });
    expect(audit).not.toBeNull();

    // The link is single-use.
    await t
      .http()
      .post('/api/v1/auth/reset-password')
      .send({ token: result.token, password: 'Another-Owner-Pass-1' })
      .expect(400);
  });

  it('promotes an existing account; a newer link invalidates the older one', async () => {
    const existing = await createUser(t);
    const first = await createOwnerSetup(t.prisma, existing.email);
    const second = await createOwnerSetup(t.prisma, existing.email);
    expect([first.created, second.created]).toEqual([false, false]);

    // Existing password keeps working and the account is now an owner.
    const s = await login(t, existing.email, existing.password);
    const me = await t.http().get('/api/v1/me').set(bearer(s.accessToken)).expect(200);
    expect(me.body.data.roles).toContain('owner');

    const stale = await t
      .http()
      .post('/api/v1/auth/reset-password')
      .send({ token: first.token, password: 'Owner-New-Pass-123' })
      .expect(400);
    expect(stale.body.error.code).toBe('INVALID_OR_EXPIRED_TOKEN');
    await t
      .http()
      .post('/api/v1/auth/reset-password')
      .send({ token: second.token, password: 'Owner-New-Pass-123' })
      .expect(204);
    // Setting the password signs out existing sessions.
    await t.http().get('/api/v1/me').set(bearer(s.accessToken)).expect(401);
    await login(t, existing.email, 'Owner-New-Pass-123');
  });

  it('re-activates a suspended account, audits the CLI action and links to /setup-password', async () => {
    const existing = await createUser(t);
    await t.prisma.user.update({ where: { id: existing.id }, data: { status: 'suspended' } });
    const result = await createOwnerSetup(t.prisma, existing.email);
    expect(result).toMatchObject({ created: false, reactivated: true });
    const user = await t.prisma.user.findUniqueOrThrow({ where: { id: existing.id } });
    expect(user.status).toBe('active');
    await login(t, existing.email, existing.password);
    const audit = await t.prisma.auditLog.findFirstOrThrow({
      where: { action: 'auth.owner_setup_issued', entityId: existing.id },
    });
    expect(audit.actorLabel).toBe('cli:create-owner');
    expect(JSON.stringify(audit.after)).not.toContain(result.token);
    expect(ownerSetupLink('https://admin.evcar.news/', 'a b')).toBe(
      'https://admin.evcar.news/setup-password?token=a%20b',
    );
  });
});
