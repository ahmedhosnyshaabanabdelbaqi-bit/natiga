/**
 * Row → view mappers for data points shared by the public and admin APIs.
 * Numbers leave the API as JSON numbers in canonical units, money as
 * decimal strings; missing values stay null.
 */
import type { SupportedLanguage } from '../../../config/app-config';
import type { Prisma, SpecificationSource } from '../../../generated/prisma/client';
import { PriceType } from '../../../generated/prisma/enums';
import type {
  ChargingCurveDto,
  ChargingTimeDto,
  ConsumptionDto,
  DataMetaDto,
  InletDto,
  PriceDto,
  RangeDto,
  SourceSummaryDto,
} from '../dto/shared.dto';
import { nameIn, pick, toIso, toIsoDate, toNum } from './values';

export const PRICE_TYPE_LABELS: Record<PriceType, { ar: string; en: string }> = {
  official_msrp: { ar: 'السعر الرسمي', en: 'Official price (MSRP)' },
  dealer: { ar: 'سعر الوكيل', en: 'Dealer price' },
  market_estimate: { ar: 'تقدير سعر السوق', en: 'Market estimate' },
};

export function sourceView(s: SpecificationSource | null | undefined): SourceSummaryDto | null {
  if (!s) return null;
  return {
    id: s.id,
    type: s.type,
    title: s.title,
    publisher: s.publisher,
    url: s.url,
    documentDate: toIsoDate(s.documentDate),
    accessedAt: toIso(s.accessedAt),
    marketCode: s.marketCode,
  };
}

interface MetaRow {
  reliability: string;
  verifiedAt: Date | null;
  source?: SpecificationSource | null;
}

export function metaOf(row: MetaRow): DataMetaDto {
  return {
    reliability: row.reliability,
    verifiedAt: toIso(row.verifiedAt),
    source: sourceView(row.source ?? null),
  };
}

type RangeRow = Prisma.RangeMeasurementGetPayload<{ include: { source: true } }>;
type ConsumptionRow = Prisma.ConsumptionMeasurementGetPayload<{ include: { source: true } }>;
type InletRow = Prisma.VariantMarketInletGetPayload<{
  include: { source: true; connectorType: true };
}>;
type TimeRow = Prisma.ChargingTimeMeasurementGetPayload<{ include: { source: true } }>;
type CurveRow = Prisma.ChargingCurveGetPayload<{ include: { source: true; points: true } }>;
type PriceRow = Prisma.PriceHistoryGetPayload<{ include: { source: true } }>;

export function rangeView(r: RangeRow): RangeDto {
  return {
    id: r.id,
    cycle: r.cycle,
    cycleNote: r.cycleNote,
    rangeType: r.rangeType,
    valueKm: toNum(r.valueKm) as number,
    originalValue: r.originalValue,
    originalUnit: r.originalUnit,
    wheelSizeInch: toNum(r.wheelSizeInch),
    conditions: r.conditions,
    marketCode: r.marketCode,
    ...metaOf(r),
  };
}

export function consumptionView(c: ConsumptionRow): ConsumptionDto {
  return {
    id: c.id,
    cycle: c.cycle,
    cycleNote: c.cycleNote,
    kind: c.kind,
    mode: c.mode,
    value: toNum(c.value) as number,
    unit: c.kind === 'fuel' ? 'L/100km' : 'Wh/km',
    originalValue: c.originalValue,
    originalUnit: c.originalUnit,
    conditions: c.conditions,
    marketCode: c.marketCode,
    ...metaOf(c),
  };
}

export function inletView(i: InletRow, lang: SupportedLanguage): InletDto {
  return {
    id: i.id,
    connectorType: {
      code: i.connectorType.code,
      name: nameIn(lang, i.connectorType.nameAr, i.connectorType.nameEn),
    },
    currentType: i.currentType,
    maxPowerKw: toNum(i.maxPowerKw),
    notes: i.notes,
    ...metaOf(i),
  };
}

export function socWindow(from: number, to: number): string {
  return `${from}–${to}%`;
}

export function chargingTimeView(t: TimeRow): ChargingTimeDto {
  const from = toNum(t.fromSoc) as number;
  const to = toNum(t.toSoc) as number;
  return {
    id: t.id,
    currentType: t.currentType,
    fromSoc: from,
    toSoc: to,
    socWindow: socWindow(from, to),
    durationMinutes: toNum(t.durationMinutes) as number,
    chargerPowerKw: toNum(t.chargerPowerKw),
    peakPowerKw: toNum(t.peakPowerKw),
    averagePowerKw: toNum(t.averagePowerKw),
    onboardChargerLimitKw: toNum(t.onboardChargerLimitKw),
    conditions: t.conditions,
    ...metaOf(t),
  };
}

