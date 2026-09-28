/**
 * Shared building blocks of the calculators engine (REQUIREMENTS §13).
 *
 * The engine is PURE: no database, no clock, no I/O. Every calculator takes
 * plain numbers the user (or the catalog, resolved by the service) supplied
 * and returns the result together with the formula, every step, every
 * assumption (with its origin), units, warnings and a confidence level.
 *
 * Rules enforced here:
 * - missing / zero / negative / non-finite inputs are rejected with a field
 *   error (never silently treated as 0, never a division by zero);
 * - optional cost components that were not entered are reported as `null`
 *   ("not included"), never as 0;
 * - there are NO built-in electricity or fuel prices: every price comes from
 *   the request (typed by the user or an admin reference price the client
 *   picked, with its date and source).
 */
import { Decimal } from '../../../common/money/money';
import type { Money } from '../../../common/money/money';
import type { Bilingual } from '../../../common/validation/messages';

export type CalcLang = 'ar' | 'en';
export type Confidence = 'high' | 'medium' | 'low';
export type AssumptionOrigin = 'user' | 'default' | 'catalog' | 'reference_price';

export interface CalcStep {
  key: string;
  label: string;
  /** Human readable formula with the numbers substituted. */
  expression: string;
  value: number | string | null;
  unit: string | null;
}

export interface CalcAssumption {
  key: string;
  label: string;
  value: number | string | boolean | null;
  unit: string | null;
  origin: AssumptionOrigin;
  /** Catalog / reference provenance (source title, reliability, date...). */
  note?: string | null;
}

export interface CalcWarning {
  code: string;
  message: string;
}

export interface CalcOutput<R> {
  calculator: string;
  result: R;
  /** The main formula, in words (request language). */
  formula: string;
  steps: CalcStep[];
  assumptions: CalcAssumption[];
  warnings: CalcWarning[];
  confidence: Confidence;
  units: Record<string, string>;
  /** Always shown: results are estimates from the entered values. */
  disclaimer: string;
}

// ---- errors ---------------------------------------------------------------------------

export interface CalcProblem {
  field: string;
  rule: string;
  message: Bilingual;
}

/** Invalid calculator input; mapped to 422 VALIDATION_FAILED by the service. */
export class CalcInputError extends Error {
  constructor(readonly problems: CalcProblem[]) {
    super(problems.map((p) => `${p.field}: ${p.rule}`).join('; '));
    this.name = 'CalcInputError';
  }
}

/** Collects problems; `throwIfAny()` raises one CalcInputError with all of them. */
export class Problems {
  readonly list: CalcProblem[] = [];

  add(field: string, rule: string, message: Bilingual): void {
    this.list.push({ field, rule, message });
  }

  has(field: string): boolean {
    return this.list.some((p) => p.field === field);
  }

  throwIfAny(): void {
    if (this.list.length) throw new CalcInputError(this.list);
  }
}

const MSG = {
  required: { ar: 'هذه القيمة مطلوبة.', en: 'This value is required.' },
  finite: { ar: 'يجب أن تكون القيمة رقمًا صالحًا.', en: 'Must be a valid number.' },
  positive: { ar: 'يجب أن تكون القيمة أكبر من صفر.', en: 'Must be greater than zero.' },
  nonNegative: { ar: 'لا يمكن أن تكون القيمة سالبة.', en: 'Cannot be negative.' },
} satisfies Record<string, Bilingual>;

