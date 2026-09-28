/**
 * Prices entered for a calculation. There are no built-in prices: each one
 * is typed by the user or copied from an admin reference price (the service
 * then records its effective date and source). A price without a date gets
 * a visible warning — an undated price is never presented as "current".
 */
import { Decimal } from '../../../common/money/money';
import {
  type AssumptionOrigin,
  num,
  type Problems,
  type ProvenanceMap,
  rate,
  type Trace,
  validCurrency,
  validDate,
} from './core';

export interface PricedInput {
  currency?: unknown;
  priceDate?: unknown;
}

export interface PriceContext {
  currency: string;
  priceDate: string | null;
}

export function readPriceContext(p: Problems, input: PricedInput): PriceContext | undefined {
  const currency = validCurrency(p, 'currency', input.currency);
  const priceDate = validDate(p, 'priceDate', input.priceDate) ?? null;
  return currency ? { currency, priceDate } : undefined;
}

export const PRICE_DATE_MISSING = {
  ar: 'لم يُحدَّد تاريخ السعر؛ تأكد أن الأسعار المُدخلة حديثة.',
  en: 'No price date was given; make sure the entered prices are up to date.',
};

export function tracePriceContext(trace: Trace, ctx: PriceContext, prov?: ProvenanceMap): void {
  trace.assume('currency', { ar: 'العملة', en: 'Currency' }, ctx.currency, null, 'user');
  const dateOrigin: AssumptionOrigin = prov?.priceDate?.origin ?? 'user';
  trace.assume(
    'priceDate',
    { ar: 'تاريخ السعر', en: 'Price date' },
    ctx.priceDate,
    null,
    dateOrigin,
    prov?.priceDate?.note,
  );
  if (!ctx.priceDate) trace.warn('PRICE_DATE_MISSING', PRICE_DATE_MISSING);
}

/** A non-negative price (0 allowed: e.g. free charging). */
export function readPrice(
  p: Problems,
  field: string,
  raw: unknown,
  required = false,
): Decimal | undefined {
  const v = num(p, field, raw, { required, nonNegative: true, max: 1e9 });
  return v === undefined ? undefined : new Decimal(v);
}

export function tracePrice(
  trace: Trace,
  key: string,
  label: { ar: string; en: string },
  value: Decimal,
  unit: string,
  currency: string,
  prov?: ProvenanceMap,
): void {
  trace.assume(
    key,
    label,
    rate(value, currency).amount,
    `${currency}/${unit}`,
    prov?.[key]?.origin ?? 'user',
    prov?.[key]?.note,
  );
}
