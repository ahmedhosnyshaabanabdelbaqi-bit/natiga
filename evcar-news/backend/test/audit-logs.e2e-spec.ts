import { Body, Controller, Delete, Module, Param, Post, Put } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { AppException } from '../src/common/errors/app.exception';
import { ok } from '../src/common/http/responses';
import { Public } from '../src/modules/auth';
import { Audit, AuditService, SkipAudit } from '../src/modules/audit';
import { RequirePermissions } from '../src/modules/rbac';
import { bearer, createAndLogin, createUser, type LoggedIn } from './auth-test-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

class ThingDto {
  @IsString() name!: string;
  @IsOptional() @IsString() password?: string;
}

/** Test-only admin routes with the shapes feature modules will have. */
@RequirePermissions('settings.write')
@Controller('admin/__audit/things')
class AuditProbeController {
  constructor(private readonly audit: AuditService) {}

  @Post()
  create(@Body() dto: ThingDto) {
    return ok({ id: 'thing-1', name: dto.name, apiKey: 'sk-live-secret' });
  }

  @Put(':id')
  @Audit({ action: 'things.rename', entityType: 'thing' })
  rename(@Param('id') id: string, @Body() dto: ThingDto) {
    this.audit.annotate({
      before: { name: 'old name', color: 'blue' },
      after: { name: dto.name, color: 'blue' },
    });
    return ok({ id, name: dto.name });
  }

  @Delete(':id')
  remove() {
    return undefined;
  }

  @Post(':id/fail')
  fail() {
    throw AppException.conflict();
  }

  @Post(':id/self-audited')
  @SkipAudit()
  async selfAudited(@Param('id') id: string) {
    await this.audit.record({ action: 'things.custom', entityType: 'thing', entityId: id });
    return ok({ id });
  }
}

/** Mutating route outside /admin: not audited automatically. */
@Controller('__audit')
class PublicProbeController {
  @Public()
  @Post('ping')
  ping() {
    return ok(true);
  }
}

@Module({ controllers: [AuditProbeController, PublicProbeController] })
class AuditProbeModule {}

