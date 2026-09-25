import { Logger } from '@nestjs/common';
import { ThrottlerStorageService, type ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Fixed-window counter with block period, atomic in Redis (Lua).
 * KEYS[1] hits key, KEYS[2] block key; ARGV ttlMs, limit, blockMs.
 * Returns {hits, hitsTtlMs, blocked(0/1), blockTtlMs}.
 */
const SCRIPT = `
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl > 0 then
  local hits = tonumber(redis.call('GET', KEYS[1]) or '0')
  local ttl = redis.call('PTTL', KEYS[1])
  return {hits, ttl, 1, blockTtl}
end
local hits = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return {hits, ttl, 1, tonumber(ARGV[3])}
end
return {hits, ttl, 0, 0}
`;

/**
 * Redis-backed ThrottlerStorage so limits hold across instances. If Redis is
 * unavailable it degrades to a per-process in-memory store (still limiting)
 * instead of failing requests.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly fallback = new ThrottlerStorageService();
  private lastWarn = 0;

  constructor(
    private readonly redis: Redis,
    private readonly prefix: string,
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const base = `${this.prefix}throttle:${throttlerName}:${key}`;
    try {
      const res = (await this.redis.eval(
        SCRIPT,
        2,
        `${base}:hits`,
        `${base}:block`,
        String(Math.max(1, Math.ceil(ttl))),
        String(limit),
        String(Math.max(1, Math.ceil(blockDuration > 0 ? blockDuration : ttl))),
      )) as [number, number, number, number];
      const [hits, hitsTtl, blocked, blockTtl] = res.map(Number);
      return {
        totalHits: hits,
        timeToExpire: Math.max(0, Math.ceil(hitsTtl / 1000)),
        isBlocked: blocked === 1,
        timeToBlockExpire: Math.max(0, Math.ceil(blockTtl / 1000)),
      };
    } catch (err) {
      if (Date.now() - this.lastWarn > 30_000) {
        this.logger.warn(
          `Redis unavailable for rate limiting, using in-memory fallback: ${(err as Error).message}`,
        );
        this.lastWarn = Date.now();
      }
      return this.fallback.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }
}
