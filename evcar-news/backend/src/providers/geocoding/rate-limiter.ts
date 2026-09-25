import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';

/**
 * Serializes calls so that at most one starts every `intervalMs` (in this
 * process). Callers beyond `maxQueue` are rejected with 429 instead of
 * piling up. Used to respect per-second usage policies (e.g. Nominatim:
 * max 1 request/second).
 */
export class IntervalRateLimiter {
  private nextSlot = 0;
  private queued = 0;

  constructor(
    private readonly intervalMs: number,
    private readonly maxQueue = 20,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {}

  get pending(): number {
    return this.queued;
  }

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    if (this.queued >= this.maxQueue) {
      throw new AppException({
        status: HttpStatus.TOO_MANY_REQUESTS,
        code: ErrorCode.RATE_LIMITED,
        headers: { 'Retry-After': String(Math.ceil((this.intervalMs * this.maxQueue) / 1000)) },
      });
    }
    this.queued += 1;
    try {
      const now = this.now();
      const slot = Math.max(now, this.nextSlot);
      this.nextSlot = slot + this.intervalMs;
      if (slot > now) await this.sleep(slot - now);
      return await fn();
    } finally {
      this.queued -= 1;
    }
  }
}

/** Tiny TTL + LRU cache (insertion order of Map). */
export class TtlCache<V> {
  private readonly map = new Map<string, { value: V; expires: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 1000,
  ) {}

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, { value, expires: Date.now() + this.ttlMs });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
}
