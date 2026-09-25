import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { SupportedLanguage } from '../../../config/app-config';
import { PrismaService } from '../../../prisma/prisma.service';
import { CONFIG_CHANGED_EVENT } from '../../settings/settings.service';
import { nameIn, todayIn } from '../common/values';

export interface MarketInfo {
  code: string;
  nameAr: string;
  nameEn: string;
  currencyCode: string;
  currencyDecimals: number;
  timezone: string;
  enabled: boolean;
  sortOrder: number;
}

export interface MarketCtx extends MarketInfo {
  /** "YYYY-MM-DD" in the market time zone (prices valid "today"). */
  today: string;
}

const TTL_MS = 60_000;

/**
 * Small cache of markets (currency, time zone, names) for the public
 * catalog. The request market itself is resolved globally (RequestContext).
 */
@Injectable()
export class MarketContextService {
  private cache?: { at: number; markets: Map<string, MarketInfo> };

  constructor(private readonly prisma: PrismaService) {}

  async all(): Promise<Map<string, MarketInfo>> {
    if (this.cache && Date.now() - this.cache.at < TTL_MS) return this.cache.markets;
    const rows = await this.prisma.market.findMany({ include: { currency: true } });
    const markets = new Map(
      rows.map((m) => [
        m.code,
        {
          code: m.code,
          nameAr: m.nameAr,
          nameEn: m.nameEn,
          currencyCode: m.currencyCode,
          currencyDecimals: m.currency.decimals,
          timezone: m.timezone,
          enabled: m.enabled,
          sortOrder: m.sortOrder,
        },
      ]),
    );
    this.cache = { at: Date.now(), markets };
    return markets;
  }

  async get(code: string): Promise<MarketCtx> {
    const m = (await this.all()).get(code);
    const info: MarketInfo = m ?? {
      code,
      nameAr: code,
      nameEn: code,
      currencyCode: '',
      currencyDecimals: 2,
      timezone: 'UTC',
      enabled: false,
      sortOrder: 9999,
    };
    return { ...info, today: todayIn(info.timezone) };
  }

  name(m: MarketInfo | undefined, code: string, lang: SupportedLanguage): string {
    return m ? nameIn(lang, m.nameAr, m.nameEn) : code;
  }

  /** Markets / currencies changed (markets module emits the platform config event). */
  @OnEvent(CONFIG_CHANGED_EVENT)
  invalidate(): void {
    this.cache = undefined;
  }
}
