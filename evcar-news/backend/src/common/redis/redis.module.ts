import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Redis, type RedisOptions } from 'ioredis';
import { AppConfig } from '../../config/app-config';

/** Injection token for the shared ioredis client. */
export const REDIS = Symbol('REDIS');

/** Parses redis:// / rediss:// URLs into ioredis/BullMQ connection options. */
export function redisOptionsFromUrl(url: string): RedisOptions {
  const u = new URL(url);
  const db = u.pathname && u.pathname !== '/' ? Number(u.pathname.slice(1)) : 0;
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: Number.isFinite(db) ? db : 0,
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

/** Builds a namespaced key: `${REDIS_KEY_PREFIX}${parts.join(':')}`. */
@Injectable()
export class RedisKeys {
  constructor(private readonly config: AppConfig) {}
  key(...parts: string[]): string {
    return `${this.config.redis.keyPrefix}${parts.join(':')}`;
  }
}

@Injectable()
class RedisShutdown implements OnApplicationShutdown {
  private readonly logger = new Logger('Redis');
  constructor(@Inject(REDIS) private readonly redis: Redis) {}
  async onApplicationShutdown(): Promise<void> {
    try {
      if (this.redis.status === 'ready') await this.redis.quit();
      else this.redis.disconnect();
    } catch (err) {
      this.logger.warn({ err }, 'Error while closing Redis');
    }
  }
}

/**
 * Global shared Redis client (rate limiting, caches, health). Connects lazily
 * and never crashes the app when Redis is down (commands fail fast instead).
 * BullMQ uses its own connections (see JobsModule).
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => {
        const logger = new Logger('Redis');
        const client = new Redis({
          ...redisOptionsFromUrl(config.redis.url),
          lazyConnect: true,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          connectTimeout: 5_000,
          retryStrategy: (times) => Math.min(times * 500, 10_000),
        });
        let lastError = 0;
        client.on('error', (err: Error) => {
          // Throttle repeated connection errors in logs.
          if (Date.now() - lastError > 30_000) logger.warn(`Redis error: ${err.message}`);
          lastError = Date.now();
        });
        client.connect().catch(() => undefined);
        return client;
      },
    },
    RedisKeys,
    RedisShutdown,
  ],
  exports: [REDIS, RedisKeys],
})
export class RedisModule {}
