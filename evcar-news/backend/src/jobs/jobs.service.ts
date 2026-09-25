import { getQueueToken } from '@nestjs/bullmq';
import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Job, JobsOptions, JobType, Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { AppConfig } from '../config/app-config';
import { AppException } from '../common/errors/app.exception';
import { REDIS } from '../common/redis/redis.module';
import { withTimeout } from '../common/utils/app-version';
import { ALL_QUEUES, isQueueName, type QueueName } from './queues';
import { serverMessage } from '../modules/i18n/server-messages';

const REDIS_CHECK_TIMEOUT_MS = 1_500;
const ENQUEUE_TIMEOUT_MS = 3_000;
const LIST_STATES = [
  'waiting',
  'active',
  'completed',
  'failed',
  'delayed',
  'prioritized',
  'waiting-children',
] as const;
export type ListableJobState = (typeof LIST_STATES)[number];

export function isListableState(value: string): value is ListableJobState {
  return (LIST_STATES as readonly string[]).includes(value);
}

export interface QueueSummary {
  name: QueueName;
  /** null when Redis is unreachable. */
  counts: Record<string, number> | null;
  isPaused: boolean | null;
  /** Workers currently connected to this queue (any instance). */
  workers: number | null;
}

export interface JobsOverview {
  redis: 'up' | 'down';
  /** Whether THIS instance runs workers (JOBS_ENABLED). */
  workersEnabledHere: boolean;
  queues: QueueSummary[];
}

export interface JobView {
  id: string;
  name: string;
  queue: string;
  state: string;
  attemptsMade: number;
  maxAttempts: number;
  progress: unknown;
  failedReason: string | null;
  createdAt: string | null;
  processedAt: string | null;
  finishedAt: string | null;
  delayUntil: string | null;
}

export interface JobDetailView extends JobView {
  /** First lines of the last stack trace (admins only). */
  stacktrace: string[];
  /** Top-level data keys only (values may contain personal data). */
  dataKeys: string[];
}

const iso = (ms: number | undefined | null) => (ms ? new Date(ms).toISOString() : null);

export function jobsUnavailable(cause?: unknown): AppException {
  return new AppException({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    code: 'JOBS_UNAVAILABLE',
    message: serverMessage('errors.JOBS_UNAVAILABLE'),
    headers: { 'Retry-After': '30' },
    cause,
  });
}

