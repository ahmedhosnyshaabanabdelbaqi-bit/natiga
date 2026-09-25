/**
 * Injection tokens of the provider adapters (contract §4.6). Inject the
 * interface with its token, e.g.
 *
 *   constructor(@Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider) {}
 *   constructor(@Inject(MAIL_SENDER) private readonly mail: MailSender) {}
 *
 * Tokens are plain strings so modules may also resolve them lazily with
 * `moduleRef.get('MAIL_SENDER', { strict: false })` (the auth module does).
 * ProvidersModule is global, so no import is needed in feature modules.
 */
export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';
export const MAIL_SENDER = 'MAIL_SENDER';
/** StationSourceRegistry (all station sources by key). */
export const STATION_SOURCES = 'STATION_SOURCES';
export const AVAILABILITY_PROVIDER = 'AVAILABILITY_PROVIDER';
export const ROUTING_PROVIDER = 'ROUTING_PROVIDER';
export const GEOCODING_PROVIDER = 'GEOCODING_PROVIDER';
export const NEWS_FETCHER = 'NEWS_FETCHER';
/** PushGateway (FCM + APNs + in-app channel). */
export const PUSH_GATEWAY = 'PUSH_GATEWAY';
export const OAUTH_CONFIG = 'OAUTH_CONFIG';
export const ASSISTANT_PROVIDER = 'ASSISTANT_PROVIDER';