export function curveView(c: CurveRow): ChargingCurveDto {
  const points = [...c.points]
    .map((p) => ({
      socPercent: toNum(p.socPercent) as number,
      powerKw: toNum(p.powerKw) as number,
    }))
    .sort((a, b) => a.socPercent - b.socPercent);
  return {
    id: c.id,
    currentType: c.currentType,
    label: c.label,
    chargerMaxPowerKw: toNum(c.chargerMaxPowerKw),
    batteryTempC: toNum(c.batteryTempC),
    preconditioned: c.preconditioned,
    conditions: c.conditions,
    points,
    peakPowerKw: points.length ? Math.max(...points.map((p) => p.powerKw)) : null,
    ...metaOf(c),
  };
}

/**
 * Price view. `today` = "YYYY-MM-DD" in the market time zone,
 * `marketCurrency` = the market's own currency.
 */
export function priceView(
  p: PriceRow,
  lang: SupportedLanguage,
  today: string,
  marketCurrency: string | null,
  decimals = 2,
): PriceDto {
  const from = toIsoDate(p.effectiveFrom) as string;
  const to = toIsoDate(p.effectiveTo);
  return {
    id: p.id,
    marketCode: p.marketCode,
    amount: { amount: p.amount.toFixed(decimals), currency: p.currencyCode },
    priceType: p.priceType,
    priceTypeLabel: pick(
      lang,
      PRICE_TYPE_LABELS[p.priceType].ar,
      PRICE_TYPE_LABELS[p.priceType].en,
    ),
    effectiveFrom: from,
    effectiveTo: to,
    isCurrent: from <= today && (to === null || to >= today),
    inMarketCurrency: marketCurrency === null || p.currencyCode === marketCurrency,
    notes: p.notes,
    ...metaOf(p),
  };
}

const PRICE_RANK: Record<PriceType, number> = {
  official_msrp: 0,
  dealer: 1,
  market_estimate: 2,
};

/**
 * The current price of a market: valid today; official MSRP before dealer
 * before market estimate; prices in the market currency before foreign
 * ones; then the most recent effective date.
 */
export function pickCurrentPrice<
  T extends {
    priceType: PriceType;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    currencyCode: string;
    createdAt: Date;
  },
>(prices: T[], today: string, marketCurrency: string | null): T | null {
  const current = prices.filter((p) => {
    const from = toIsoDate(p.effectiveFrom) as string;
    const to = toIsoDate(p.effectiveTo);
    return from <= today && (to === null || to >= today);
  });
  current.sort((a, b) => {
    const localA = marketCurrency === null || a.currencyCode === marketCurrency ? 0 : 1;
    const localB = marketCurrency === null || b.currencyCode === marketCurrency ? 0 : 1;
    return (
      localA - localB ||
      PRICE_RANK[a.priceType] - PRICE_RANK[b.priceType] ||
      b.effectiveFrom.getTime() - a.effectiveFrom.getTime() ||
      b.createdAt.getTime() - a.createdAt.getTime()
    );
  });
  return current[0] ?? null;
}

/** Price history order: newest effective date first, then newest entry first. */
export function sortPriceHistory<T extends { effectiveFrom: Date; createdAt: Date }>(
  prices: T[],
): T[] {
  return [...prices].sort(
    (a, b) =>
      b.effectiveFrom.getTime() - a.effectiveFrom.getTime() ||
      b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

const CYCLE_ORDER = ['WLTP', 'EPA', 'CLTC', 'NEDC', 'OTHER'];

/** Ranges: electric before total, then cycle order, then value (highest first). */
export function sortRanges<T extends { rangeType: string; cycle: string; valueKm: number }>(
  ranges: T[],
): T[] {
  return [...ranges].sort(
    (a, b) =>
      (a.rangeType === 'electric' ? 0 : 1) - (b.rangeType === 'electric' ? 0 : 1) ||
      CYCLE_ORDER.indexOf(a.cycle) - CYCLE_ORDER.indexOf(b.cycle) ||
      b.valueKm - a.valueKm,
  );
}

/**
 * Market scoping of rows that may be global (market NULL) or
 * market-specific: keep global rows and rows of `market`.
 */
export function inScope<T extends { marketCode: string | null }>(rows: T[], market: string): T[] {
  return rows.filter((r) => r.marketCode === null || r.marketCode === market);
}
