import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import type { AssistantProvider } from './assistant/assistant.types';
import type { AvailabilityProvider } from './availability/availability.types';
import type { GeocodingProvider } from './geocoding/geocoding.types';
import type { MailSender } from './mail/mail.types';
import type { NewsFetcher } from './news/news.types';
import type { OAuthConfig } from './oauth/oauth-config';
import { NOT_CONFIGURED_CHECK, type ProviderCheckResult } from './provider-check';
import type { ProviderStatus } from './provider-status';
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
import type { PushGateway } from './push/push.gateway';
import type { RoutingProvider } from './routing/routing.types';
import type { StationSourceRegistry } from './stations/station-source.registry';
import type { StorageProvider } from './storage/storage.types';

export interface IntegrationStatus extends ProviderStatus {
  /** Stable id "<type>.<name>", e.g. "stations.open_charge_map". */
  id: string;
  type: string;
  enabled: boolean;
  /** true when POST .../integrations/:id/check can run a live check. */
  checkable: boolean;
}

/** What optional capabilities are usable right now (feature gating in /app-config). */
export interface Capabilities {
  routing: boolean;
  geocoding: boolean;
  assistant: boolean;
  push: boolean;
  liveAvailability: boolean;
  stationsSync: boolean;
}

/**
 * Aggregates every provider adapter for GET /api/v1/admin/system/integrations
 * and feature gating. Never exposes secrets: statuses only name missing
 * variables.
 */
@Injectable()
export class ProviderRegistry {
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
    @Inject(STATION_SOURCES) private readonly stations: StationSourceRegistry,
    @Inject(AVAILABILITY_PROVIDER) private readonly availability: AvailabilityProvider,
    @Inject(ROUTING_PROVIDER) private readonly routing: RoutingProvider,
    @Inject(GEOCODING_PROVIDER) private readonly geocoding: GeocodingProvider,
    @Inject(NEWS_FETCHER) private readonly news: NewsFetcher,
    @Inject(PUSH_GATEWAY) private readonly push: PushGateway,
    @Inject(OAUTH_CONFIG) private readonly oauth: OAuthConfig,
    @Inject(ASSISTANT_PROVIDER) private readonly assistant: AssistantProvider,
  ) {}

  private checks(): Map<string, () => Promise<ProviderCheckResult>> {
    const map = new Map<string, () => Promise<ProviderCheckResult>>();
    const storageName = this.storage.driver;
    map.set(`storage.${storageName}`, () => this.storage.check());
    map.set(`mail.${this.mail.driver}`, () => this.mail.check());
    for (const source of this.stations.list()) {
      const name = source.key === 'ocm' ? 'open_charge_map' : source.key;
      map.set(`stations.${name}`, () => source.check());
    }
    map.set(`routing.${this.routing.name}`, () => this.routing.check());
    map.set(`geocoding.${this.geocoding.name}`, () => this.geocoding.check());
    map.set('push.fcm', () => this.push.channel('fcm').check());
    map.set('push.apns', () => this.push.channel('apns').check());
    return map;
  }

  async statuses(): Promise<IntegrationStatus[]> {
    const raw: ProviderStatus[] = [
      await this.storage.status(),
      await this.mail.status(),
      ...(await Promise.all(this.stations.list().map(async (s) => s.status()))),
      await this.availability.status(),
      await this.routing.status(),
      await this.geocoding.status(),
      await this.news.status(),
      ...this.push.statuses(),
      ...this.oauth.statuses(),
      await this.assistant.status(),
    ];
    const checkable = this.checks();
    return raw.map((s) => {
      const id = `${s.type}.${s.name}`;
      return {
        id,
        ...s,
        enabled: s.enabled ?? s.configured,
        checkable: s.configured && checkable.has(id),
      };
    });
  }

  /** Runs the live check of one adapter ("test connection"). */
  async check(id: string): Promise<ProviderCheckResult> {
    const statuses = await this.statuses();
    const status = statuses.find((s) => s.id === id);
    if (!status) throw AppException.notFound();
    if (!status.configured) return NOT_CONFIGURED_CHECK;
    const run = this.checks().get(id);
    if (!run) return { ok: true, skipped: true, error: 'no live check for this adapter' };
    return run();
  }

  capabilities(): Capabilities {
    return {
      routing: this.routing.configured,
      geocoding: this.geocoding.configured,
      assistant: this.assistant.configured,
      push: this.push.anyConfigured,
      liveAvailability: this.availability.isLive,
      stationsSync: this.stations.syncable().some((s) => {
        const st = s.status();
        return !(st instanceof Promise) && st.configured;
      }),
    };
  }
}
