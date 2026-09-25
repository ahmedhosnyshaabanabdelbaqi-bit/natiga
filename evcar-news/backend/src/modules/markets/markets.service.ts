import { createHash } from 'node:crypto';
import { tr } from '../../common/validation/messages';
import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IANAZone } from 'luxon';
import type { SupportedLanguage } from '../../config/app-config';
import { AppException } from '../../common/errors/app.exception';
import { MarketResolverService } from '../../common/i18n/market-resolver.service';
import type { Currency, Market } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit';
import { I18nService } from '../i18n';
import { CONFIG_CHANGED_EVENT } from '../settings/settings.service';
import type {
  AdminMarketDto,
  CreateCurrencyDto,
  CreateMarketDto,
  CurrencyDto,
  PublicMarketDto,
  UpdateCurrencyDto,
  UpdateMarketDto,
} from './markets.dto';

const PUBLIC_CACHE_MS = 60_000;

/** Every relation of Market (Prisma _count), so deletion never cascades or nulls data silently. */
export const MARKET_RELATIONS = [
  'userPreferences',
  'variantMarkets',
  'rangeMeasurements',
  'vehicleSpecifications',
  'consumptionMeasurements',
  'prices',
  'specificationSources',
  'articleMarkets',
  'rssFeeds',
  'interiorTours',
  'exteriorSpins',
  'chargingStations',
  'reviews',
  'questions',
  'comparisons',
  'comparisonItems',
  'userVehicles',
  'notificationSubscriptions',
  'serviceProviders',
  'energyPrices',
  'stationSuggestions',
] as const;

export const CURRENCY_RELATIONS = [
  'markets',
  'prices',
  'tariffs',
  'ratesAsBase',
  'ratesAsQuote',
  'energyPrices',
  'chargingLogs',
] as const;

type MarketWithCurrency = Market & { currency: Currency };

export function toCurrencyView(c: Currency): CurrencyDto {
  return {
    code: c.code,
    nameAr: c.nameAr,
    nameEn: c.nameEn,
    symbolAr: c.symbolAr,
    symbolEn: c.symbolEn,
    decimals: c.decimals,
  };
}

export function toPublicMarket(
  m: MarketWithCurrency,
  lang: SupportedLanguage,
  defaultMarket: string,
): PublicMarketDto {
  return {
    code: m.code,
    name: lang === 'en' ? m.nameEn : m.nameAr,
    nameAr: m.nameAr,
    nameEn: m.nameEn,
    currency: {
      ...toCurrencyView(m.currency),
      name: lang === 'en' ? m.currency.nameEn : m.currency.nameAr,
      symbol: lang === 'en' ? m.currency.symbolEn : m.currency.symbolAr,
    },
    timezone: m.timezone,
    defaultLanguage: m.defaultLanguage,
    unitSystem: m.unitSystem,
    driveSide: m.driveSide,
    isDefault: m.code === defaultMarket,
    sortOrder: m.sortOrder,
  };
}

/**
 * Markets (countries) and currencies. Language is independent of market:
 * `defaultLanguage` is only a suggestion. New markets start disabled; the
 * default market can be neither disabled nor deleted, and a market or
 * currency that is referenced anywhere cannot be deleted (disable it).
 */
