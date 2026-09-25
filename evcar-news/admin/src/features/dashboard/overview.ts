import type { Health, SystemOverview } from '@/features/system/api';

/**
 * Readers for GET /admin/system/overview (SystemOverviewDto) and the public
 * GET /health (HealthDto). They only reshape server numbers for display and
 * never invent values: a missing breakdown stays empty, it is not shown as 0.
 */

export type ServiceState = 'up' | 'down';

export interface ServiceHealth {
  key: 'database' | 'redis' | 'storage';
  state: ServiceState;
  latencyMs?: number | undefined;
  error?: string | undefined;
}

export function servicesFromHealth(h: Health): ServiceHealth[] {
  return (['database', 'redis', 'storage'] as const).map((key) => ({
    key,
    state: h.checks[key].status,
    latencyMs: h.checks[key].latencyMs,
    error: h.checks[key].error,
  }));
}

export const total = (m: Record<string, number> | null | undefined) =>
  m ? Object.values(m).reduce((a, b) => a + b, 0) : 0;

export interface CountTile {
  key: string;
  value: number;
  /** Breakdown by status / source, e.g. { draft: 3, published: 10 }. */
  breakdown?: Record<string, number>;
  /** Highlight when > 0 (items waiting for a moderator). */
  attention?: boolean;
}

export function countTiles(o: SystemOverview): CountTile[] {
  const c = o.counts;
  const v = c.vehicles;
  return [
    { key: 'users', value: c.users },
    { key: 'articles', value: total(c.articles), breakdown: c.articles },
    { key: 'brands', value: total(v.brands), breakdown: v.brands ?? {} },
    { key: 'models', value: total(v.models), breakdown: v.models ?? {} },
    { key: 'variants', value: total(v.variants), breakdown: v.variants ?? {} },
    {
      key: 'stations',
      value: total(c.stationsByPublication),
      breakdown: c.stationsByPublication,
    },
    { key: 'tours', value: total(c.tours), breakdown: c.tours },
    { key: 'media', value: total(c.media), breakdown: c.media },
    { key: 'openStationReports', value: c.openStationReports, attention: true },
    { key: 'pendingReviews', value: c.pendingReviews, attention: true },
    { key: 'pendingComments', value: c.pendingComments, attention: true },
  ];
}

export function staleTiles(
  o: SystemOverview,
): { key: string; value: number; threshold?: number }[] {
  const s = o.staleData;
  const th = s.thresholds;
  return [
    {
      key: 'stationsNotRecentlyVerified',
      value: s.stationsNotRecentlyVerified,
      threshold: th.stationVerificationDays,
    },
    { key: 'pricesOutdated', value: s.pricesOutdated, threshold: th.priceAgeDays },
    { key: 'specsUnverified', value: s.specsUnverified },
    { key: 'rssFeedsFailing', value: s.rssFeedsFailing, threshold: th.rssSuccessHours },
    { key: 'mediaStuck', value: s.mediaStuck, threshold: th.mediaStuckHours },
  ];
}

/** Demo rows that exist (flagged is_demo); never expected in production. */
export function demoRows(o: SystemOverview): [string, number][] {
  return Object.entries(o.counts.demoRows).filter(([, n]) => n > 0);
}

export function splitDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
  };
}
