import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AppConfig } from '../../config/app-config';
import { REDIS } from '../../common/redis/redis.module';
import { appVersion, withTimeout } from '../../common/utils/app-version';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_PROVIDER } from '../../providers/provider-tokens';
import type { StorageProvider } from '../../providers/storage/storage.types';
import type { DependencyCheckDto, HealthDto } from './health.dto';

const CHECK_TIMEOUT_MS = 2_000;

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly config: AppConfig,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async check(): Promise<HealthDto> {
    const [database, redis, storage] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkStorage(),
    ]);
    const status: HealthDto['status'] =
      database.status === 'down'
        ? 'error'
        : redis.status === 'down' || storage.status === 'down'
          ? 'degraded'
          : 'ok';
    return {
      status,
      checks: { database, redis, storage },
      version: appVersion(),
      environment: this.config.env,
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<DependencyCheckDto> {
    try {
      const latencyMs = await withTimeout(this.prisma.ping(), CHECK_TIMEOUT_MS, 'database ping');
      return { status: 'up', latencyMs };
    } catch (err) {
      return { status: 'down', error: this.reason(err) };
    }
  }

  /** Storage probe (local: write/read/delete a tiny object; S3: HeadBucket). */
  private async checkStorage(): Promise<DependencyCheckDto> {
    try {
      const result = await withTimeout(this.storage.check(), CHECK_TIMEOUT_MS * 2, 'storage check');
      return result.ok
        ? { status: 'up', latencyMs: result.latencyMs }
        : { status: 'down', error: result.error ?? 'error' };
    } catch (err) {
      return { status: 'down', error: this.reason(err) };
    }
  }

  private async checkRedis(): Promise<DependencyCheckDto> {
    const started = performance.now();
    try {
      const reply = await withTimeout(this.redis.ping(), CHECK_TIMEOUT_MS, 'redis ping');
      if (reply !== 'PONG') return { status: 'down', error: 'unexpected reply' };
      return { status: 'up', latencyMs: Math.round((performance.now() - started) * 100) / 100 };
    } catch (err) {
      return { status: 'down', error: this.reason(err) };
    }
  }

  /** Coarse reason only — connection strings/credentials never leak. */
  private reason(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    if (/timed out/i.test(msg)) return 'timeout';
    if (/ECONNREFUSED|connect|Connection is closed|offline queue/i.test(msg)) return 'unreachable';
    if (/auth|password/i.test(msg)) return 'authentication failed';
    return 'error';
  }
}