/**
 * Producer-side access to the BullMQ queues with graceful degradation:
 * every call first checks Redis (shared client, fails fast) and is bounded
 * by a timeout, so an unreachable Redis yields 503 JOBS_UNAVAILABLE instead
 * of a hanging request. Pass a deterministic `jobId` for idempotent
 * enqueueing (BullMQ ignores a second add with the same id).
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Jobs');
  private readonly queues = new Map<QueueName, Queue>();
  private lastQueueErrorLog = 0;

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly config: AppConfig,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  onApplicationBootstrap(): void {
    for (const name of ALL_QUEUES) {
      const queue = this.moduleRef.get<Queue>(getQueueToken(name), { strict: false });
      // Without a listener an 'error' event would crash the process.
      queue.on('error', (err: Error) => {
        if (Date.now() - this.lastQueueErrorLog > 30_000) {
          this.lastQueueErrorLog = Date.now();
          this.logger.warn(`Queue ${name}: ${err.message}`);
        }
      });
      this.queues.set(name, queue);
    }
  }

  queue(name: string): Queue {
    if (!isQueueName(name)) throw AppException.notFound();
    const queue =
      this.queues.get(name) ?? this.moduleRef.get<Queue>(getQueueToken(name), { strict: false });
    this.queues.set(name, queue);
    return queue;
  }

  /** true when Redis answers PING quickly. */
  async isRedisUp(): Promise<boolean> {
    try {
      if (this.redis.status !== 'ready') return false;
      return (
        (await withTimeout(this.redis.ping(), REDIS_CHECK_TIMEOUT_MS, 'redis ping')) === 'PONG'
      );
    } catch {
      return false;
    }
  }

  private async assertAvailable(): Promise<void> {
    if (!(await this.isRedisUp())) throw jobsUnavailable();
  }

  private async bounded<T>(promise: Promise<T>): Promise<T> {
    try {
      return await withTimeout(promise, ENQUEUE_TIMEOUT_MS, 'queue operation');
    } catch (err) {
      if (err instanceof AppException) throw err;
      if (/timed out|ECONNREFUSED|Connection is closed|connect/i.test((err as Error).message)) {
        throw jobsUnavailable(err);
      }
      throw err;
    }
  }

  /** Adds a job. Throws 503 JOBS_UNAVAILABLE when Redis is down. */
  async enqueue<T extends object>(
    queueName: QueueName,
    jobName: string,
    data: T,
    opts: JobsOptions = {},
  ): Promise<{ id: string; queue: QueueName }> {
    const queue = this.queue(queueName);
    await this.assertAvailable();
    const job = await this.bounded(queue.add(jobName, data, opts));
    return { id: String(job.id), queue: queueName };
  }

  async overview(): Promise<JobsOverview> {
    const up = await this.isRedisUp();
    const queues: QueueSummary[] = [];
    for (const name of ALL_QUEUES) {
      if (!up) {
        queues.push({ name, counts: null, isPaused: null, workers: null });
        continue;
      }
      const queue = this.queue(name);
      try {
        const [counts, isPaused, workers] = await this.bounded(
          Promise.all([
            queue.getJobCounts(...LIST_STATES),
            queue.isPaused(),
            queue.getWorkersCount(),
          ]),
        );
        queues.push({ name, counts, isPaused, workers });
      } catch {
        queues.push({ name, counts: null, isPaused: null, workers: null });
      }
    }
    return { redis: up ? 'up' : 'down', workersEnabledHere: this.config.jobs.enabled, queues };
  }

  /** Total number of failed jobs over all queues (null when Redis is down). */
  async failedCount(): Promise<number | null> {
    const overview = await this.overview();
    if (overview.redis === 'down') return null;
    return overview.queues.reduce((sum, q) => sum + (q.counts?.failed ?? 0), 0);
  }

  async list(
    queueName: string,
    state: ListableJobState,
    page: number,
    pageSize: number,
  ): Promise<{ items: JobView[]; total: number }> {
    const queue = this.queue(queueName);
    await this.assertAvailable();
    const start = (page - 1) * pageSize;
    const [jobs, total] = await this.bounded(
      Promise.all([
        queue.getJobs([state as JobType], start, start + pageSize - 1, state === 'waiting'),
        queue.getJobCountByTypes(state as JobType),
      ]),
    );
    return {
      items: (jobs as Job[]).filter(Boolean).map((j) => this.view(j, queueName, state)),
      total,
    };
  }

  async get(queueName: string, jobId: string): Promise<JobDetailView> {
    const queue = this.queue(queueName);
    await this.assertAvailable();
    const job = (await this.bounded(queue.getJob(jobId))) as Job | undefined;
    if (!job) throw AppException.notFound();
    const state = await this.bounded(job.getState());
    return {
      ...this.view(job, queueName, state),
      stacktrace: (job.stacktrace ?? []).slice(-1).flatMap((s) => s.split('\n').slice(0, 8)),
      dataKeys:
        job.data && typeof job.data === 'object'
          ? Object.keys(job.data as object).slice(0, 50)
          : [],
    };
  }

  /** Retries a failed job. */
  async retry(queueName: string, jobId: string): Promise<JobDetailView> {
    const queue = this.queue(queueName);
    await this.assertAvailable();
    const job = (await this.bounded(queue.getJob(jobId))) as Job | undefined;
    if (!job) throw AppException.notFound();
    if ((await this.bounded(job.getState())) !== 'failed') {
      throw AppException.conflict('JOB_NOT_FAILED', serverMessage('errors.JOB_NOT_FAILED'));
    }
    await this.bounded(job.retry('failed'));
    return this.get(queueName, jobId);
  }

  /** Removes a job that is not currently running. */
  async remove(queueName: string, jobId: string): Promise<void> {
    const queue = this.queue(queueName);
    await this.assertAvailable();
    const job = (await this.bounded(queue.getJob(jobId))) as Job | undefined;
    if (!job) throw AppException.notFound();
    if ((await this.bounded(job.getState())) === 'active') {
      throw AppException.conflict('JOB_ACTIVE', serverMessage('errors.JOB_ACTIVE'));
    }
    await this.bounded(job.remove());
  }

  private view(job: Job, queue: string, state: string): JobView {
    const delay = job.opts?.delay ?? 0;
    return {
      id: String(job.id),
      name: job.name,
      queue,
      state,
      attemptsMade: job.attemptsMade ?? 0,
      maxAttempts: job.opts?.attempts ?? 1,
      progress: job.progress ?? 0,
      failedReason: job.failedReason ? job.failedReason.slice(0, 1000) : null,
      createdAt: iso(job.timestamp),
      processedAt: iso(job.processedOn),
      finishedAt: iso(job.finishedOn),
      delayUntil: delay > 0 ? iso(job.timestamp + delay) : null,
    };
  }
}
