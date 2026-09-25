import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PriceType } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit';
import { CatalogErrors, fieldError, Msg } from '../common/catalog-errors';
import { resolveDataPoint, type Actor } from '../common/data-point';
import {
  addDays,
  cleanText,
  parseDateOnly,
  sameNumber,
  todayIn,
  toIsoDate,
} from '../common/values';
import { priceView, sortPriceHistory } from '../common/views';
import type { CreatePriceDto, UpdatePriceDto } from '../dto/admin-data.dto';
import type { PriceDto } from '../dto/shared.dto';
import { AdminDataService } from './admin-data.service';
import { AssetGuard } from './asset-guard';

type Tx = Prisma.TransactionClient;

export interface PriceInput {
  marketCode: string;
  amount: string;
  currencyCode: string;
  priceType: PriceType;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  sourceId: string | null;
}

/**
 * Price history per variant × market (REQUIREMENTS §6): amount + currency +
 * type (official_msrp | dealer | market_estimate) + effective dates +
 * source. Prices are never converted: official and dealer prices must be in
 * the market's own currency and cite a source; a foreign-currency figure can
 * only be a market estimate (also enforced by the database). Official MSRP
 * periods never overlap; by default a new official price closes the
 * previous open-ended one the day before it starts.
 */
@Injectable()
export class AdminPricesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly assets: AssetGuard,
    private readonly data: AdminDataService,
  ) {}

  async list(variantId: string, marketCode?: string): Promise<PriceDto[]> {
    const v = await this.prisma.vehicleVariant.findUnique({
      where: { id: variantId },
      select: { id: true },
    });
    if (!v) throw CatalogErrors.notFound('variant');
    const rows = await this.prisma.priceHistory.findMany({
      where: { variantId, ...(marketCode ? { marketCode } : {}) },
      include: { source: true, market: true, currency: true },
    });
    return sortPriceHistory(rows).map((p) =>
      priceView(p, 'en', todayIn(p.market.timezone), p.market.currencyCode, p.currency.decimals),
    );
  }

  /** Validates a price against its market; returns the market row. */
  async validate(variantId: string, p: PriceInput, prefix = '') {
    const market = await this.assets.market(p.marketCode, `${prefix}marketCode`);
    const currency = await this.prisma.currency.findUnique({ where: { code: p.currencyCode } });
    if (!currency) throw fieldError(`${prefix}currencyCode`, 'exists', Msg.unknownCurrency);
    const vm = await this.prisma.variantMarket.findUnique({
      where: { variantId_marketCode: { variantId, marketCode: p.marketCode } },
      select: { id: true },
    });
    if (!vm) {
      throw fieldError(`${prefix}marketCode`, 'variantMarket', {
        ar: 'الفئة غير مسجلة في هذا السوق. أضف توافرها في السوق أولًا.',
        en: 'The variant has no record in this market. Add its market availability first.',
      });
    }
    if (p.priceType !== PriceType.market_estimate) {
      if (p.currencyCode !== market.currencyCode) {
        throw fieldError(`${prefix}currencyCode`, 'marketCurrency', {
          ar: `السعر الرسمي أو سعر الوكيل في ${market.nameAr} يجب أن يكون بعملة السوق (${market.currencyCode}). السعر المحوَّل من عملة أخرى يُسجل كتقدير سوق فقط.`,
          en: `Official and dealer prices in ${market.nameEn} must be in ${market.currencyCode}. A price converted from another currency can only be a market estimate.`,
        });
      }
      if (!p.sourceId) {
        throw fieldError(`${prefix}sourceId`, 'required', {
          ar: 'السعر الرسمي وسعر الوكيل يحتاجان مصدرًا.',
          en: 'Official and dealer prices need a source.',
        });
      }
    }
    if (p.effectiveTo && p.effectiveTo < p.effectiveFrom) {
      throw fieldError(`${prefix}effectiveTo`, 'order', {
        ar: 'تاريخ النهاية يجب ألا يسبق تاريخ البداية.',
        en: 'The end date cannot be before the start date.',
      });
    }
    await this.assets.assertSource(p.sourceId, `${prefix}sourceId`);
    return { market, currency };
  }

  /**
   * Inside `tx`: optionally closes the previous open-ended official price
   * and refuses overlapping official periods (409 PRICE_PERIOD_OVERLAP).
   * Returns the row that was closed, if any.
   */
  async prepareOfficialPeriod(
    tx: Tx,
    variantId: string,
    p: PriceInput,
    opts: { closePrevious: boolean; exceptId?: string },
  ) {
    if (p.priceType !== PriceType.official_msrp) return null;
    let closed: Prisma.PriceHistoryGetPayload<object> | null = null;
    if (opts.closePrevious) {
      const open = await tx.priceHistory.findFirst({
        where: {
          variantId,
          marketCode: p.marketCode,
          priceType: PriceType.official_msrp,
          effectiveTo: null,
          effectiveFrom: { lt: p.effectiveFrom },
          ...(opts.exceptId ? { id: { not: opts.exceptId } } : {}),
        },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (open) {
        closed = open;
        await tx.priceHistory.update({
          where: { id: open.id },
          data: { effectiveTo: addDays(p.effectiveFrom, -1) },
        });
      }
    }
    const others = await tx.priceHistory.findMany({
      where: {
        variantId,
        marketCode: p.marketCode,
        priceType: PriceType.official_msrp,
        ...(opts.exceptId ? { id: { not: opts.exceptId } } : {}),
      },
    });
    const end = (d: Date | null) => (d ? d.getTime() : Number.POSITIVE_INFINITY);
    const clash = others.find(
      (o) =>
        o.effectiveFrom.getTime() <= end(p.effectiveTo) &&
        p.effectiveFrom.getTime() <= end(o.effectiveTo),
    );
    if (clash) {
      throw CatalogErrors.pricePeriodOverlap({
        conflictingPriceId: clash.id,
        effectiveFrom: toIsoDate(clash.effectiveFrom),
        effectiveTo: toIsoDate(clash.effectiveTo),
      });
    }
    return closed;
  }

  async create(variantId: string, dto: CreatePriceDto, actor: Actor): Promise<PriceDto> {
    await this.data.editableVariant(variantId);
    const input: PriceInput = {
      marketCode: dto.marketCode,
      amount: dto.amount,
      currencyCode: dto.currencyCode,
      priceType: dto.priceType as PriceType,
      effectiveFrom: parseDateOnly(dto.effectiveFrom),
      effectiveTo: dto.effectiveTo ? parseDateOnly(dto.effectiveTo) : null,
      sourceId: dto.sourceId ?? null,
    };
    const { market, currency } = await this.validate(variantId, input);
    const dup = await this.prisma.priceHistory.findFirst({
      where: {
        variantId,
        marketCode: input.marketCode,
        priceType: input.priceType,
        currencyCode: input.currencyCode,
        amount: input.amount,
        effectiveFrom: input.effectiveFrom,
      },
      select: { id: true },
    });
    if (dup) throw CatalogErrors.exists('price', { id: dup.id });
    const dp = resolveDataPoint(dto, null, { valueChanged: true, actor });
    const { row, closed } = await this.prisma.$transaction(async (tx) => {
      const closedRow = await this.prepareOfficialPeriod(tx, variantId, input, {
        closePrevious: dto.closePrevious ?? true,
      });
      const created = await tx.priceHistory.create({
        data: {
          variantId,
          ...input,
          ...dp,
          notes: cleanText(dto.notes, true),
          createdById: actor.id,
        },
        include: { source: true },
      });
      return { row: created, closed: closedRow };
    });
    this.audit.annotate({
      entityType: 'price',
      entityId: row.id,
      before: closed ? { closedPreviousPrice: closed } : undefined,
      after: { ...row, source: undefined },
    });
    return priceView(row, 'en', todayIn(market.timezone), market.currencyCode, currency.decimals);
  }

  async update(id: string, dto: UpdatePriceDto, actor: Actor): Promise<PriceDto> {
    const before = await this.prisma.priceHistory.findUnique({ where: { id } });
    if (!before) throw CatalogErrors.notFound('price');
    await this.data.editableVariant(before.variantId);
    const input: PriceInput = {
      marketCode: dto.marketCode ?? before.marketCode,
      amount: dto.amount ?? before.amount.toString(),
      currencyCode: dto.currencyCode ?? before.currencyCode,
      priceType: (dto.priceType as PriceType | undefined) ?? before.priceType,
      effectiveFrom: dto.effectiveFrom ? parseDateOnly(dto.effectiveFrom) : before.effectiveFrom,
      effectiveTo:
        dto.effectiveTo !== undefined
          ? dto.effectiveTo
            ? parseDateOnly(dto.effectiveTo)
            : null
          : before.effectiveTo,
      sourceId: dto.sourceId !== undefined ? dto.sourceId : before.sourceId,
    };
    const { market, currency } = await this.validate(before.variantId, input);
    const valueChanged =
      !sameNumber(input.amount, before.amount) ||
      input.currencyCode !== before.currencyCode ||
      input.priceType !== before.priceType ||
      input.marketCode !== before.marketCode ||
      input.effectiveFrom.getTime() !== before.effectiveFrom.getTime();
    const dp = resolveDataPoint(dto, before, { valueChanged, actor });
    const row = await this.prisma.$transaction(async (tx) => {
      await this.prepareOfficialPeriod(tx, before.variantId, input, {
        closePrevious: false,
        exceptId: id,
      });
      return tx.priceHistory.update({
        where: { id },
        data: {
          ...input,
          ...dp,
          notes: dto.notes === undefined ? undefined : cleanText(dto.notes, true),
        },
        include: { source: true },
      });
    });
    this.audit.annotate({
      entityType: 'price',
      entityId: id,
      before,
      after: { ...row, source: undefined },
    });
    return priceView(row, 'en', todayIn(market.timezone), market.currencyCode, currency.decimals);
  }

  async remove(id: string): Promise<void> {
    const before = await this.prisma.priceHistory.findUnique({ where: { id } });
    if (!before) throw CatalogErrors.notFound('price');
    await this.prisma.priceHistory.delete({ where: { id } });
    this.audit.annotate({ entityType: 'price', entityId: id, before });
  }
}
