import { Decimal } from '@prisma/client-runtime-utils';
import type { SupportedLanguage } from '../../config/app-config';
import type { LocalizedText } from '../i18n/localized-text';

export { Decimal };
export type DecimalInput = Decimal | string | number;

/** API money shape (contract §4.3): amount is a decimal STRING. */
export interface Money {
  amount: string;
  currency: string;
}

/** A converted amount — always labelled as an estimate, never an official local price. */
export interface ConvertedMoneyEstimate extends Money {
  isEstimate: true;
  label: LocalizedText;
  original: Money;
  rate: string;
  rateEffectiveAt?: string;
}

export const CONVERTED_ESTIMATE_LABEL: LocalizedText = {
  ar: 'تقديري بعد التحويل',
  en: 'Estimated after conversion',
};

const CURRENCY_RE = /^[A-Z]{3}$/;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

function toDecimal(value: DecimalInput): Decimal {
  const d = value instanceof Decimal ? value : new Decimal(value);
  if (!d.isFinite()) throw new MoneyError('Amount must be finite');
  return d;
}

/** Builds Money rounding half-up to the currency's minor units (default 2). */
export function toMoney(amount: DecimalInput, currency: string, decimals = 2): Money {
  if (!CURRENCY_RE.test(currency)) throw new MoneyError(`Invalid currency code "${currency}"`);
  return { amount: toDecimal(amount).toFixed(decimals, Decimal.ROUND_HALF_UP), currency };
}

/** Like toMoney but keeps null for missing values. */
export function toMoneyOrNull(
  amount: DecimalInput | null | undefined,
  currency: string | null | undefined,
  decimals = 2,
): Money | null {
  if (amount === null || amount === undefined || !currency) return null;
  return toMoney(amount, currency, decimals);
}

export function addMoney(a: Money, b: Money, decimals = 2): Money {
  if (a.currency !== b.currency) {
    throw new MoneyError(`Cannot add ${a.currency} and ${b.currency}`);
  }
  return toMoney(new Decimal(a.amount).plus(b.amount), a.currency, decimals);
}

export function multiplyMoney(a: Money, factor: DecimalInput, decimals = 2): Money {
  return toMoney(new Decimal(a.amount).times(toDecimal(factor)), a.currency, decimals);
}

/**
 * Converts using an exchange rate (1 unit of `money.currency` = `rate` units
 * of `toCurrency`). The result is explicitly an estimate.
 */
export function convertMoneyEstimate(
  money: Money,
  rate: DecimalInput,
  toCurrency: string,
  opts: { decimals?: number; rateEffectiveAt?: Date } = {},
): ConvertedMoneyEstimate {
  const r = toDecimal(rate);
  if (r.lte(0)) throw new MoneyError('Exchange rate must be > 0');
  const converted = toMoney(new Decimal(money.amount).times(r), toCurrency, opts.decimals ?? 2);
  return {
    ...converted,
    isEstimate: true,
    label: CONVERTED_ESTIMATE_LABEL,
    original: money,
    rate: r.toString(),
    ...(opts.rateEffectiveAt ? { rateEffectiveAt: opts.rateEffectiveAt.toISOString() } : {}),
  };
}

/** Human formatting for server-rendered pages / e-mails (clients format themselves). */
export function formatMoney(money: Money, lang: SupportedLanguage): string {
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: money.currency }).format(
    Number(money.amount),
  );
}
