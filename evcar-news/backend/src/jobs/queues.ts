/**
 * BullMQ queue names. Every queue below is registered globally by
 * JobsModule, so any module can `@InjectQueue(QUEUES.IMPORTS)` or use
 * `JobsService.enqueue()` (preferred: fails fast with 503 JOBS_UNAVAILABLE
 * when Redis is down instead of hanging).
 *
 * Processors must only be provided when `config.jobs.enabled` is true
 * (see `jobsEnabledProviders`).
 */
export const QUEUES = {
  /** Image validation, renditions, panorama tiles (media / tours). */
  MEDIA_PROCESSING: 'media-processing',
  /** CSV imports (vehicles, prices, stations...) tracked in import_jobs. */
  IMPORTS: 'imports',
  /** Push / e-mail fan-out of notifications and campaigns. */
  NOTIFICATIONS: 'notifications',
  /** Provider synchronisation (Open Charge Map, partner feeds...). */
  SYNC: 'sync',
  RSS_IMPORT: 'rss-import',
  STATIONS_SYNC: 'stations-sync',
  SEARCH_INDEX: 'search-index',
  CONTENT_SCHEDULER: 'content-scheduler',
  MAINTENANCE: 'maintenance',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const ALL_QUEUES: readonly QueueName[] = Object.values(QUEUES);

export function isQueueName(value: string): value is QueueName {
  return (ALL_QUEUES as readonly string[]).includes(value);
}

/**
 * Returns `providers` only when JOBS_ENABLED is true (read from process.env
 * at module definition time, default true outside tests). Use it for
 * @Processor classes so API-only instances and e2e tests run no workers:
 *
 *   providers: [MediaService, ...jobsEnabledProviders([MediaProcessor])]
 */
export function jobsEnabledProviders<T>(providers: T[]): T[] {
  const raw = process.env.JOBS_ENABLED?.trim().toLowerCase();
  const enabled =
    raw === undefined || raw === ''
      ? process.env.NODE_ENV !== 'test'
      : ['1', 'true', 'yes', 'on'].includes(raw);
  return enabled ? providers : [];
}
