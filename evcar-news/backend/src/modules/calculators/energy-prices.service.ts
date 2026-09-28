import { HttpStatus, Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../config/app-config';
import { toPageRequest } from '../../common/http/pagination';
import { paginated, type PaginatedResponse } from '../../common/http/responses';
import { AuditService } from '../audit';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { appError, fieldError, notFound } from '../garage/common/personal-errors';
import type {
  AdminEnergyPriceQueryDto,
  CreateEnergyPriceDto,
  UpdateEnergyPriceDto,
} from './dto/energy-prices.dto';

export const ENERGY_TYPES = [
  'electricity_residential',
  'electricity_commercial',
  'electricity_public_ac',
  'electricity_public_dc',
  'gasoline_80',
  'gasoline_92',
  'gasoline_95',
  'diesel',
] as const;
export type EnergyTypeKey = (typeof ENERGY_TYPES)[number];

export const ENERGY_TYPE_LABELS: Record<EnergyTypeKey, { ar: string; en: string }> = {
  electricity_residential: { ar: 'كهرباء منزلية', en: 'Residential electricity' },
  electricity_commercial: { ar: 'كهرباء تجارية', en: 'Commercial electricity' },
  electricity_public_ac: { ar: 'شحن عام AC', en: 'Public AC charging' },
  electricity_public_dc: { ar: 'شحن عام سريع DC', en: 'Public DC fast charging' },
  gasoline_80: { ar: 'بنزين 80', en: 'Gasoline 80' },
  gasoline_92: { ar: 'بنزين 92', en: 'Gasoline 92' },
  gasoline_95: { ar: 'بنزين 95', en: 'Gasoline 95' },
  diesel: { ar: 'سولار / ديزل', en: 'Diesel' },
};

export const unitForEnergyType = (t: string): 'per_kwh' | 'per_liter' =>
  t.startsWith('electricity_') ? 'per_kwh' : 'per_liter';

/** Reference prices older than this are flagged "may be outdated". */
export const REFERENCE_PRICE_MAX_AGE_DAYS = 365;

const SELECT = {
  id: true,
  marketCode: true,
  energyType: true,
  price: true,
  unit: true,
  currencyCode: true,
  effectiveFrom: true,
  effectiveTo: true,
  verifiedAt: true,
  notes: true,
  isDemo: true,
  createdAt: true,
  updatedAt: true,
  source: { select: { id: true, title: true, publisher: true, url: true } },
} satisfies Prisma.EnergyPriceSelect;

export type ReferencePriceRow = Prisma.EnergyPriceGetPayload<{ select: typeof SELECT }>;

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const DAY_MS = 86_400_000;

function todayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Reference electricity / fuel prices per market (energy_prices), entered by
 * admins with an effective date and a source. The calculators never use them
 * silently: the client lists them, the user picks one (or types a price),
 * and the result shows the date + source. There is no built-in price.
 */
@Injectable()
export class EnergyPricesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  present(row: ReferencePriceRow, lang: SupportedLanguage, now = new Date()) {
    const ageDays = Math.max(
      0,
      Math.floor((todayUtc(now).getTime() - row.effectiveFrom.getTime()) / DAY_MS),
    );
    return {
      id: row.id,
      marketCode: row.marketCode,
      energyType: row.energyType,
      label: ENERGY_TYPE_LABELS[row.energyType]?.[lang] ?? row.energyType,
      price: { amount: row.price.toString(), currency: row.currencyCode },
      unit: row.unit,
      effectiveFrom: day(row.effectiveFrom)!,
      effectiveTo: day(row.effectiveTo),
      source: row.source
        ? {
            id: row.source.id,
            title: row.source.title,
            publisher: row.source.publisher,
            url: row.source.url,
          }
        : null,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      notes: row.notes,
      ageDays,
      possiblyOutdated: ageDays > REFERENCE_PRICE_MAX_AGE_DAYS,
      isDemo: row.isDemo,
    };
  }

  async findByIds(ids: string[]): Promise<Map<string, ReferencePriceRow>> {
    const rows = await this.prisma.energyPrice.findMany({
      where: { id: { in: ids } },
      select: SELECT,
    });
    return new Map(rows.map((r) => [r.id, r]));
  }

  /** Latest price per energy type in effect today for the market (none → empty list). */
  async listReference(market: string, lang: SupportedLanguage, now = new Date()) {
    const today = todayUtc(now);
    const rows = await this.prisma.energyPrice.findMany({
      where: {
        marketCode: market,
        effectiveFrom: { lte: today },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
      },
      orderBy: [{ energyType: 'asc' }, { effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      select: SELECT,
    });
    const seen = new Set<string>();
    const latest = rows.filter((r) =>
      seen.has(r.energyType) ? false : (seen.add(r.energyType), true),
    );
    return latest.map((r) => this.present(r, lang, now));
  }

  // ---- admin -------------------------------------------------------------------------------

  async adminList(
    q: AdminEnergyPriceQueryDto,
    lang: SupportedLanguage,
  ): Promise<PaginatedResponse<ReturnType<EnergyPricesService['present']>>> {
    const page = toPageRequest(q);
    const where: Prisma.EnergyPriceWhereInput = {
      ...(q.market ? { marketCode: q.market.toUpperCase() } : {}),
      ...(q.energyType ? { energyType: q.energyType } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.energyPrice.findMany({
        where,
        orderBy: [{ marketCode: 'asc' }, { energyType: 'asc' }, { effectiveFrom: 'desc' }],
        skip: page.skip,
        take: page.take,
        select: SELECT,
      }),
      this.prisma.energyPrice.count({ where }),
    ]);
    return paginated(
      rows.map((r) => this.present(r, lang)),
      total,
      page,
    );
  }

  private async checkRefs(
    marketCode: string | undefined,
    currency: string | undefined,
    sourceId: string | null | undefined,
  ) {
    if (marketCode) {
      const m = await this.prisma.market.findUnique({
        where: { code: marketCode },
        select: { code: true },
      });
      if (!m)
        throw fieldError('marketCode', 'exists', { ar: 'السوق غير موجود.', en: 'Unknown market.' });
    }
    if (currency) {
      const c = await this.prisma.currency.findUnique({
        where: { code: currency },
        select: { code: true },
      });
      if (!c)
        throw fieldError('currency', 'exists', {
          ar: 'العملة غير معروفة.',
          en: 'Unknown currency.',
        });
    }
    if (sourceId) {
      const s = await this.prisma.specificationSource.findUnique({
        where: { id: sourceId },
        select: { id: true },
      });
      if (!s)
        throw fieldError('sourceId', 'exists', { ar: 'المصدر غير موجود.', en: 'Unknown source.' });
    }
  }

  private static dateOf(v: string | null | undefined): Date | null | undefined {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const d = new Date(`${v}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
      throw fieldError('effectiveFrom', 'isDate', { ar: 'التاريخ غير صالح.', en: 'Invalid date.' });
    }
    return d;
  }

  async create(dto: CreateEnergyPriceDto, userId: string, lang: SupportedLanguage) {
    const marketCode = dto.marketCode.toUpperCase();
    await this.checkRefs(marketCode, dto.currency, dto.sourceId);
    const from = EnergyPricesService.dateOf(dto.effectiveFrom)!;
    const to = EnergyPricesService.dateOf(dto.effectiveTo ?? null);
    if (to && to < from) {
      throw fieldError('effectiveTo', 'afterFrom', {
        ar: 'تاريخ الانتهاء قبل تاريخ البداية.',
        en: 'The end date is before the start date.',
      });
    }
    const row = await this.prisma.energyPrice.create({
      data: {
        marketCode,
        energyType: dto.energyType,
        price: dto.price,
        unit: unitForEnergyType(dto.energyType),
        currencyCode: dto.currency,
        effectiveFrom: from,
        effectiveTo: to ?? null,
        sourceId: dto.sourceId ?? null,
        verifiedAt: dto.verifiedAt ? new Date(dto.verifiedAt) : null,
        notes: dto.notes ?? null,
        createdById: userId,
      },
      select: SELECT,
    });
    const view = this.present(row, lang);
    this.audit.annotate({ entityType: 'energy_price', entityId: row.id, after: view });
    return view;
  }

  async update(id: string, dto: UpdateEnergyPriceDto, lang: SupportedLanguage) {
    const before = await this.prisma.energyPrice.findUnique({ where: { id }, select: SELECT });
    if (!before) throw notFound('energy_price');
    await this.checkRefs(undefined, dto.currency, dto.sourceId);
    const from = EnergyPricesService.dateOf(dto.effectiveFrom) ?? before.effectiveFrom;
    const to =
      dto.effectiveTo === undefined
        ? before.effectiveTo
        : EnergyPricesService.dateOf(dto.effectiveTo);
    if (to && to < from) {
      throw fieldError('effectiveTo', 'afterFrom', {
        ar: 'تاريخ الانتهاء قبل تاريخ البداية.',
        en: 'The end date is before the start date.',
      });
    }
    const row = await this.prisma.energyPrice.update({
      where: { id },
      data: {
        ...(dto.price !== undefined ? { price: dto.price } : {}),
        ...(dto.currency !== undefined ? { currencyCode: dto.currency } : {}),
        effectiveFrom: from,
        effectiveTo: to ?? null,
        ...(dto.sourceId !== undefined ? { sourceId: dto.sourceId } : {}),
        ...(dto.verifiedAt !== undefined
          ? { verifiedAt: dto.verifiedAt ? new Date(dto.verifiedAt) : null }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      select: SELECT,
    });
    const view = this.present(row, lang);
    this.audit.annotate({
      entityType: 'energy_price',
      entityId: id,
      before: this.present(before, lang),
      after: view,
    });
    return view;
  }

  async remove(id: string, lang: SupportedLanguage): Promise<void> {
    const before = await this.prisma.energyPrice.findUnique({ where: { id }, select: SELECT });
    if (!before) throw notFound('energy_price');
    if (before.isDemo) {
      throw appError(HttpStatus.CONFLICT, 'DEMO_ROW_READ_ONLY', {
        ar: 'السجلات التجريبية تُدار من بذرة البيانات التجريبية.',
        en: 'Demo rows are managed by the demo seed.',
      });
    }
    await this.prisma.energyPrice.delete({ where: { id } });
    this.audit.annotate({
      entityType: 'energy_price',
      entityId: id,
      before: this.present(before, lang),
    });
  }
}
