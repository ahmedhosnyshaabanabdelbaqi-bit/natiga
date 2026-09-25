/**
 * Public API of the provider adapters (contract §4.6). Example:
 *
 *   import { MAIL_SENDER, type MailSender } from '../../providers';
 *   constructor(@Inject(MAIL_SENDER) private readonly mail: MailSender) {}
 */
export * from './provider-tokens';
export * from './provider-status';
export * from './provider-check';
export { ProviderRegistry, type IntegrationStatus, type Capabilities } from './provider-registry';
export { OutboundHttp, upstreamException, UpstreamHttpError } from './http/outbound-http';

export type * from './storage/storage.types';
export { StorageObjectNotFoundError } from './storage/storage.types';
export {
  assertValidKey,
  InvalidStorageKeyError,
  isPublicKey,
  safeFileName,
  storageKey,
  STORAGE_ROOTS,
} from './storage/storage-keys';

export type * from './mail/mail.types';
export { ConsoleMailSender } from './mail/console-mail.sender';

export type * from './stations/station-source.types';
export { StationSourceRegistry } from './stations/station-source.registry';
export { ConnectorTypeIndex } from './stations/connector-type-index';

export type * from './availability/availability.types';
export { effectiveAvailability } from './availability/availability.types';
export type * from './routing/routing.types';
export type * from './geocoding/geocoding.types';
export type * from './news/news.types';
export type * from './push/push.types';
export type { PushGateway } from './push/push.gateway';
export type { OAuthConfig, OAuthProviderConfig, OAuthProviderName } from './oauth/oauth-config';
export type * from './assistant/assistant.types';
