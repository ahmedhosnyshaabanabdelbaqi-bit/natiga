import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { AppConfig } from '../../config/app-config';
import { REDIS } from '../redis/redis.module';
import { AppThrottlerGuard } from './app-throttler.guard';
import { RedisThrottlerStorage } from './redis-throttler.storage';

/** Global rate limiting (default budget per IP + per-route presets). */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [AppConfig, REDIS],
      useFactory: (config: AppConfig, redis: Redis) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: config.rateLimit.defaultPerMinute }],
        storage:
          config.rateLimit.storage === 'redis'
            ? new RedisThrottlerStorage(redis, config.redis.keyPrefix)
            : undefined,
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class ThrottleModule {}
