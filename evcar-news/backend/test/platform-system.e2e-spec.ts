import { Worker } from 'bullmq';
import { JobsService } from '../src/jobs/jobs.service';
import { QUEUES } from '../src/jobs/queues';
import { ImportJobsService } from '../src/modules/system/import-jobs.service';
import { MAIL_SENDER } from '../src/providers/provider-tokens';
import type { ConsoleMailSender } from '../src/providers/mail/console-mail.sender';
import { userWithRoles, waitForAudit, type PlatformUser } from './platform-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

describe('Platform: system, jobs, imports, health (e2e)', () => {
  let t: TestApp;
  let admin: PlatformUser;
  let normal: PlatformUser;

  beforeAll(async () => {
    t = await createTestApp({ env: { OCM_API_KEY: 'e2e-secret-ocm-key-123' } });
    admin = await userWithRoles(t, ['admin', 'user']);
    normal = await userWithRoles(t, ['user']);
  });
  afterAll(async () => {
    await t?.close();
  });

  it('GET /health reports database, redis and storage', async () => {
    const res = await t.http().get('/api/v1/health').expect(200);
    expect(res.body.data).toMatchObject({
      status: 'ok',
      checks: { database: { status: 'up' }, redis: { status: 'up' }, storage: { status: 'up' } },
    });
    await t.http().get('/api/v1/health/live').expect(200);
  });

  it('registers the mail adapter under MAIL_SENDER (console in tests)', async () => {
    const mail = t.app.get<ConsoleMailSender>(MAIL_SENDER);
    expect(mail.driver).toBe('console');
    const res = await mail.send({ to: 'x@example.com', subject: 'S', text: 'T', tags: ['e2e'] });
    expect(res.delivered).toBe(false);
  });

  describe('GET /admin/system/integrations', () => {
    it('lists every provider status without secrets', async () => {
      const res = await t
        .http()
        .get('/api/v1/admin/system/integrations')
        .set(admin.auth)
        .expect(200);
      const items = res.body.data.items as { id: string; configured: boolean; reason?: string }[];
      const byId = Object.fromEntries(items.map((i) => [i.id, i]));
      for (const id of [
        'storage.local',
        'mail.console',
        'stations.open_charge_map',
        'stations.manual',
        'availability.none',
        'routing.none',
        'geocoding.none',
        'news.rss',
        'push.fcm',
        'push.apns',
        'push.in_app',
        'oauth.google',
        'oauth.apple',
        'assistant.none',
      ]) {
        expect(byId[id]).toBeDefined();
      }
      expect(byId['stations.open_charge_map'].configured).toBe(true);
      expect(byId['routing.none']).toMatchObject({ configured: false, reason: expect.any(String) });
      expect(byId['push.fcm'].configured).toBe(false);
      expect(res.body.data.capabilities).toMatchObject({
        routing: false,
        stationsSync: true,
        liveAvailability: false,
      });
      expect(JSON.stringify(res.body)).not.toContain('e2e-secret-ocm-key-123');
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('runs a live check (storage probe) and audits it', async () => {
      const res = await t
        .http()
        .post('/api/v1/admin/system/integrations/storage.local/check')
        .set(admin.auth)
        .expect(200);
      expect(res.body.data).toMatchObject({ ok: true });
      const skipped = await t
        .http()
        .post('/api/v1/admin/system/integrations/routing.none/check')
        .set(admin.auth)
        .expect(200);
      expect(skipped.body.data).toMatchObject({ ok: false, skipped: true });
      await t
        .http()
        .post('/api/v1/admin/system/integrations/nope.nope/check')
        .set(admin.auth)
        .expect(404);
      await t
        .http()
        .post('/api/v1/admin/system/integrations/storage.local/check')
        .set(normal.auth)
        .expect(403);
      const audit = await waitForAudit(t, 'integrations.check');
      expect(audit.actorId).toBe(admin.id);
    });
  });

  it('GET /admin/system/overview returns counts, stale data, jobs and imports', async () => {
    const res = await t.http().get('/api/v1/admin/system/overview').set(admin.auth).expect(200);
    const d = res.body.data;
    expect(d).toMatchObject({
      environment: 'test',
      counts: {
        users: expect.any(Number),
        openStationReports: 0,
        demoRows: { articles: 0, stations: 0 },
      },
      staleData: { thresholds: { stationVerificationDays: 180 }, pricesOutdated: 0 },
      jobs: { redis: 'up' },
      imports: { running: 0, failedLast7Days: 0 },
      integrations: { total: expect.any(Number) },
    });
    expect(d.integrations.notConfigured).toContain('routing.none');
    expect(Array.isArray(d.warnings)).toBe(true);
    await t.http().get('/api/v1/admin/system/overview').set(normal.auth).expect(403);
  });

  describe('background jobs', () => {
    it('lists all queues with counts', async () => {
      const res = await t.http().get('/api/v1/admin/system/jobs').set(admin.auth).expect(200);
      expect(res.body.data).toMatchObject({ redis: 'up', workersEnabledHere: false });
      const names = (res.body.data.queues as { name: string }[]).map((q) => q.name);
      for (const q of ['media-processing', 'imports', 'notifications', 'sync'])
        expect(names).toContain(q);
    });

    it('enqueues idempotently, lists, refuses to retry non-failed jobs, retries failed ones, removes', async () => {
      const jobs = t.app.get(JobsService);
      const a = await jobs.enqueue(
        QUEUES.IMPORTS,
        'e2e.noop',
        { rowCount: 1 },
        { jobId: 'e2e-job-1' },
      );
      const b = await jobs.enqueue(
        QUEUES.IMPORTS,
        'e2e.noop',
        { rowCount: 1 },
        { jobId: 'e2e-job-1' },
      );
      expect(a.id).toBe('e2e-job-1');
      expect(b.id).toBe('e2e-job-1');
      const list = await t
        .http()
        .get('/api/v1/admin/system/jobs/imports?state=waiting')
        .set(admin.auth)
        .expect(200);
      expect(list.body.meta.total).toBe(1);
      expect(list.body.data[0]).toMatchObject({
        id: 'e2e-job-1',
        name: 'e2e.noop',
        state: 'waiting',
      });
      const detail = await t
        .http()
        .get('/api/v1/admin/system/jobs/imports/e2e-job-1')
        .set(admin.auth)
        .expect(200);
      expect(detail.body.data).toMatchObject({ dataKeys: ['rowCount'] });
      expect(JSON.stringify(detail.body)).not.toContain('"rowCount":1');
      const conflict = await t
        .http()
        .post('/api/v1/admin/system/jobs/imports/e2e-job-1/retry')
        .set(admin.auth)
        .expect(409);
      expect(conflict.body.error.code).toBe('JOB_NOT_FAILED');

      // A real worker fails a single-attempt job, then an admin retries it.
      await jobs.enqueue(QUEUES.IMPORTS, 'e2e.fail', {}, { jobId: 'e2e-job-2', attempts: 1 });
      const queue = jobs.queue(QUEUES.IMPORTS);
      const worker = new Worker(
        QUEUES.IMPORTS,
        (job) => {
          if (job.id === 'e2e-job-2') throw new Error('synthetic failure');
          return Promise.resolve();
        },
        { connection: queue.opts.connection, prefix: queue.opts.prefix, autorun: false },
      );
      const failedOnce = new Promise<void>((resolve) => worker.on('failed', () => resolve()));
      void worker.run();
      await failedOnce;
      await worker.close();
      const failed = await t
        .http()
        .get('/api/v1/admin/system/jobs/imports')
        .set(admin.auth)
        .expect(200);
      expect(failed.body.data[0]).toMatchObject({
        id: 'e2e-job-2',
        state: 'failed',
        failedReason: 'synthetic failure',
        attemptsMade: 1,
      });
      const summary = await t.http().get('/api/v1/admin/system/jobs').set(admin.auth).expect(200);
      const imports = (
        summary.body.data.queues as { name: string; counts: Record<string, number> }[]
      ).find((q) => q.name === 'imports');
      expect(imports?.counts.failed).toBe(1);
      const retried = await t
        .http()
        .post('/api/v1/admin/system/jobs/imports/e2e-job-2/retry')
        .set(admin.auth)
        .expect(200);
      expect(retried.body.data.state).toBe('waiting');
      await t
        .http()
        .post('/api/v1/admin/system/jobs/imports/e2e-job-2/retry')
        .set(normal.auth)
        .expect(403);
      await waitForAudit(t, 'jobs.retry');

      await t
        .http()
        .delete('/api/v1/admin/system/jobs/imports/e2e-job-1')
        .set(admin.auth)
        .expect(204);
      await t.http().get('/api/v1/admin/system/jobs/imports/e2e-job-1').set(admin.auth).expect(404);
      await t.http().get('/api/v1/admin/system/jobs/unknown-queue').set(admin.auth).expect(404);
      await t
        .http()
        .get('/api/v1/admin/system/jobs/imports?state=bogus')
        .set(admin.auth)
        .expect(422);
    });
  });

  describe('import jobs (shared service + admin API)', () => {
    it('creates retry-safely, logs row errors, tracks progress and completes', async () => {
      const svc = t.app.get(ImportJobsService);
      const [first, second] = await Promise.all([
        svc.create({ type: 'stations.csv', source: 'stations.csv', idempotencyKey: 'sha256:abc' }),
        svc.create({ type: 'stations.csv', source: 'stations.csv', idempotencyKey: 'sha256:abc' }),
      ]);
      expect(first.job.id).toBe(second.job.id);
      expect([first.created, second.created].sort()).toEqual([false, true]);
      const jobId = first.job.id;

      await svc.start(jobId);
      await svc.setTotal(jobId, 3);
      await svc.recordRow(jobId, {
        rowNumber: 1,
        status: 'imported',
        data: { name: 'Row 1' },
        entityType: 'station',
      });
      await svc.logRowError(jobId, 2, { name: '' }, [
        { field: 'name', code: 'required', message: 'name is required' },
      ]);
      // A retry re-processes row 1 → upsert, never double counted.
      await svc.recordRow(jobId, { rowNumber: 1, status: 'updated', data: { name: 'Row 1' } });
      expect([...(await svc.handledRowNumbers(jobId))]).toEqual([1]);
      const progress = await svc.recordRows(jobId, [
        { rowNumber: 3, status: 'duplicate', data: { name: 'Row 3' } },
      ]);
      expect(progress).toEqual({
        total: 3,
        processed: 3,
        success: 1,
        errors: 1,
        skipped: 1,
        percent: 100,
      });
      const done = await svc.complete(jobId);
      expect(done.status).toBe('completed_with_errors');

      const list = await t
        .http()
        .get('/api/v1/admin/system/import-jobs?type=stations.csv')
        .set(admin.auth)
        .expect(200);
      expect(list.body.data[0]).toMatchObject({
        id: jobId,
        status: 'completed_with_errors',
        progress: { percent: 100 },
      });
      const rows = await t
        .http()
        .get(`/api/v1/admin/system/import-jobs/${jobId}/rows?status=invalid`)
        .set(admin.auth)
        .expect(200);
      expect(rows.body.data).toEqual([
        {
          rowNumber: 2,
          status: 'invalid',
          data: { name: '' },
          errors: [{ field: 'name', code: 'required', message: 'name is required' }],
          entityType: null,
          entityId: null,
        },
      ]);
      const finished = await t
        .http()
        .post(`/api/v1/admin/system/import-jobs/${jobId}/cancel`)
        .set(admin.auth)
        .expect(409);
      expect(finished.body.error.code).toBe('IMPORT_JOB_FINISHED');

      // After completion the same key creates a new job.
      const again = await svc.create({ type: 'stations.csv', idempotencyKey: 'sha256:abc' });
      expect(again.created).toBe(true);
      await t
        .http()
        .post(`/api/v1/admin/system/import-jobs/${again.job.id}/cancel`)
        .set(admin.auth)
        .expect(200);
      expect(await svc.isCancelled(again.job.id)).toBe(true);
      await t.http().get('/api/v1/admin/system/import-jobs').set(normal.auth).expect(403);
      await t
        .http()
        .get('/api/v1/admin/system/import-jobs/00000000-0000-7000-8000-000000000000')
        .set(admin.auth)
        .expect(404);
    });

    it('records failures without leaking secrets', async () => {
      const svc = t.app.get(ImportJobsService);
      const { job } = await svc.create({ type: 'stations.ocm_sync' });
      const failed = await svc.fail(job.id, new Error('GET https://x/poi?key=abc123 failed'));
      expect(failed.status).toBe('failed');
      expect(failed.error).not.toContain('abc123');
    });
  });
});

describe('Platform: graceful degradation when Redis is down (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    // Nothing listens on this port: Redis is "down" for this app instance.
    t = await createTestApp({ env: { REDIS_URL: 'redis://127.0.0.1:6399' } });
  });
  afterAll(async () => {
    await t?.close();
  });

  it('health is degraded (API still serving) and names redis as down', async () => {
    const res = await t.http().get('/api/v1/health').expect(200);
    expect(res.body.data).toMatchObject({
      status: 'degraded',
      checks: { database: { status: 'up' }, redis: { status: 'down' }, storage: { status: 'up' } },
    });
  });

  it('enqueueing fails fast with 503 JOBS_UNAVAILABLE instead of hanging', async () => {
    const jobs = t.app.get(JobsService);
    const started = Date.now();
    await expect(jobs.enqueue(QUEUES.NOTIFICATIONS, 'x', {})).rejects.toMatchObject({
      code: 'JOBS_UNAVAILABLE',
      status: 503,
    });
    expect(Date.now() - started).toBeLessThan(5_000);
    const overview = await jobs.overview();
    expect(overview.redis).toBe('down');
    expect(overview.queues.every((q) => q.counts === null)).toBe(true);
  });

  it('public endpoints keep working', async () => {
    await t.http().get('/api/v1/app-config').expect(200);
    await t.http().get('/api/v1/markets').expect(200);
  });
});
