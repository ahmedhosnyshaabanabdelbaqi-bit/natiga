import {
  bearer,
  captureMail,
  createAndLogin,
  createUser,
  login,
  STRONG_PASSWORD,
  type LoggedIn,
  type MailBox,
} from './auth-test-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

describe('/me: profile, sessions, password change, account deletion (e2e)', () => {
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

  it('reads and updates the profile (only displayName / locale)', async () => {
    const s = await createAndLogin(t);
    const me = await t.http().get('/api/v1/me').set(bearer(s.accessToken)).expect(200);
    expect(me.body.data).toEqual({
      id: s.userId,
      email: s.email,
      displayName: expect.any(String),
      emailVerified: true,
      locale: 'en',
      roles: ['user'],
      permissions: [],
      createdAt: expect.any(String),
    });
    const patched = await t
      .http()
      .patch('/api/v1/me')
      .set(bearer(s.accessToken))
      .send({ displayName: '  New   Name ', locale: 'ar' })
      .expect(200);
    expect(patched.body.data).toMatchObject({ displayName: 'New Name', locale: 'ar' });

    // Cannot change e-mail / roles through PATCH /me.
    const bad = await t
      .http()
      .patch('/api/v1/me')
      .set(bearer(s.accessToken))
      .send({ email: 'x@example.com', roles: ['owner'] })
      .expect(422);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
    await t
      .http()
      .patch('/api/v1/me')
      .set(bearer(s.accessToken))
      .send({ displayName: '' })
      .expect(422);
  });

  it('lists sessions (current flagged) and revokes another device', async () => {
    const u = await createUser(t);
    const phone = await login(t, u.email, u.password, 'Phone');
    const laptop = await login(t, u.email, u.password, 'Laptop');
    const list = await t
      .http()
      .get('/api/v1/me/sessions')
      .set(bearer(phone.accessToken))
      .expect(200);
    const sessions = list.body.data as {
      id: string;
      deviceName: string;
      current: boolean;
      clientType: string;
    }[];
    expect(sessions).toHaveLength(2);
    expect(sessions.find((x) => x.id === phone.sessionId)).toMatchObject({
      deviceName: 'Phone',
      current: true,
      clientType: 'mobile',
    });
    expect(sessions.find((x) => x.id === laptop.sessionId)?.current).toBe(false);
    expect(Object.keys(sessions[0]).sort()).toEqual(
      [
        'clientType',
        'createdAt',
        'current',
        'deviceName',
        'expiresAt',
        'id',
        'ip',
        'lastUsedAt',
        'userAgent',
      ].sort(),
    );

    await t
      .http()
      .delete(`/api/v1/me/sessions/${laptop.sessionId}`)
      .set(bearer(phone.accessToken))
      .expect(204);
    const revoked = await t.http().get('/api/v1/me').set(bearer(laptop.accessToken)).expect(401);
    expect(revoked.body.error.code).toBe('SESSION_REVOKED');
    await t
      .http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: laptop.refreshToken })
      .expect(401);
    await t.http().get('/api/v1/me').set(bearer(phone.accessToken)).expect(200);
  });

  it("cannot revoke another user's session (404)", async () => {
    const a = await createAndLogin(t);
    const b = await createAndLogin(t);
    const res = await t
      .http()
      .delete(`/api/v1/me/sessions/${b.sessionId}`)
      .set(bearer(a.accessToken))
      .expect(404);
    expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
    await t.http().get('/api/v1/me').set(bearer(b.accessToken)).expect(200);
    const listA = await t.http().get('/api/v1/me/sessions').set(bearer(a.accessToken)).expect(200);
    expect((listA.body.data as { id: string }[]).map((x) => x.id)).toEqual([a.sessionId]);
  });

  it('changes the password (re-auth) and signs out the other sessions', async () => {
    const u = await createUser(t);
    const current = await login(t, u.email, u.password, 'current');
    const other = await login(t, u.email, u.password, 'other');

    const wrong = await t
      .http()
      .post('/api/v1/me/password')
      .set(bearer(current.accessToken))
      .send({ currentPassword: 'Wrong-Pass-000', newPassword: 'Brand-New-Pass-42' })
      .expect(422);
    expect(wrong.body.error.details[0].field).toBe('currentPassword');
    const weak = await t
      .http()
      .post('/api/v1/me/password')
      .set(bearer(current.accessToken))
      .send({ currentPassword: u.password, newPassword: '12345678' })
      .expect(422);
    expect(weak.body.error.details[0].field).toBe('newPassword');

    await t
      .http()
      .post('/api/v1/me/password')
      .set(bearer(current.accessToken))
      .send({ currentPassword: u.password, newPassword: 'Brand-New-Pass-42' })
      .expect(204);
    await mail.waitFor(u.email, 'auth.password_changed');
    await t.http().get('/api/v1/me').set(bearer(current.accessToken)).expect(200);
    await t.http().get('/api/v1/me').set(bearer(other.accessToken)).expect(401);
    await login(t, u.email, 'Brand-New-Pass-42');
    const audit = await t.prisma.auditLog.findFirst({
      where: { action: 'auth.password_changed', entityId: u.id },
    });
    expect(audit).toMatchObject({ actorId: u.id, actorLabel: u.email });
  });

  describe('DELETE /me', () => {
    async function seedPersonalData(user: LoggedIn) {
      await t.prisma.userPreference.create({ data: { userId: user.userId } });
      await t.prisma.notificationPreference.create({ data: { userId: user.userId } });
      await t.prisma.notification.create({
        data: { userId: user.userId, type: 'test', title: 'hello', locale: 'en' },
      });
      await t.prisma.reminder.create({
        data: {
          userId: user.userId,
          type: 'insurance',
          title: 'Renew insurance',
          dueDate: new Date('2030-01-01'),
        },
      });
      await t.prisma.deviceToken.create({
        data: {
          userId: user.userId,
          token: `tok-${user.userId}`,
          platform: 'android',
          provider: 'fcm',
        },
      });
      const q = await t.prisma.question.create({
        data: { userId: user.userId, title: `Question by ${user.email}`, locale: 'en' },
      });
      await t.prisma.answer.create({
        data: { userId: user.userId, questionId: q.id, body: 'An answer' },
      });
      return q.id;
    }

    const personalCounts = async (userId: string) => ({
      preferences: await t.prisma.userPreference.count({ where: { userId } }),
      notificationPrefs: await t.prisma.notificationPreference.count({ where: { userId } }),
      notifications: await t.prisma.notification.count({ where: { userId } }),
      reminders: await t.prisma.reminder.count({ where: { userId } }),
      deviceTokens: await t.prisma.deviceToken.count({ where: { userId } }),
      sessions: await t.prisma.userSession.count({ where: { userId } }),
      roles: await t.prisma.userRole.count({ where: { userId } }),
    });

    it('requires the password (wrong → 422 on "password", nothing deleted)', async () => {
      const s = await createAndLogin(t);
      const res = await t
        .http()
        .delete('/api/v1/me')
        .set(bearer(s.accessToken))
        .send({ password: 'Not-My-Password-1' })
        .expect(422);
      expect(res.body.error.details[0].field).toBe('password');
      expect(await t.prisma.user.count({ where: { id: s.userId } })).toBe(1);
    });

    it("deletes only the caller's personal data and anonymizes public contributions", async () => {
      const a = await createAndLogin(t);
      const b = await createAndLogin(t);
      const questionA = await seedPersonalData(a);
      const questionB = await seedPersonalData(b);
      const beforeB = await personalCounts(b.userId);

      await t
        .http()
        .delete('/api/v1/me')
        .set(bearer(a.accessToken))
        .send({ password: STRONG_PASSWORD })
        .expect(204);

      expect(await t.prisma.user.count({ where: { id: a.userId } })).toBe(0);
      expect(await personalCounts(a.userId)).toEqual({
        preferences: 0,
        notificationPrefs: 0,
        notifications: 0,
        reminders: 0,
        deviceTokens: 0,
        sessions: 0,
        roles: 0,
      });
      // Public contributions stay, without an author.
      const q = await t.prisma.question.findUniqueOrThrow({ where: { id: questionA } });
      expect(q.userId).toBeNull();
      expect(await t.prisma.answer.count({ where: { questionId: questionA, userId: null } })).toBe(
        1,
      );
      // B is untouched and still signed in.
      expect(await personalCounts(b.userId)).toEqual(beforeB);
      expect((await t.prisma.question.findUniqueOrThrow({ where: { id: questionB } })).userId).toBe(
        b.userId,
      );
      await t.http().get('/api/v1/me').set(bearer(b.accessToken)).expect(200);

      // A's tokens are dead; the deletion is audited without personal data.
      await t.http().get('/api/v1/me').set(bearer(a.accessToken)).expect(401);
      await t
        .http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: a.refreshToken })
        .expect(401);
      const audit = await t.prisma.auditLog.findFirstOrThrow({
        where: { action: 'auth.account_deleted', entityId: a.userId },
      });
      expect(audit.actorId).toBeNull();
      expect(audit.actorLabel).toBeNull();
      // Not a staff account: the deleting request's IP / user agent are not kept either.
      expect(audit.ip).toBeNull();
      expect(audit.userAgent).toBeNull();
      const leftovers = await t.prisma.auditLog.count({
        where: { actorLabel: a.email },
      });
      expect(leftovers).toBe(0);
      // The address can register again.
      await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: a.email, password: STRONG_PASSWORD })
        .expect(401);
    });

    it('refuses to delete the last owner (409 LAST_OWNER)', async () => {
      // Remove owners from other tests, then create exactly one.
      await t.prisma.userRole.deleteMany({ where: { role: { key: 'owner' } } });
      const owner = await createAndLogin(t, ['owner', 'user']);
      const res = await t
        .http()
        .delete('/api/v1/me')
        .set(bearer(owner.accessToken))
        .send({ password: STRONG_PASSWORD })
        .expect(409);
      expect(res.body.error.code).toBe('LAST_OWNER');
      // With a second owner it works.
      await createUser(t, { roles: ['owner', 'user'] });
      await t
        .http()
        .delete('/api/v1/me')
        .set(bearer(owner.accessToken))
        .send({ password: STRONG_PASSWORD })
        .expect(204);
    });
  });
});