@Injectable()
export class MarketsService {
  private readonly publicCache = new Map<
    string,
    { at: number; body: PublicMarketDto[]; etag: string }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: MarketResolverService,
    private readonly audit: AuditService,
    private readonly i18n: I18nService,
    private readonly events: EventEmitter2,
  ) {}

  private changed(): void {
    this.publicCache.clear();
    this.resolver.invalidate();
    this.events.emit(CONFIG_CHANGED_EVENT);
  }

  // --- public ---------------------------------------------------------------------

  async listPublic(lang: SupportedLanguage): Promise<{ body: PublicMarketDto[]; etag: string }> {
    const hit = this.publicCache.get(lang);
    if (hit && Date.now() - hit.at < PUBLIC_CACHE_MS) return hit;
    const [markets, defaultMarket] = await Promise.all([
      this.prisma.market.findMany({
        where: { enabled: true },
        include: { currency: true },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      }),
      this.resolver.defaultMarket(),
    ]);
    const body = markets.map((m) => toPublicMarket(m, lang, defaultMarket));
    const etag = `"mk-${createHash('sha256').update(JSON.stringify(body)).digest('base64url').slice(0, 27)}"`;
    const entry = { at: Date.now(), body, etag };
    this.publicCache.set(lang, entry);
    return entry;
  }

  async getPublic(code: string, lang: SupportedLanguage): Promise<PublicMarketDto> {
    const m = await this.prisma.market.findFirst({
      where: { code: code.toUpperCase(), enabled: true },
      include: { currency: true },
    });
    if (!m) throw AppException.notFound();
    return toPublicMarket(m, lang, await this.resolver.defaultMarket());
  }

  // --- admin: markets -----------------------------------------------------------------

  private async usage(
    code: string,
  ): Promise<{ total: number; byRelation: Record<string, number> }> {
    const row = await this.prisma.market.findUnique({
      where: { code },
      select: {
        _count: { select: Object.fromEntries(MARKET_RELATIONS.map((r) => [r, true])) },
      },
    });
    const counts: Record<string, number> =
      (row as { _count?: Record<string, number> } | null)?._count ?? {};
    const byRelation = Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0));
    return { total: Object.values(counts).reduce((s, n) => s + n, 0), byRelation };
  }

  private async adminView(m: MarketWithCurrency, withUsage = false): Promise<AdminMarketDto> {
    const defaultMarket = await this.resolver.defaultMarket();
    return {
      code: m.code,
      nameAr: m.nameAr,
      nameEn: m.nameEn,
      currencyCode: m.currencyCode,
      currency: toCurrencyView(m.currency),
      timezone: m.timezone,
      defaultLanguage: m.defaultLanguage,
      unitSystem: m.unitSystem,
      driveSide: m.driveSide,
      enabled: m.enabled,
      sortOrder: m.sortOrder,
      isDefault: m.code === defaultMarket,
      ...(withUsage ? { usage: await this.usage(m.code) } : {}),
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    };
  }

  async listAdmin(): Promise<AdminMarketDto[]> {
    const markets = await this.prisma.market.findMany({
      include: { currency: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return Promise.all(markets.map((m) => this.adminView(m)));
  }

  async getAdmin(code: string): Promise<AdminMarketDto> {
    const m = await this.prisma.market.findUnique({ where: { code }, include: { currency: true } });
    if (!m) throw AppException.notFound();
    return this.adminView(m, true);
  }

  private assertTimezone(timezone: string): void {
    if (!IANAZone.isValidZone(timezone)) {
      throw this.i18n.error('TIMEZONE_INVALID', HttpStatus.UNPROCESSABLE_ENTITY, { timezone }, [
        {
          field: 'timezone',
          constraints: {
            ianaZone: tr({ ar: 'منطقة زمنية غير معروفة (IANA).', en: 'Unknown IANA time zone.' }),
          },
        },
      ]);
    }
  }

  private async assertCurrency(code: string): Promise<void> {
    const c = await this.prisma.currency.findUnique({ where: { code }, select: { code: true } });
    if (!c) {
      throw this.i18n.error('CURRENCY_NOT_FOUND', HttpStatus.UNPROCESSABLE_ENTITY, { code }, [
        {
          field: 'currencyCode',
          constraints: {
            exists: tr({ ar: 'العملة غير مسجلة.', en: 'Unknown currency.' }),
          },
        },
      ]);
    }
  }

  async create(dto: CreateMarketDto): Promise<AdminMarketDto> {
    this.assertTimezone(dto.timezone);
    await this.assertCurrency(dto.currencyCode);
    if (
      await this.prisma.market.findUnique({ where: { code: dto.code }, select: { code: true } })
    ) {
      throw this.i18n.error('MARKET_EXISTS', HttpStatus.CONFLICT, { code: dto.code });
    }
    const m = await this.prisma.market.create({
      data: {
        code: dto.code,
        nameAr: dto.nameAr.trim(),
        nameEn: dto.nameEn.trim(),
        currencyCode: dto.currencyCode,
        timezone: dto.timezone,
        defaultLanguage: dto.defaultLanguage ?? 'ar',
        unitSystem: dto.unitSystem ?? 'metric',
        driveSide: dto.driveSide ?? 'lhd',
        enabled: dto.enabled ?? false,
        sortOrder: dto.sortOrder ?? 100,
      },
      include: { currency: true },
    });
    this.audit.annotate({ entityType: 'market', entityId: m.code, after: m });
    this.changed();
    return this.adminView(m);
  }

  async update(code: string, dto: UpdateMarketDto): Promise<AdminMarketDto> {
    const before = await this.prisma.market.findUnique({ where: { code } });
    if (!before) throw AppException.notFound();
    if (dto.code !== undefined && dto.code !== code) {
      throw AppException.validation([
        {
          field: 'code',
          constraints: {
            immutable: tr({
              ar: 'لا يمكن تغيير رمز السوق.',
              en: 'The market code cannot be changed.',
            }),
          },
        },
      ]);
    }
    if (dto.timezone !== undefined) this.assertTimezone(dto.timezone);
    if (dto.currencyCode !== undefined) await this.assertCurrency(dto.currencyCode);
    if (dto.enabled === false && code === (await this.resolver.defaultMarket())) {
      throw this.i18n.error('MARKET_IS_DEFAULT', HttpStatus.CONFLICT, { code });
    }
    const m = await this.prisma.market.update({
      where: { code },
      data: {
        nameAr: dto.nameAr?.trim(),
        nameEn: dto.nameEn?.trim(),
        currencyCode: dto.currencyCode,
        timezone: dto.timezone,
        defaultLanguage: dto.defaultLanguage,
        unitSystem: dto.unitSystem,
        driveSide: dto.driveSide,
        enabled: dto.enabled,
        sortOrder: dto.sortOrder,
      },
      include: { currency: true },
    });
    const { currency: _c, ...after } = m;
    this.audit.annotate({ entityType: 'market', entityId: code, before, after });
    this.changed();
    return this.adminView(m);
  }

  async remove(code: string): Promise<void> {
    const before = await this.prisma.market.findUnique({ where: { code } });
    if (!before) throw AppException.notFound();
    if (code === (await this.resolver.defaultMarket())) {
      throw this.i18n.error('MARKET_IS_DEFAULT', HttpStatus.CONFLICT, { code });
    }
    const usage = await this.usage(code);
    if (usage.total > 0) {
      throw this.i18n.error('MARKET_IN_USE', HttpStatus.CONFLICT, { code }, usage);
    }
    await this.prisma.market.delete({ where: { code } });
    this.audit.annotate({ entityType: 'market', entityId: code, before });
    this.changed();
  }

  // --- admin: currencies ----------------------------------------------------------------

  async listCurrencies(): Promise<CurrencyDto[]> {
    const rows = await this.prisma.currency.findMany({ orderBy: { code: 'asc' } });
    return rows.map(toCurrencyView);
  }

  async createCurrency(dto: CreateCurrencyDto): Promise<CurrencyDto> {
    if (
      await this.prisma.currency.findUnique({ where: { code: dto.code }, select: { code: true } })
    ) {
      throw this.i18n.error('CURRENCY_EXISTS', HttpStatus.CONFLICT, { code: dto.code });
    }
    const c = await this.prisma.currency.create({
      data: {
        code: dto.code,
        nameAr: dto.nameAr.trim(),
        nameEn: dto.nameEn.trim(),
        symbolAr: dto.symbolAr ?? null,
        symbolEn: dto.symbolEn ?? null,
        decimals: dto.decimals ?? 2,
      },
    });
    this.audit.annotate({ entityType: 'currency', entityId: c.code, after: c });
    this.changed();
    return toCurrencyView(c);
  }

  async updateCurrency(code: string, dto: UpdateCurrencyDto): Promise<CurrencyDto> {
    const before = await this.prisma.currency.findUnique({ where: { code } });
    if (!before) throw AppException.notFound();
    if (dto.code !== undefined && dto.code !== code) {
      throw AppException.validation([
        {
          field: 'code',
          constraints: {
            immutable: tr({
              ar: 'لا يمكن تغيير رمز العملة.',
              en: 'The currency code cannot be changed.',
            }),
          },
        },
      ]);
    }
    const c = await this.prisma.currency.update({
      where: { code },
      data: {
        nameAr: dto.nameAr?.trim(),
        nameEn: dto.nameEn?.trim(),
        symbolAr: dto.symbolAr,
        symbolEn: dto.symbolEn,
        decimals: dto.decimals,
      },
    });
    this.audit.annotate({ entityType: 'currency', entityId: code, before, after: c });
    this.changed();
    return toCurrencyView(c);
  }

  async removeCurrency(code: string): Promise<void> {
    const row = await this.prisma.currency.findUnique({
      where: { code },
      include: { _count: { select: Object.fromEntries(CURRENCY_RELATIONS.map((r) => [r, true])) } },
    });
    if (!row) throw AppException.notFound();
    const counts = (row as unknown as { _count: Record<string, number> })._count;
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    if (total > 0) {
      throw this.i18n.error(
        'CURRENCY_IN_USE',
        HttpStatus.CONFLICT,
        { code },
        {
          total,
          byRelation: Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0)),
        },
      );
    }
    await this.prisma.currency.delete({ where: { code } });
    const { _count: _ignored, ...before } = row as unknown as Currency & { _count: unknown };
    this.audit.annotate({ entityType: 'currency', entityId: code, before });
    this.changed();
  }
}
