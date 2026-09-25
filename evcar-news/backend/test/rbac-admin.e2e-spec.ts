import { Controller, Get, Module, Post } from '@nestjs/common';
import { ok } from '../src/common/http/responses';
import { CurrentUser, Public, type AuthUser } from '../src/modules/auth';
import { RequireAnyPermission, RequirePermissions } from '../src/modules/rbac';
import { bearer, createAndLogin, createUser, login, type LoggedIn } from './auth-test-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

/** Test-only routes exercising the guards the way feature modules use them. */
@Controller()
class GuardProbeController {
  @Public()
  @Get('__rbac/public')
  publicRoute(@CurrentUser() user: AuthUser | undefined) {
    return ok({ userId: user?.id ?? null });
  }

  @Get('__rbac/private')
  privateRoute(@CurrentUser('id') userId: string) {
    return ok({ userId });
  }

  @Get('admin/__rbac/unguarded')
  unguarded() {
    return ok(true);
  }

  @RequireAnyPermission('articles.publish', 'stations.publish')
  @Get('admin/__rbac/any')
  any() {
    return ok(true);
  }

  @RequirePermissions('articles.read')
  @Post('admin/__rbac/both')
  both() {
    return ok(true);
  }
}

@RequirePermissions('articles.create')
@Controller('admin/__rbac/class')
class ClassLevelController {
  @RequirePermissions('articles.publish')
  @Post()
  publish() {
    return ok(true);
  }
}

@Module({ controllers: [GuardProbeController, ClassLevelController] })
class GuardProbeModule {}

