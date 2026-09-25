import { Injectable, Logger } from '@nestjs/common';
import { AppConfig, type SupportedLanguage } from '../../config/app-config';
import { isSupportedLanguage } from './language';
import { PrismaService } from '../../prisma/prisma.service';

const MARKET_CODE_RE = /^[A-Z]{2,8}$/;
const CACHE_TTL_MS = 60_000;

interface MarketSnapshot {
  enabled: Set<string>;
  defaultMarket: string;
  /** Fallback language when a request names none (settings "defaults", else DEFAULT_LANGUAGE). */
  defaultLanguage: SupportedLanguage;
  loadedAt: number;
}

/**
 * Resolves the market of a request (contract §4.3):
 *   ?market=EG → X-Market header → default market from app settings
 *   (app_settings key "defaults" → { defaultMarket }) → DEFAULT_MARKET env.
 * Only enabled markets are accepted; anything else falls back to the default.
 * Also provides the default LANGUAGE for requests without ?lang /
 * Accept-Language: settings "defaults.defaultLanguage", else DEFAULT_LANGUAGE,
 * so /app-config and the server's own messages always agree.
 * The markets/settings modules must call `invalidate()` after changes.
 */
@Injectable()
export class MarketResolverService {
  private readonly logger = new Logger(MarketResolverService.name);
  private snapshot?: MarketSnapshot;
  private loading?: Promise<MarketSnapshot>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  invalidate(): void {
    this.snapshot = undefined;
  }

  async resolve(requested: string | undefined): Promise<string> {
    const snap = await this.getSnapshot();
    const code = requested?.trim().toUpperCase();
    if (code && MARKET_CODE_RE.test(code) && snap.enabled.has(code)) return code;
    return snap.defaultMarket;
  }

  async defaultMarket(): Promise<string> {
    return (await this.getSnapshot()).defaultMarket;
  }

  async defaultLanguage(): Promise<SupportedLanguage> {
    return (await this.getSnapshot()).defaultLanguage;
  }

  private async getSnapshot(): Promise<MarketSnapshot> {
    const now = Date.now();
    if (this.snapshot && now - this.snapshot.loadedAt < CACHE_TTL_MS) return this.snapshot;
    this.loading ??= this.load().finally(() => {
      this.loading = undefined;
    });
    return this.loading;
  }

  private async load(): Promise<MarketSnapshot> {
    const fallback = this.config.i18n.defaultMarket;
    try {
      const [markets, defaults] = await Promise.all([
        this.prisma.market.findMany({ where: { enabled: true }, select: { code: true } }),
        this.prisma.appSetting.findUnique({ where: { key: 'defaults' } }),
      ]);
      const enabled = new Set(markets.map((m) => m.code));
      const value = defaults?.value as {
        defaultMarket?: unknown;
        defaultLanguage?: unknown;
      } | null;
      const configured = value?.defaultMarket;
      let defaultMarket =
        typeof configured === 'string' && enabled.has(configured) ? configured : fallback;
      if (enabled.size > 0 && !enabled.has(defaultMarket)) defaultMarket = [...enabled][0];
      const defaultLanguage = isSupportedLanguage(value?.defaultLanguage)
        ? value.defaultLanguage
        : this.config.i18n.defaultLanguage;
      this.snapshot = { enabled, defaultMarket, defaultLanguage, loadedAt: Date.now() };
    } catch (err) {
      // Never fail a request because markets could not be loaded; retry soon.
      this.logger.warn({ err }, 'Could not load markets; using DEFAULT_MARKET');
      this.snapshot = {
        enabled: new Set([fallback]),
        defaultMarket: fallback,
        defaultLanguage: this.config.i18n.defaultLanguage,
        loadedAt: Date.now() - CACHE_TTL_MS + 5_000,
      };
    }
    return this.snapshot;
  }
}
