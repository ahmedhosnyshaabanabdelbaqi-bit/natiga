import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MarketResolverService } from '../../common/i18n/market-resolver.service';
import { PrismaService } from '../../prisma/prisma.service';
import { type Capabilities, ProviderRegistry } from '../../providers/provider-registry';
import type { AppConfigDto } from './settings.dto';
import { CONFIG_CHANGED_EVENT, SettingsService } from './settings.service';
import {
  FEATURE_FLAGS,
  IMPLEMENTED_FEATURES,
  type FeatureFlag,
  type FeaturesSettings,
  type SettingValues,
} from './settings.types';

const CACHE_MS = 30_000;

interface MarketRow {
  code: string;
  nameAr: string;
  nameEn: string;
  currencyCode: string;
  timezone: string;
  enabled: boolean;
}

/**
 * Pure mapping to the /app-config shape fixed in ARCHITECTURE §4.4.1.
 * Forced off whatever is stored: features whose module is not implemented
 * yet (IMPLEMENTED_FEATURES) and features that depend on an unconfigured
 * service (trip planner without routing, assistant without an LLM).
 */
export function buildAppConfig(input: {
  settings: Pick<
    SettingValues,
    'branding' | 'defaults' | 'home.sections' | 'features' | 'map' | 'share' | 'legal'
  >;
  markets: MarketRow[];
  defaultMarket: string;
  capabilities: Pick<Capabilities, 'routing' | 'assistant'>;
  /** Implemented feature modules (tests may pass their own set). */
  implemented?: ReadonlySet<FeatureFlag>;
}): AppConfigDto {
  const { settings: s, capabilities } = input;
  const implemented = input.implemented ?? IMPLEMENTED_FEATURES;
  const features = {} as FeaturesSettings;
  for (const flag of FEATURE_FLAGS) {
    features[flag] = s.features[flag] === true && implemented.has(flag);
  }
  if (!capabilities.routing) features.tripPlanner = false;
  if (!capabilities.assistant) features.assistant = false;
  return {
    branding: {
      appName: s.branding.appName,
      logoUrl: s.branding.logoUrl,
      primaryColor: s.branding.primaryColor,
      accentColor: s.branding.accentColor,
    },
    languages: [...s.defaults.languages],
    defaultLanguage: s.defaults.defaultLanguage,
    defaultMarket: input.defaultMarket,
    markets: input.markets.map((m) => ({
      code: m.code,
      nameAr: m.nameAr,
      nameEn: m.nameEn,
      currency: m.currencyCode,
      timezone: m.timezone,
      enabled: m.enabled,
    })),
    homeSections: [...s['home.sections']]
      .sort((a, b) => a.order - b.order)
      .map((h) => ({ key: h.key, enabled: h.enabled, order: h.order })),
    features,
    map: {
      tileUrlTemplate: s.map.tileUrlTemplate,
      attribution: s.map.attribution,
      maxZoom: s.map.maxZoom,
      configured: !!(s.map.tileUrlTemplate && s.map.attribution),
    },
    share: { baseUrl: s.share.baseUrl },
    legal: { privacyUrl: s.legal.privacyUrl, termsUrl: s.legal.termsUrl },
  };
}

export function etagOf(body: unknown): string {
  return `"ac-${createHash('sha256').update(JSON.stringify(body)).digest('base64url').slice(0, 27)}"`;
}

/** GET /api/v1/app-config (public): cached 30 s, invalidated on changes, strong ETag. */
@Injectable()
export class AppConfigService {
  private readonly logger = new Logger('AppConfig');
  private cache?: { at: number; body: AppConfigDto; etag: string };

  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
    private readonly marketResolver: MarketResolverService,
    private readonly providers: ProviderRegistry,
  ) {}

  @OnEvent(CONFIG_CHANGED_EVENT)
  invalidate(): void {
    this.cache = undefined;
  }

  async get(): Promise<{ body: AppConfigDto; etag: string }> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache;
    try {
      const body = await this.build();
      this.cache = { at: Date.now(), body, etag: etagOf(body) };
      return this.cache;
    } catch (err) {
      if (this.cache) {
        this.logger.warn(`Serving stale app-config: ${(err as Error).message}`);
        return this.cache;
      }
      throw err;
    }
  }

  private async build(): Promise<AppConfigDto> {
    const [branding, defaults, sections, features, map, share, legal, markets, defaultMarket] =
      await Promise.all([
        this.settings.get('branding'),
        this.settings.get('defaults'),
        this.settings.get('home.sections'),
        this.settings.get('features'),
        this.settings.get('map'),
        this.settings.get('share'),
        this.settings.get('legal'),
        this.prisma.market.findMany({
          where: { enabled: true },
          orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
          select: {
            code: true,
            nameAr: true,
            nameEn: true,
            currencyCode: true,
            timezone: true,
            enabled: true,
          },
        }),
        this.marketResolver.defaultMarket(),
      ]);
    return buildAppConfig({
      settings: { branding, defaults, 'home.sections': sections, features, map, share, legal },
      markets,
      defaultMarket,
      capabilities: this.providers.capabilities(),
    });
  }
}