describe('RBAC: guards, admin users, roles (e2e)', () => {
  let t: TestApp;
  let owner: LoggedIn;
  let admin: LoggedIn;
  let moderator: LoggedIn;
  let editor: LoggedIn;
  let normal: LoggedIn;

  beforeAll(async () => {
    t = await createTestApp({ imports: [GuardProbeModule] });
    owner = await createAndLogin(t, ['owner', 'user']);
    admin = await createAndLogin(t, ['admin', 'user']);
    moderator = await createAndLogin(t, ['community_moderator', 'user']);
    editor = await createAndLogin(t, ['editor', 'user']);
    normal = await createAndLogin(t, ['user']);
  });
  afterAll(async () => {
    await t?.close();
  });

  describe('global guard', () => {
    it('lets guests use @Public routes and attaches a valid token there', async () => {
      const guest = await t.http().get('/api/v1/__rbac/public').expect(200);
      expect(guest.body.data.userId).toBeNull();
      const signed = await t
        .http()
        .get('/api/v1/__rbac/public')
        .set(bearer(normal.accessToken))
        .expect(200);
      expect(signed.body.data.userId).toBe(normal.userId);
      // Garbage tokens on public routes mean "guest", never 401.
      await t.http().get('/api/v1/__rbac/public').set(bearer('garbage.token.x')).expect(200);
    });

    it('protects every other route by default', async () => {
      const res = await t.http().get('/api/v1/__rbac/private').expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      const okRes = await t
        .http()
        .get('/api/v1/__rbac/private')
        .set(bearer(normal.accessToken))
        .expect(200);
      expect(okRes.body.data.userId).toBe(normal.userId);
    });

    it('fails closed on admin routes that declare no permission', async () => {
      const res = await t
        .http()
        .get('/api/v1/admin/__rbac/unguarded')
        .set(bearer(owner.accessToken))
        .expect(403);
      expect(res.body.error.code).toBe('ADMIN_ROUTE_WITHOUT_PERMISSION');
      const upper = await t
        .http()
        .get('/API/V1/Admin/__rbac/unguarded')
        .set(bearer(owner.accessToken));
      expect([upper.status, upper.body.error?.code]).toEqual([
        403,
        'ADMIN_ROUTE_WITHOUT_PERMISSION',
      ]);
    });

    it('supports any-of and class + method requirements', async () => {
      await t
        .http()
        .get('/api/v1/admin/__rbac/any')
        .set(bearer(editor.accessToken)) // editor has neither publish permission
        .expect(403);
      const stationManager = await createAndLogin(t, ['station_manager']);
      await t
        .http()
        .get('/api/v1/admin/__rbac/any')
        .set(bearer(stationManager.accessToken))
        .expect(200);
      // Class needs articles.create, method needs articles.publish.
      await t
        .http()
        .post('/api/v1/admin/__rbac/class')
        .set(bearer(editor.accessToken)) // has create, lacks publish
        .expect(403);
      const reviewer = await createAndLogin(t, ['content_reviewer']);
      await t
        .http()
        .post('/api/v1/admin/__rbac/class')
        .set(bearer(reviewer.accessToken))
        .expect(201);
    });
  });

  describe('admin area', () => {
    it('blocks guests (401) and normal users (403) from every admin endpoint', async () => {
      const endpoints: Array<['get' | 'put' | 'patch' | 'delete', string]> = [
        ['get', '/api/v1/admin/users'],
        ['get', `/api/v1/admin/users/${normal.userId}`],
        ['put', `/api/v1/admin/users/${normal.userId}/roles`],
        ['patch', `/api/v1/admin/users/${normal.userId}/status`],
        ['get', `/api/v1/admin/users/${normal.userId}/sessions`],
        ['delete', `/api/v1/admin/users/${normal.userId}/sessions`],
        ['get', '/api/v1/admin/roles'],
        ['get', '/api/v1/admin/permissions'],
        ['put', '/api/v1/admin/roles/editor/permissions'],
        ['get', '/api/v1/admin/audit-logs'],
      ];
      for (const [method, path] of endpoints) {
        const guest = await t.http()[method](path).send({});
        expect([path, guest.status]).toEqual([path, 401]);
        const user = await t.http()[method](path).set(bearer(normal.accessToken)).send({});
        expect([path, user.status, user.body.error?.code]).toEqual([path, 403, 'FORBIDDEN']);
      }
      const denied = await t.prisma.auditLog.count({
        where: { action: 'security.permission_denied', actorId: normal.userId },
      });
      expect(denied).toBe(endpoints.length);
    });

    it('lists, searches, filters, sorts and paginates users', async () => {
      const marker = `srch${Date.now().toString(36)}`;
      const created = [];
      for (let i = 0; i < 3; i++) {
        created.push(await createUser(t, { email: `${marker}.${i}@example.com` }));
      }
      const page1 = await t
        .http()
        .get(`/api/v1/admin/users?q=${marker}&sort=email&page=1&pageSize=2`)
        .set(bearer(admin.accessToken))
        .expect(200);
      expect(page1.body.meta).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
      expect(page1.body.data.map((u: { email: string }) => u.email)).toEqual([
        `${marker}.0@example.com`,
        `${marker}.1@example.com`,
      ]);
      expect(Object.keys((page1.body.data as object[])[0]).sort()).toEqual(
        [
          'createdAt',
          'displayName',
          'email',
          'emailVerified',
          'id',
          'isDemo',
          'lastLoginAt',
          'locale',
          'roles',
          'status',
        ].sort(),
      );
      const editors = await t
        .http()
        .get('/api/v1/admin/users?role=editor')
        .set(bearer(moderator.accessToken)) // users.read is enough to list
        .expect(200);
      expect(editors.body.data.map((u: { id: string }) => u.id)).toContain(editor.userId);
      expect(editors.body.data.every((u: { roles: string[] }) => u.roles.includes('editor'))).toBe(
        true,
      );
      await t
        .http()
        .get('/api/v1/admin/users?sort=password')
        .set(bearer(admin.accessToken))
        .expect(422);

      const detail = await t
        .http()
        .get(`/api/v1/admin/users/${editor.userId}`)
        .set(bearer(admin.accessToken))
        .expect(200);
      expect(detail.body.data).toMatchObject({
        id: editor.userId,
        roles: ['editor', 'user'],
        permissions: expect.arrayContaining(['articles.create']),
        hasPassword: true,
        activeSessions: 1,
        oauthProviders: [],
      });
      expect(JSON.stringify(detail.body)).not.toMatch(/passwordHash|\$argon2/);
    });

    it('applies role changes immediately and audits them', async () => {
      const target = await createAndLogin(t);
      await t.http().get('/api/v1/admin/audit-logs').set(bearer(target.accessToken)).expect(403);
      const res = await t
        .http()
        .put(`/api/v1/admin/users/${target.userId}/roles`)
        .set(bearer(admin.accessToken))
        .send({ roles: ['editor'] })
        .expect(200);
      expect(res.body.data.roles).toEqual(['editor', 'user']); // "user" always kept
      const me = await t.http().get('/api/v1/me').set(bearer(target.accessToken)).expect(200);
      expect(me.body.data.permissions).toContain('articles.create');

      const log = await t.prisma.auditLog.findFirstOrThrow({
        where: { action: 'users.roles.update', entityId: target.userId },
      });
      expect(log).toMatchObject({ actorId: admin.userId, actorLabel: admin.email });
      expect(log.before).toMatchObject({ roles: ['user'] });
      expect(log.after).toMatchObject({ roles: ['editor', 'user'], added: ['editor'] });
      expect(log.diff).toMatchObject({ roles: { from: ['user'], to: ['editor', 'user'] } });

      // Single role endpoints.
      await t
        .http()
        .post(`/api/v1/admin/users/${target.userId}/roles/station_manager`)
        .set(bearer(admin.accessToken))
        .expect(200);
      const removed = await t
        .http()
        .delete(`/api/v1/admin/users/${target.userId}/roles/editor`)
        .set(bearer(admin.accessToken))
        .expect(200);
      expect(removed.body.data.roles).toEqual(['station_manager', 'user']);
      const unknown = await t
        .http()
        .put(`/api/v1/admin/users/${target.userId}/roles`)
        .set(bearer(admin.accessToken))
        .send({ roles: ['wizard'] })
        .expect(422);
      expect(unknown.body.error).toMatchObject({
        code: 'UNKNOWN_ROLE',
        details: { roles: ['wizard'] },
      });
    });

    it('protects privileged roles and owners', async () => {
      const target = await createAndLogin(t);
      // Moderator has users.read/users.block but not users.manage.
      await t
        .http()
        .put(`/api/v1/admin/users/${target.userId}/roles`)
        .set(bearer(moderator.accessToken))
        .send({ roles: ['editor'] })
        .expect(403);
      // Admin cannot grant admin (needs users.manage_admins) nor owner (owner only).
      await t
        .http()
        .put(`/api/v1/admin/users/${target.userId}/roles`)
        .set(bearer(admin.accessToken))
        .send({ roles: ['admin'] })
        .expect(403);
      const ownerGrant = await t
        .http()
        .put(`/api/v1/admin/users/${target.userId}/roles`)
        .set(bearer(admin.accessToken))
        .send({ roles: ['owner'] })
        .expect(403);
      expect(ownerGrant.body.error.code).toBe('OWNER_ONLY');
      // Admin cannot touch an owner at all.
      const attempts = [
        () =>
          t
            .http()
            .put(`/api/v1/admin/users/${owner.userId}/roles`)
            .send({ roles: ['owner', 'editor'] }),
        () =>
          t
            .http()
            .patch(`/api/v1/admin/users/${owner.userId}/status`)
            .send({ status: 'suspended' }),
        () => t.http().delete(`/api/v1/admin/users/${owner.userId}/sessions`),
      ];
      for (const attempt of attempts) {
        const res = await attempt().set(bearer(admin.accessToken));
        expect([res.status, res.body.error?.code]).toEqual([403, 'OWNER_ONLY']);
      }
      // The owner can grant admin.
      const granted = await t
        .http()
        .put(`/api/v1/admin/users/${target.userId}/roles`)
        .set(bearer(owner.accessToken))
        .send({ roles: ['admin'] })
        .expect(200);
      expect(granted.body.data.roles).toEqual(['admin', 'user']);
      // …and a moderator cannot suspend that admin.
      await t
        .http()
        .patch(`/api/v1/admin/users/${target.userId}/status`)
        .set(bearer(moderator.accessToken))
        .send({ status: 'suspended' })
        .expect(403);
    });

    it('never removes or suspends the last owner, and nobody suspends themselves', async () => {
      await t.prisma.userRole.deleteMany({
        where: { role: { key: 'owner' }, userId: { not: owner.userId } },
      });
      const demote = await t
        .http()
        .put(`/api/v1/admin/users/${owner.userId}/roles`)
        .set(bearer(owner.accessToken))
        .send({ roles: ['admin'] })
        .expect(409);
      expect(demote.body.error.code).toBe('LAST_OWNER');
      const self = await t
        .http()
        .patch(`/api/v1/admin/users/${owner.userId}/status`)
        .set(bearer(owner.accessToken))
        .send({ status: 'suspended' })
        .expect(409);
      expect(self.body.error.code).toBe('CANNOT_TARGET_SELF');

      // With a second owner, demoting the first one works.
      const second = await createAndLogin(t, ['owner', 'user']);
      await t
        .http()
        .delete(`/api/v1/admin/users/${second.userId}/roles/owner`)
        .set(bearer(owner.accessToken))
        .expect(200);
      const stillOwner = await t
        .http()
        .get(`/api/v1/admin/users/${owner.userId}`)
        .set(bearer(owner.accessToken))
        .expect(200);
      expect(stillOwner.body.data.roles).toContain('owner');
    });

    it('suspends (signing out everywhere) and re-activates users', async () => {
      const target = await createAndLogin(t);
      const res = await t
        .http()
        .patch(`/api/v1/admin/users/${target.userId}/status`)
        .set(bearer(moderator.accessToken))
        .send({ status: 'suspended', reason: 'spam' })
        .expect(200);
      expect(res.body.data).toMatchObject({ status: 'suspended', activeSessions: 0 });
      await t.http().get('/api/v1/me').set(bearer(target.accessToken)).expect(401);
      const loginRes = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: target.email, password: 'Volt-Charge-2026!' })
        .expect(403);
      expect(loginRes.body.error.code).toBe('ACCOUNT_DISABLED');
      const log = await t.prisma.auditLog.findFirstOrThrow({
        where: { action: 'users.suspend', entityId: target.userId },
      });
      expect(log.after).toMatchObject({ status: 'suspended', reason: 'spam', sessionsRevoked: 1 });

      await t
        .http()
        .patch(`/api/v1/admin/users/${target.userId}/status`)
        .set(bearer(moderator.accessToken))
        .send({ status: 'active' })
        .expect(200);
      await login(t, target.email);
    });

    it('users.block (moderator) cannot suspend or re-activate staff accounts', async () => {
      const reviewer = await createUser(t, { roles: ['content_reviewer', 'user'] });
      const denied = await t
        .http()
        .patch(`/api/v1/admin/users/${reviewer.id}/status`)
        .set(bearer(moderator.accessToken))
        .send({ status: 'suspended' })
        .expect(403);
      expect(denied.body.error.code).toBe('FORBIDDEN');
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: reviewer.id } })).status).toBe(
        'active',
      );
      // An admin (users.manage) can, and the moderator cannot undo it.
      await t
        .http()
        .patch(`/api/v1/admin/users/${reviewer.id}/status`)
        .set(bearer(admin.accessToken))
        .send({ status: 'suspended' })
        .expect(200);
      await t
        .http()
        .patch(`/api/v1/admin/users/${reviewer.id}/status`)
        .set(bearer(moderator.accessToken))
        .send({ status: 'active' })
        .expect(403);
    });

    it("only owners list an owner's sessions (IPs, devices); admins need manage_admins for admins", async () => {
      const owner2 = await createUser(t, { roles: ['owner', 'user'] });
      await login(t, owner2.email, owner2.password, 'OwnerLaptop');
      for (const actor of [moderator, admin]) {
        const res = await t
          .http()
          .get(`/api/v1/admin/users/${owner2.id}/sessions`)
          .set(bearer(actor.accessToken))
          .expect(403);
        expect(res.body.error.code).toBe('OWNER_ONLY');
      }
      const admin2 = await createUser(t, { roles: ['admin', 'user'] });
      await t
        .http()
        .get(`/api/v1/admin/users/${admin2.id}/sessions`)
        .set(bearer(moderator.accessToken))
        .expect(403);
      const own = await t
        .http()
        .get(`/api/v1/admin/users/${owner2.id}/sessions`)
        .set(bearer(owner.accessToken))
        .expect(200);
      expect(own.body.data[0]).toMatchObject({ deviceName: 'OwnerLaptop' });
    });

    it('lists and revokes sessions of a user', async () => {
      const u = await createUser(t);
      const s1 = await login(t, u.email, u.password, 'one');
      const s2 = await login(t, u.email, u.password, 'two');
      const list = await t
        .http()
        .get(`/api/v1/admin/users/${u.id}/sessions`)
        .set(bearer(moderator.accessToken))
        .expect(200);
      expect(list.body.data).toHaveLength(2);
      // Moderator can read but not revoke.
      await t
        .http()
        .delete(`/api/v1/admin/users/${u.id}/sessions/${s1.sessionId}`)
        .set(bearer(moderator.accessToken))
        .expect(403);
      await t
        .http()
        .delete(`/api/v1/admin/users/${u.id}/sessions/${s1.sessionId}`)
        .set(bearer(admin.accessToken))
        .expect(204);
      await t.http().get('/api/v1/me').set(bearer(s1.accessToken)).expect(401);
      await t.http().get('/api/v1/me').set(bearer(s2.accessToken)).expect(200);
      const all = await t
        .http()
        .delete(`/api/v1/admin/users/${u.id}/sessions`)
        .set(bearer(admin.accessToken))
        .expect(200);
      expect(all.body.data).toEqual({ revoked: 1 });
      await t.http().get('/api/v1/me').set(bearer(s2.accessToken)).expect(401);
      await t
        .http()
        .delete(`/api/v1/admin/users/${u.id}/sessions/${s1.sessionId}`)
        .set(bearer(admin.accessToken))
        .expect(404);
    });
  });

  describe('roles and the permission matrix', () => {
    it('lists roles (owner = every permission) and the permission catalogue', async () => {
      const roles = await t
        .http()
        .get('/api/v1/admin/roles')
        .set(bearer(admin.accessToken))
        .expect(200);
      const keys = (roles.body.data as { key: string }[]).map((r) => r.key).sort();
      expect(keys).toEqual(
        [
          'admin',
          'community_moderator',
          'content_reviewer',
          'editor',
          'owner',
          'station_manager',
          'user',
          'vehicle_data_manager',
        ].sort(),
      );
      const perms = await t
        .http()
        .get('/api/v1/admin/permissions')
        .set(bearer(admin.accessToken))
        .expect(200);
      const all = (perms.body.data as { key: string }[]).map((p) => p.key);
      const ownerRole = (
        roles.body.data as { key: string; permissions: string[]; permissionsEditable: boolean }[]
      ).find((r) => r.key === 'owner')!;
      expect([...ownerRole.permissions].sort()).toEqual([...all].sort());
      expect(ownerRole.permissionsEditable).toBe(false);
      const adminRole = (roles.body.data as { key: string; permissions: string[] }[]).find(
        (r) => r.key === 'admin',
      )!;
      expect(adminRole.permissions).not.toContain('users.manage_admins');
      expect(adminRole.permissions).toContain('audit.read');
    });

    it('lets only owners edit the matrix; changes apply immediately', async () => {
      await t.http().get('/api/v1/admin/audit-logs').set(bearer(editor.accessToken)).expect(403);
      const current = await t
        .http()
        .get('/api/v1/admin/roles/editor')
        .set(bearer(owner.accessToken))
        .expect(200);
      const next = [...(current.body.data.permissions as string[]), 'audit.read'];

      const byAdmin = await t
        .http()
        .put('/api/v1/admin/roles/editor/permissions')
        .set(bearer(admin.accessToken))
        .send({ permissions: next })
        .expect(403);
      expect(byAdmin.body.error.code).toBe('OWNER_ONLY');

      const updated = await t
        .http()
        .put('/api/v1/admin/roles/editor/permissions')
        .set(bearer(owner.accessToken))
        .send({ permissions: next })
        .expect(200);
      expect(updated.body.data.permissions).toContain('audit.read');
      await t.http().get('/api/v1/admin/audit-logs').set(bearer(editor.accessToken)).expect(200);
      const log = await t.prisma.auditLog.findFirstOrThrow({
        where: { action: 'roles.permissions.update', entityId: 'editor' },
      });
      expect(log.after).toMatchObject({ added: ['audit.read'], removed: [] });

      const ownerEdit = await t
        .http()
        .put('/api/v1/admin/roles/owner/permissions')
        .set(bearer(owner.accessToken))
        .send({ permissions: [] })
        .expect(409);
      expect(ownerEdit.body.error.code).toBe('ROLE_NOT_EDITABLE');
      const unknown = await t
        .http()
        .put('/api/v1/admin/roles/editor/permissions')
        .set(bearer(owner.accessToken))
        .send({ permissions: ['rockets.launch'] })
        .expect(422);
      expect(unknown.body.error).toMatchObject({
        code: 'UNKNOWN_PERMISSION',
        details: { permissions: ['rockets.launch'] },
      });
      await t.http().get('/api/v1/admin/roles/nope').set(bearer(owner.accessToken)).expect(404);
    });
  });
});