describe('Audit log (e2e)', () => {
  let t: TestApp;
  let admin: LoggedIn;

  beforeAll(async () => {
    t = await createTestApp({ imports: [AuditProbeModule] });
    admin = await createAndLogin(t, ['admin', 'user']);
  });
  afterAll(async () => {
    await t?.close();
  });

  const latest = (action: string) =>
    t.prisma.auditLog.findFirst({ where: { action }, orderBy: { createdAt: 'desc' } });

  it('records every successful mutating admin request with request metadata', async () => {
    await t
      .http()
      .post('/api/v1/admin/__audit/things')
      .set(bearer(admin.accessToken))
      .set('X-Request-Id', 'audit-req-000001')
      .set('User-Agent', 'jest-agent/1.0')
      .send({ name: 'first', password: 'hunter2-secret' })
      .expect(201);
    const row = await latest('__audit.things.create');
    expect(row).toMatchObject({
      actorId: admin.userId,
      actorLabel: admin.email,
      entityType: '__audit',
      entityId: 'thing-1',
      requestId: 'audit-req-000001',
      userAgent: 'jest-agent/1.0',
    });
    expect(row?.ip).toMatch(/127\.0\.0\.1|::1/);
    // The response entity is stored as "after", with secrets redacted.
    expect(row?.after).toEqual({ id: 'thing-1', name: 'first', apiKey: '[REDACTED]' });
    expect(JSON.stringify(row)).not.toContain('hunter2');
    expect(JSON.stringify(row)).not.toContain('sk-live-secret');
  });

  it('audits case-variant admin URLs too (Express routes are case-insensitive)', async () => {
    const target = await createUser(t);
    const res = await t
      .http()
      .put(`/API/V1/ADMIN/users/${target.id}/roles`)
      .set(bearer(admin.accessToken))
      .send({ roles: ['editor'] });
    expect(res.status).toBe(200);
    const row = await latest('users.roles.update');
    expect(row).toMatchObject({ entityId: target.id, actorId: admin.userId });
  });

  it('uses @Audit names and annotate() before/after with a diff', async () => {
    await t
      .http()
      .put('/api/v1/admin/__audit/things/t-42')
      .set(bearer(admin.accessToken))
      .send({ name: 'new name' })
      .expect(200);
    const row = await latest('things.rename');
    expect(row).toMatchObject({
      entityType: 'thing',
      entityId: 't-42',
      before: { name: 'old name', color: 'blue' },
      after: { name: 'new name', color: 'blue' },
      diff: { name: { from: 'old name', to: 'new name' } },
    });
  });

  it('skips failed requests, @SkipAudit handlers (which audit themselves) and non-admin routes', async () => {
    const before = await t.prisma.auditLog.count();
    await t
      .http()
      .post('/api/v1/admin/__audit/things/x/fail')
      .set(bearer(admin.accessToken))
      .expect(409);
    await t
      .http()
      .post('/api/v1/admin/__audit/things/x/self-audited')
      .set(bearer(admin.accessToken))
      .expect(201);
    await t.http().post('/api/v1/__audit/ping').expect(201);
    await t.http().get('/api/v1/admin/audit-logs').set(bearer(admin.accessToken)).expect(200);
    const rows = await t.prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' }, skip: before });
    expect(rows.map((r) => r.action)).toEqual(['things.custom']);

    await t
      .http()
      .delete('/api/v1/admin/__audit/things/t-9')
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(await latest('__audit.things.delete')).toMatchObject({ entityId: 't-9', after: null });
  });

  it('lists entries newest first with filters, search and pagination', async () => {
    // Own fixtures: this test must pass alone and in any order.
    const actor = await createAndLogin(t, ['admin', 'user']);
    await t
      .http()
      .put('/api/v1/admin/__audit/things/t-list')
      .set(bearer(actor.accessToken))
      .send({ name: 'listed' })
      .expect(200);
    await t
      .http()
      .post('/api/v1/admin/__audit/things/t-list/self-audited')
      .set(bearer(actor.accessToken))
      .expect(201);
    await t
      .http()
      .post('/api/v1/admin/__audit/things')
      .set(bearer(actor.accessToken))
      .set('X-Request-Id', 'audit-req-listing-01')
      .send({ name: 'searchable' })
      .expect(201);
    const victim = await createUser(t);
    for (let i = 0; i < 3; i++) {
      await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: victim.email, password: `Wrong-${i}-password` })
        .expect(401);
    }
    const res = await t
      .http()
      .get(`/api/v1/admin/audit-logs?action=auth.login_failed&entityId=${victim.id}&pageSize=2`)
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    const rows = res.body.data as Array<Record<string, unknown> & { createdAt: string }>;
    const first = rows[0];
    expect(Object.keys(first).sort()).toEqual(
      [
        'action',
        'actor',
        'actorId',
        'actorLabel',
        'after',
        'before',
        'createdAt',
        'diff',
        'entityId',
        'entityType',
        'id',
        'ip',
        'requestId',
        'userAgent',
      ].sort(),
    );
    expect(first).toMatchObject({
      action: 'auth.login_failed',
      entityType: 'user',
      actor: { id: victim.id, email: victim.email },
      after: { reason: 'invalid_password' },
    });
    expect(new Date(rows[0].createdAt).getTime()).toBeGreaterThanOrEqual(
      new Date(rows[1].createdAt).getTime(),
    );

    const prefix = await t
      .http()
      .get(`/api/v1/admin/audit-logs?action=auth.*&actorId=${victim.id}`)
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(prefix.body.meta.total).toBe(3);

    const byAdmin = await t
      .http()
      .get(`/api/v1/admin/audit-logs?actorId=${actor.userId}&entityType=thing&sort=createdAt`)
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(byAdmin.body.data.map((r: { action: string }) => r.action)).toEqual([
      'things.rename',
      'things.custom',
    ]);

    const search = await t
      .http()
      .get('/api/v1/admin/audit-logs?q=audit-req-listing-01')
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(search.body.data).toHaveLength(1);

    const future = new Date(Date.now() + 3600_000).toISOString();
    const none = await t
      .http()
      .get(`/api/v1/admin/audit-logs?from=${encodeURIComponent(future)}`)
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(none.body.meta.total).toBe(0);

    const one = await t
      .http()
      .get(`/api/v1/admin/audit-logs/${first.id as string}`)
      .set(bearer(admin.accessToken))
      .expect(200);
    expect(one.body.data.id).toBe(first.id);
    await t
      .http()
      .get('/api/v1/admin/audit-logs/0190a3c6-0000-7000-8000-000000000000')
      .set(bearer(admin.accessToken))
      .expect(404);
    await t
      .http()
      .get('/api/v1/admin/audit-logs?actorId=not-a-uuid&from=yesterday')
      .set(bearer(admin.accessToken))
      .expect(422);
  });

  it('requires audit.read', async () => {
    const editor = await createAndLogin(t, ['editor']);
    await t.http().get('/api/v1/admin/audit-logs').set(bearer(editor.accessToken)).expect(403);
    const moderator = await createAndLogin(t, ['community_moderator']);
    await t.http().get('/api/v1/admin/audit-logs').set(bearer(moderator.accessToken)).expect(403);
  });
});
