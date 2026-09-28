import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AppConfig } from '../../config/app-config';
import { AppException } from '../../common/errors/app.exception';
import { REDIS } from '../../common/redis/redis.module';
import {
  ROUTING_PROVIDER,
  type RouteRequest,
  type RouteResult,
  type RoutingProvider,
} from '../../providers';

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

/**
 * Protects the operator's routing quota (review 3, finding 1). Every upstream
 * call of the trip planner goes through here:
 *
 * 1. **Cache** — the same waypoints (rounded to 5 decimals, ≈ 1 m, plus the
 *    language) reuse the stored route for `ROUTING_CACHE_TTL_SECONDS`.
 * 2. **Global budget** — at most `ROUTING_MINUTE_BUDGET` upstream calls per
 *    minute and `ROUTING_DAILY_BUDGET` per UTC day for all users together
 *    (0 = unlimited). Past the budget the planner answers 503
 *    `INTEGRATION_QUOTA` with `Retry-After` instead of burning the provider's
 *    quota, so other users keep working again the next minute/day.
 *
 * Redis holds the cache and counters (shared by every instance); when Redis is
 * down, a per-process memory fallback keeps both limits in force.
 */
@Injectable()
export class RoutingGuardService {
  private readonly logger = new Logger(RoutingGuardService.name);
  private readonly memory = new Map<string, MemoryEntry>();
  private lastWarn = 0;

  constructor(
    @Inject(ROUTING_PROVIDER) private readonly provider: RoutingProvider,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly config: AppConfig,
  ) {}

  get name(): string {
    return this.provider.name;
  }

  get configured(): boolean {
    return this.provider.configured;
  }

  static cacheKey(provider: string, request: RouteRequest): string {
    const points = request.waypoints.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`);
    const raw = `${provider}|${request.language ?? ''}|${points.join(';')}`;
    return createHash('sha256').update(raw).digest('hex').slice(0, 40);
  }

  async route(request: RouteRequest): Promise<RouteResult> {
    const cfg = this.config.integrations.routing;
    const prefix = `${this.config.redis.keyPrefix}routing:`;
    const cacheKey = `${prefix}route:${RoutingGuardService.cacheKey(this.provider.name, request)}`;
    if (cfg.cacheTtlSeconds > 0) {
      const hit = await this.get(cacheKey);
      if (hit) {
        try {
          return JSON.parse(hit) as RouteResult;
        } catch {
          /* corrupt entry: recompute */
        }
      }
    }
    await this.spend(prefix);
    const result = await this.provider.route(request);
    if (cfg.cacheTtlSeconds > 0) {
      await this.set(cacheKey, JSON.stringify(result), cfg.cacheTtlSeconds * 1000);
    }
    return result;
  }

  /** Counts one upstream call against the minute and day budgets, or refuses it. */
  private async spend(prefix: string): Promise<void> {
    const { minuteBudget, dailyBudget } = this.config.integrations.routing;
    const now = new Date();
    const checks: { key: string; limit: number; ttlMs: number; retryAfter: number }[] = [];
    if (minuteBudget > 0) {
      const minute = Math.floor(now.getTime() / 60_000);
      checks.push({
        key: `${prefix}budget:m:${minute}`,
        limit: minuteBudget,
        ttlMs: 120_000,
        retryAfter: 60 - now.getUTCSeconds(),
      });
    }
    if (dailyBudget > 0) {
      const day = now.toISOString().slice(0, 10);
      const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      checks.push({
        key: `${prefix}budget:d:${day}`,
        limit: dailyBudget,
        ttlMs: 26 * 3600_000,
        retryAfter: Math.max(1, Math.ceil((midnight - now.getTime()) / 1000)),
      });
    }
    // Check every window before counting, so a refused call does not use up the other one.
    for (const c of checks) {
      if ((await this.count(c.key)) >= c.limit) throw this.quotaError(c.retryAfter, c.key);
    }
    for (const c of checks) {
      const used = await this.incr(c.key, c.ttlMs);
      if (used > c.limit) throw this.quotaError(c.retryAfter, c.key);
    }
  }

  private quotaError(retryAfter: number, key: string): AppException {
    const window = key.includes(':budget:d:') ? 'day' : 'minute';
    return new AppException({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      code: 'INTEGRATION_QUOTA',
      message: {
        ar: 'بلغ تخطيط الرحلات الحد المسموح من طلبات خدمة المسارات مؤقتًا. حاول لاحقًا.',
        en: 'Trip planning has reached its routing-service limit for now. Please try again later.',
      },
      details: {
        integration: `routing.${this.provider.name}`,
        window,
        retryAfterSeconds: retryAfter,
      },
      headers: { 'Retry-After': String(retryAfter) },
    });
  }

  // --- storage (Redis with memory fallback) ---------------------------------------------------

  private async run<T>(redisFn: () => Promise<T>, memoryFn: () => T): Promise<T> {
    if (this.redis.status === 'ready') {
      try {
        return await redisFn();
      } catch (err) {
        if (Date.now() - this.lastWarn > 30_000) {
          this.logger.warn(
            `Redis unavailable for routing cache/budget, using memory: ${String(err)}`,
          );
          this.lastWarn = Date.now();
        }
      }
    }
    return memoryFn();
  }

  private live(key: string): MemoryEntry | undefined {
    const e = this.memory.get(key);
    if (e && e.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return undefined;
    }
    return e;
  }

  private get(key: string): Promise<string | null> {
    return this.run(
      () => this.redis.get(key),
      () => this.live(key)?.value ?? null,
    );
  }

  private set(key: string, value: string, ttlMs: number): Promise<unknown> {
    return this.run<unknown>(
      () => this.redis.set(key, value, 'PX', ttlMs),
      () => {
        if (this.memory.size > 2_000) this.prune();
        this.memory.set(key, { value, expiresAt: Date.now() + ttlMs });
      },
    );
  }

  private count(key: string): Promise<number> {
    return this.run(
      async () => Number((await this.redis.get(key)) ?? 0),
      () => Number(this.live(key)?.value ?? 0),
    );
  }

  private incr(key: string, ttlMs: number): Promise<number> {
    return this.run(
      async () => {
        const v = await this.redis.incr(key);
        if (v === 1) await this.redis.pexpire(key, ttlMs);
        return v;
      },
      () => {
        const e = this.live(key);
        const value = Number(e?.value ?? 0) + 1;
        this.memory.set(key, {
          value: String(value),
          expiresAt: e?.expiresAt ?? Date.now() + ttlMs,
        });
        return value;
      },
    );
  }

  private prune(): void {
    const now = Date.now();
    for (const [k, e] of this.memory) if (e.expiresAt <= now) this.memory.delete(k);
    // Still too big: drop the oldest cached routes (never the budget counters).
    for (const k of this.memory.keys()) {
      if (this.memory.size <= 1_500) break;
      if (k.includes(':route:')) this.memory.delete(k);
    }
  }
}
