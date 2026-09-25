import { BullModule } from '@nestjs/bullmq';
import { Global, Logger, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppConfig } from '../config/app-config';
import { redisOptionsFromUrl } from '../common/redis/redis.module';
import { JobsService } from './jobs.service';
import { ALL_QUEUES } from './queues';

/**
 * Background jobs infrastructure:
 * - BullMQ root connection from REDIS_URL / BULLMQ_PREFIX;
 * - every queue in ./queues.ts registered globally (inject with
 *   @InjectQueue(QUEUES.X) or, preferably, use JobsService.enqueue());
 * - JobsService: fail-fast producer (503 JOBS_UNAVAILABLE when Redis is
 *   down), queue/job inspection for GET /api/v1/admin/system/jobs;
 * - @nestjs/schedule for lightweight cron triggers (prefer BullMQ
 *   repeatable jobs for anything that must run once across instances).
 *
 * The API keeps serving when Redis is down: connections retry in the
 * background with a capped backoff and errors are logged (throttled).
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => {
        const logger = new Logger('BullMQ');
        return {
          connection: {
            ...redisOptionsFromUrl(config.redis.url),
            maxRetriesPerRequest: null,
            connectTimeout: 5_000,
            retryStrategy: (times: number) => {
              if (times === 3)
                logger.warn('Redis unreachable: background jobs are paused until it returns');
              return Math.min(times * 1_000, 15_000);
            },
          },
          prefix: config.jobs.bullPrefix,
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5_000 },
            removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
            removeOnFail: { age: 30 * 24 * 3600 },
          },
        };
      },
    }),
    BullModule.registerQueue(...ALL_QUEUES.map((name) => ({ name }))),
    ScheduleModule.forRoot(),
  ],
  providers: [JobsService],
  exports: [BullModule, JobsService],
})
export class JobsModule {}
