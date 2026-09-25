import { Injectable } from '@nestjs/common';
import { JobsService } from '../../../jobs/jobs.service';
import { QUEUES } from '../../../jobs/queues';

export const MEDIA_JOB_NAME = 'process-asset';
/** Retries of one processing job (exponential backoff, see JobsModule). */
export const MEDIA_JOB_ATTEMPTS = 3;

export interface MediaJobData {
  assetId: string;
}

/**
 * Enqueues media processing on QUEUES.MEDIA_PROCESSING. Job ids are
 * deterministic for the first run (`media-<assetId>-initial`: completing
 * an upload twice never queues twice) and deduplicated per asset for
 * re-runs (a re-run requested while another one waits is ignored).
 * Throws 503 JOBS_UNAVAILABLE when Redis is down (callers decide).
 */
@Injectable()
export class MediaJobsService {
  constructor(private readonly jobs: JobsService) {}

  async enqueue(assetId: string, reason: 'initial' | 'reprocess'): Promise<{ id: string }> {
    const jobId =
      reason === 'initial' ? `media-${assetId}-initial` : `media-${assetId}-r${Date.now()}`;
    return this.jobs.enqueue<MediaJobData>(
      QUEUES.MEDIA_PROCESSING,
      MEDIA_JOB_NAME,
      { assetId },
      {
        jobId,
        attempts: MEDIA_JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: 10_000 },
        ...(reason === 'reprocess' ? { deduplication: { id: `media-${assetId}` } } : {}),
      },
    );
  }
}
