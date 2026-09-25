import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';
import {
  type AssistantProvider,
  NoneAssistantProvider,
  UnimplementedAssistantProvider,
} from './assistant/assistant.types';
import { NoneAvailabilityProvider } from './availability/none-availability.provider';
import type { GeocodingProvider } from './geocoding/geocoding.types';
import { NominatimGeocodingProvider, NoneGeocodingProvider } from './geocoding/nominatim.provider';
import { OutboundHttp } from './http/outbound-http';
import { ConsoleMailSender } from './mail/console-mail.sender';
import type { MailSender } from './mail/mail.types';
import { SmtpMailSender } from './mail/smtp-mail.sender';
import { RssNewsFetcher } from './news/rss-news.fetcher';
import { OAuthConfig } from './oauth/oauth-config';
import { ProviderRegistry } from './provider-registry';
import {
  ASSISTANT_PROVIDER,
  AVAILABILITY_PROVIDER,
  GEOCODING_PROVIDER,
  MAIL_SENDER,
  NEWS_FETCHER,
  OAUTH_CONFIG,
  PUSH_GATEWAY,
  ROUTING_PROVIDER,
  STATION_SOURCES,
  STORAGE_PROVIDER,
} from './provider-tokens';
import { ApnsPushChannel } from './push/apns-push.channel';
import { FcmPushChannel } from './push/fcm-push.channel';
import { PushGateway } from './push/push.gateway';
import {
  GOOGLE_ROUTES_DISABLED_REASON,
  NoneRoutingProvider,
} from './routing/none-routing.provider';
import { OpenRouteServiceProvider } from './routing/openrouteservice.provider';
import { OsrmRoutingProvider } from './routing/osrm-routing.provider';
import type { RoutingProvider } from './routing/routing.types';
import { ManualStationSource } from './stations/manual-station.source';
import { OcmStationSource } from './stations/ocm/ocm-station.source';
import {
  connectorTypeIndexLoader,
  StationSourceRegistry,
} from './stations/station-source.registry';
import { LocalFilesController } from './storage/local-files.controller';
import { LocalStorageProvider } from './storage/local-storage.provider';
import { S3StorageProvider } from './storage/s3-storage.provider';
import type { StorageProvider } from './storage/storage.types';

export function createStorageProvider(config: AppConfig): StorageProvider {
  return config.storage.driver === 's3'
    ? new S3StorageProvider(config)
    : new LocalStorageProvider(config);
}

export function createMailSender(config: AppConfig): MailSender {
  return config.mail.driver === 'smtp' ? new SmtpMailSender(config) : new ConsoleMailSender(config);
}

export function createRoutingProvider(config: AppConfig, http: OutboundHttp): RoutingProvider {
  switch (config.integrations.routing.provider) {
    case 'osrm':
      return new OsrmRoutingProvider(config, http);
    case 'openrouteservice':
      return new OpenRouteServiceProvider(config, http);
    case 'google':
      return new NoneRoutingProvider('google', GOOGLE_ROUTES_DISABLED_REASON);
    default:
      return new NoneRoutingProvider();
  }
}

export function createGeocodingProvider(config: AppConfig, http: OutboundHttp): GeocodingProvider {
  return config.integrations.geocoding.baseUrl
    ? new NominatimGeocodingProvider(config, http)
    : new NoneGeocodingProvider();
}

export function createAssistantProvider(config: AppConfig): AssistantProvider {
  switch (config.integrations.assistant.provider) {
    case 'anthropic':
      return new UnimplementedAssistantProvider(
        'anthropic',
        'The Anthropic adapter is not implemented yet: it needs the official @anthropic-ai/sdk dependency (requested in docs/decisions/backend-platform.md).',
      );
    case 'openai_compatible':
      return new UnimplementedAssistantProvider(
        'openai_compatible',
        'The OpenAI-compatible adapter is not implemented yet (see docs/decisions/backend-platform.md).',
      );
    default:
      return new NoneAssistantProvider();
  }
}

@Injectable()
class ProvidersShutdown implements OnApplicationShutdown {
  constructor(@Inject(PUSH_GATEWAY) private readonly push: PushGateway) {}
  onApplicationShutdown(): void {
    (this.push.channel('apns') as ApnsPushChannel).close();
  }
}

/**
 * Provider adapters behind interfaces (contract §4.6). Global: inject by
 * token anywhere, e.g. `@Inject(MAIL_SENDER) mail: MailSender`. Every
 * adapter reports `status()`; unconfigured adapters refuse to work (503)
 * instead of pretending. See docs/decisions/backend-platform.md.
 */
@Global()
@Module({
  controllers: [LocalFilesController],
  providers: [
    OutboundHttp,
    { provide: STORAGE_PROVIDER, inject: [AppConfig], useFactory: createStorageProvider },
    { provide: MAIL_SENDER, inject: [AppConfig], useFactory: createMailSender },
    {
      provide: STATION_SOURCES,
      inject: [AppConfig, OutboundHttp, PrismaService],
      useFactory: (config: AppConfig, http: OutboundHttp, prisma: PrismaService) =>
        new StationSourceRegistry([
          new OcmStationSource(config, http, connectorTypeIndexLoader(prisma)),
          new ManualStationSource(),
        ]),
    },
    { provide: AVAILABILITY_PROVIDER, useFactory: () => new NoneAvailabilityProvider() },
    {
      provide: ROUTING_PROVIDER,
      inject: [AppConfig, OutboundHttp],
      useFactory: createRoutingProvider,
    },
    {
      provide: GEOCODING_PROVIDER,
      inject: [AppConfig, OutboundHttp],
      useFactory: createGeocodingProvider,
    },
    {
      provide: NEWS_FETCHER,
      inject: [OutboundHttp],
      useFactory: (http: OutboundHttp) => new RssNewsFetcher(http),
    },
    {
      provide: PUSH_GATEWAY,
      inject: [AppConfig, OutboundHttp],
      useFactory: (config: AppConfig, http: OutboundHttp) =>
        new PushGateway(new FcmPushChannel(config, http), new ApnsPushChannel(config)),
    },
    {
      provide: OAUTH_CONFIG,
      inject: [AppConfig],
      useFactory: (c: AppConfig) => new OAuthConfig(c),
    },
    { provide: ASSISTANT_PROVIDER, inject: [AppConfig], useFactory: createAssistantProvider },
    ProviderRegistry,
    ProvidersShutdown,
  ],
  exports: [
    OutboundHttp,
    STORAGE_PROVIDER,
    MAIL_SENDER,
    STATION_SOURCES,
    AVAILABILITY_PROVIDER,
    ROUTING_PROVIDER,
    GEOCODING_PROVIDER,
    NEWS_FETCHER,
    PUSH_GATEWAY,
    OAUTH_CONFIG,
    ASSISTANT_PROVIDER,
    ProviderRegistry,
  ],
})
export class ProvidersModule {}