export function rangeMessage(min: number, max: number): Bilingual {
  return {
    ar: `يجب أن تكون القيمة بين ${min} و${max}.`,
    en: `Must be between ${min} and ${max}.`,
  };
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Parses a number or numeric string; undefined/null → undefined; garbage → NaN. */
export function toNum(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return Number.NaN;
}

interface NumRule {
  required?: boolean;
  /** > 0 (default for physical quantities). */
  positive?: boolean;
  /** >= 0 */
  nonNegative?: boolean;
  min?: number;
  max?: number;
  /** min is exclusive (e.g. efficiency in (0, 1]). */
  minExclusive?: boolean;
}

/**
 * Validates one numeric input. Returns the number, or undefined when it is
 * absent (and not required) or invalid (a problem is recorded).
 */
export function num(
  p: Problems,
  field: string,
  raw: unknown,
  rule: NumRule = {},
): number | undefined {
  const v = toNum(raw);
  if (v === undefined) {
    if (rule.required) p.add(field, 'required', MSG.required);
    return undefined;
  }
  if (!isNum(v)) {
    p.add(field, 'isNumber', MSG.finite);
    return undefined;
  }
  if (rule.positive && v <= 0) {
    p.add(field, v === 0 ? 'notZero' : 'positive', MSG.positive);
    return undefined;
  }
  if (rule.nonNegative && v < 0) {
    p.add(field, 'nonNegative', MSG.nonNegative);
    return undefined;
  }
  if (rule.min !== undefined || rule.max !== undefined) {
    const min = rule.min ?? Number.NEGATIVE_INFINITY;
    const max = rule.max ?? Number.POSITIVE_INFINITY;
    const low = rule.minExclusive ? v <= min : v < min;
    if (low || v > max) {
      p.add(field, 'range', rangeMessage(rule.min ?? 0, rule.max ?? 0));
      return undefined;
    }
  }
  return v;
}

// ---- numbers & money ------------------------------------------------------------------

export function round(v: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round((v + Number.EPSILON) * f) / f;
}

const CURRENCY_RE = /^[A-Z]{3}$/;

export function validCurrency(p: Problems, field: string, raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === '') {
    p.add(field, 'required', MSG.required);
    return undefined;
  }
  if (typeof raw !== 'string' || !CURRENCY_RE.test(raw)) {
    p.add(field, 'currency', {
      ar: 'رمز العملة غير صالح (مثل EGP).',
      en: 'Invalid currency code (e.g. EGP).',
    });
    return undefined;
  }
  return raw;
}

export function dec(v: number | string): Decimal {
  return new Decimal(v);
}

export function money(amount: Decimal | number, currency: string): Money {
  return {
    amount: (amount instanceof Decimal ? amount : new Decimal(amount)).toFixed(
      2,
      Decimal.ROUND_HALF_UP,
    ),
    currency,
  };
}

/** Rate money with more precision (e.g. price per kWh). */
export function rate(amount: Decimal | number, currency: string): Money {
  return {
    amount: (amount instanceof Decimal ? amount : new Decimal(amount))
      .toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
      .toString(),
    currency,
  };
}

/** "2025-01-31" (date only) or undefined; anything else is a field problem. */
export function validDate(p: Problems, field: string, raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw) return raw;
  }
  p.add(field, 'isDate', {
    ar: 'التاريخ غير صالح (YYYY-MM-DD).',
    en: 'Invalid date (YYYY-MM-DD).',
  });
  return undefined;
}

// ---- output builder -------------------------------------------------------------------

export function t(lang: CalcLang, text: Bilingual): string {
  return text[lang];
}

export const DISCLAIMER: Bilingual = {
  ar: 'نتيجة تقديرية محسوبة من القيم المُدخلة والافتراضات الظاهرة فقط، وليست قياسًا أو ضمانًا.',
  en: 'An estimate computed only from the entered values and the assumptions shown; not a measurement or a guarantee.',
};

/** Accumulates steps / assumptions / warnings of one calculation. */
export class Trace {
  readonly steps: CalcStep[] = [];
  readonly assumptions: CalcAssumption[] = [];
  readonly warnings: CalcWarning[] = [];

  constructor(readonly lang: CalcLang) {}

  step(
    key: string,
    label: Bilingual,
    expression: string,
    value: number | string | null,
    unit: string | null,
  ): void {
    this.steps.push({ key, label: t(this.lang, label), expression, value, unit });
  }

  assume(
    key: string,
    label: Bilingual,
    value: number | string | boolean | null,
    unit: string | null,
    origin: AssumptionOrigin,
    note?: string | null,
  ): void {
    // One entry per key: a later (more specific) statement replaces an earlier one.
    const i = this.assumptions.findIndex((a) => a.key === key);
    const entry = { key, label: t(this.lang, label), value, unit, origin, note: note ?? null };
    if (i >= 0) this.assumptions[i] = entry;
    else this.assumptions.push(entry);
  }

  warn(code: string, message: Bilingual): void {
    if (this.warnings.some((w) => w.code === code)) return;
    this.warnings.push({ code, message: t(this.lang, message) });
  }

  output<R>(
    calculator: string,
    result: R,
    formula: Bilingual,
    confidence: Confidence,
    units: Record<string, string>,
  ): CalcOutput<R> {
    return {
      calculator,
      result,
      formula: t(this.lang, formula),
      steps: this.steps,
      assumptions: this.assumptions,
      warnings: this.warnings,
      confidence,
      units,
      disclaimer: t(this.lang, DISCLAIMER),
    };
  }
}

/** Provenance of an input value filled by the service (catalog / reference price). */
export interface Provenance {
  origin: AssumptionOrigin;
  note?: string | null;
}

export type ProvenanceMap = Partial<Record<string, Provenance>>;

export function originOf(prov: ProvenanceMap | undefined, key: string): Provenance {
  return prov?.[key] ?? { origin: 'user' };
}
