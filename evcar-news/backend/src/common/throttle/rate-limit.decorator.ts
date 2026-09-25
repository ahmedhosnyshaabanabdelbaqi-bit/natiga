import { Throttle } from '@nestjs/throttler';

/**
 * Named rate-limit presets (per client IP; ttl in ms). Applied per route with
 * `@RateLimit('auth')`. Every route also has the global default budget
 * (RATE_LIMIT_DEFAULT_PER_MINUTE); use `@SkipThrottle()` for health checks.
 */
export const RATE_LIMIT_PRESETS = {
  /** login, register, refresh, oauth */
  auth: { limit: 10, ttl: 60_000 },
  /** forgot-password, resend-verification (e-mail sending) */
  authEmail: { limit: 5, ttl: 15 * 60_000 },
  search: { limit: 60, ttl: 60_000 },
  /** station reports, content reports */
  reports: { limit: 10, ttl: 60 * 60_000 },
  uploads: { limit: 60, ttl: 60_000 },
  comments: { limit: 10, ttl: 60_000 },
  /** generic authenticated writes */
  write: { limit: 60, ttl: 60_000 },
} as const;

export type RateLimitPreset = keyof typeof RATE_LIMIT_PRESETS;

export function RateLimit(preset: RateLimitPreset): MethodDecorator & ClassDecorator {
  const { limit, ttl } = RATE_LIMIT_PRESETS[preset];
  return Throttle({ default: { limit, ttl } });
}
