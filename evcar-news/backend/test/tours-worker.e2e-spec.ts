/**
 * The real background path: completing an upload queues a BullMQ job on
 * QUEUES.MEDIA_PROCESSING and the worker (MediaProcessingProcessor, added
 * to this test app explicitly — e2e apps run without JOBS_ENABLED workers)
 * turns the panorama into preview / renditions / tiles, reporting progress.
 * Needs Redis (like every e2e spec).
 */
import { Module } from '@nestjs/common';
import { JobsService } from '../src/jobs/jobs.service';
import { QUEUES } from '../src/jobs/queues';
import { MediaProcessingProcessor } from '../src/modules/media/jobs/media-processing.processor';
import { MediaModule } from '../src/modules/media/media.module';
import { auth, syntheticPanorama, tourStaff, uploadAsset, type TourStaff } from './tours-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

@Module({ imports: [MediaModule], providers: [MediaProcessingProcessor] })
class MediaWorkerTestModule {}

async function waitFor<T>(fn: () => Promise<T | null>, timeoutMs = 60_000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error('timed out waiting for the worker');
    await new Promise((r) => setTimeout(r, 250));
  }
}

describe('Media processing worker (BullMQ, e2e)', () => {
  let t: TestApp;
  let staff: TourStaff;

  beforeAll(async () => {
    t = await createTestApp({ imports: [MediaWorkerTestModule] });
    staff = await tourStaff(t);
  });
  afterAll(async () => {
    await t?.close();
  });

  it('processes a completed upload in the background and on re-processing requests', async () => {
    const asset = await uploadAsset(t, staff.manager, await syntheticPanorama(2048), {
      kind: 'panorama',
    });
    expect(asset.processingJob).toEqual({
      queued: true,
      jobId: `media-${asset.id}-initial`,
      reason: null,
    });
    const ready = await waitFor(async () => {
      const row = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
      return row.status === 'ready' ? row : null;
    });
    expect(ready).toMatchObject({ processingProgress: 100, processingAttempts: 1 });
    expect(ready.multiresConfig).not.toBeNull();
    const jobs = t.app.get(JobsService);
    const job = await waitFor(async () => {
      const j = await jobs.get(QUEUES.MEDIA_PROCESSING, `media-${asset.id}-initial`);
      return j.state === 'completed' ? j : null;
    });
    expect(job).toMatchObject({ name: 'process-asset', progress: 100 });

    const re = await t
      .http()
      .post(`/api/v1/admin/media/assets/${asset.id}/reprocess`)
      .set(auth(staff.manager))
      .expect(202);
    expect(re.body.data.jobId).toMatch(new RegExp(`^media-${asset.id}-r\\d+$`));
    await waitFor(async () => {
      const row = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
      return row.processingAttempts === 2 && row.processingProgress === 100 ? row : null;
    });
    // Status stayed `ready` during the re-run (files in use must keep serving).
    const after = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
    expect(after.status).toBe('ready');
  });
});
