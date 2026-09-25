import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Job } from 'bullmq';
import { QUEUES } from '../../../jobs/queues';
import { MEDIA_JOB_NAME, type MediaJobData } from '../services/media-jobs.service';
import { MediaProcessingService, type ProcessResult } from '../services/media-processing.service';
import { UploadSessionsService } from '../services/upload-sessions.service';

/**
 * BullMQ worker of QUEUES.MEDIA_PROCESSING (JOBS_ENABLED instances only).
 * Concurrency 1 per instance: panorama tiling is CPU / memory heavy.
 * Retries use the job's attempts/backoff; the service persists progress,
 * attempts and errors and only marks the asset `failed` on the last attempt.
 */
@Processor(QUEUES.MEDIA_PROCESSING, { concurrency: 1 })
export class MediaProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessingProcessor.name);

  constructor(private readonly processing: MediaProcessingService) {
    super();
  }

  async process(job: Job<MediaJobData>): Promise<ProcessResult | { skipped: string }> {
    if (job.name !== MEDIA_JOB_NAME || typeof job.data?.assetId !== 'string') {
      this.logger.warn(`Ignoring unknown job ${job.name} (${job.id})`);
      return { skipped: 'unknown_job' };
    }
    return this.processing.process(job.data.assetId, {
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts ?? 1,
      onProgress: (p) => job.updateProgress(p),
    });
  }
}

/** Hourly: expires abandoned upload sessions and frees their stored parts. */
@Injectable()
export class MediaMaintenanceTrigger {
  private readonly logger = new Logger(MediaMaintenanceTrigger.name);

  constructor(private readonly uploads: UploadSessionsService) {}

  @Cron('23 * * * *', { name: 'media-upload-sessions-expiry' })
  async expireUploads(): Promise<void> {
    try {
      const n = await this.uploads.expireStale();
      if (n > 0) this.logger.log(`Expired ${n} abandoned upload sessions`);
    } catch (err) {
      this.logger.warn(`Upload session expiry failed: ${(err as Error).message}`);
    }
  }
}
