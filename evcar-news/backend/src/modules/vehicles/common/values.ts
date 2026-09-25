/**
 * Small value helpers of the vehicle catalog. Missing values stay `null`
 * everywhere (REQUIREMENTS §6: "غير متوفر", never 0).
 */
import { DateTime } from 'luxon';
import { Decimal } from '@prisma/client-runtime-utils';
import type { SupportedLanguage } from '../../../config/app-config';

export { Decimal };

type Numeric = Decimal | number | string | bigint;

/** Decimal / numeric → JS number; null/undefined stay null. */
export function toNum(value: Numeric | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value.toString());
  return Number.isFinite(n) ? n : null;
}

/** Date → ISO-8601 UTC timestamp (null stays null). */
export function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** DATE column → "YYYY-MM-DD" (null stays null). */
export function toIsoDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" (or a full ISO timestamp) → Date at UTC midnight of that calendar day. */
export function parseDateOnly(value: string): Date {
  const day = DATE_ONLY_RE.test(value) ? value : value.slice(0, 10);
  const d = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== day) {
    throw new RangeError(`Invalid date "${value}"`);
  }
  return d;
}

export function isValidDateOnly(value: string): boolean {
  try {
    parseDateOnly(value);
    return DATE_ONLY_RE.test(value);
  } catch {
    return false;
  }
}

/** Adds whole days to a DATE value (UTC midnight). */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Today's calendar date ("YYYY-MM-DD") in a market's IANA time zone. */
export function todayIn(timezone: string | null | undefined, now: Date = new Date()): string {
  const dt = DateTime.fromJSDate(now, { zone: timezone || 'UTC' });
  return (dt.isValid ? dt : DateTime.fromJSDate(now, { zone: 'UTC' })).toISODate() as string;
}

/** Picks the Arabic or English variant of a bilingual pair. */
export function pick<T>(lang: SupportedLanguage, ar: T, en: T): T {
  return lang === 'en' ? en : ar;
}

/** Localized name with a fallback to the other language when one is blank. */
export function nameIn(
  lang: SupportedLanguage,
  nameAr: string | null | undefined,
  nameEn: string | null | undefined,
): string {
  const primary = lang === 'en' ? nameEn : nameAr;
  const other = lang === 'en' ? nameAr : nameEn;
  return (primary?.trim() || other?.trim() || '').trim();
}

/** Optional localized text: the request language first, then the other one, else null. */
export function textIn(
  lang: SupportedLanguage,
  ar: string | null | undefined,
  en: string | null | undefined,
): string | null {
  const v = nameIn(lang, ar, en);
  return v === '' ? null : v;
}

/** Rounds to `decimals` places half away from zero (null stays null). */
export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return (Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * factor)) / factor;
}

/** Stable, compact string form of a number for original_value columns. */
export function numberText(value: number): string {
  return Number.isInteger(value) ? String(value) : String(round(value, 6));
}

/** Equality of two decimal-ish values (null-safe). */
export function sameNumber(a: Numeric | null | undefined, b: Numeric | null | undefined): boolean {
  const x = toNum(a);
  const y = toNum(b);
  if (x === null || y === null) return x === y;
  return Math.abs(x - y) < 1e-9;
}

/** Strips control / zero-width / bidi-override characters, trims; empty → null. */
export function cleanText(value: string | null | undefined, multiline = false): string | null {
  if (value === null || value === undefined) return null;
  let v = value.replace(/\r\n?/g, '\n');
  v = multiline
    ? // eslint-disable-next-line no-control-regex
      v.replace(/[\u0000-\u0009\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    : // eslint-disable-next-line no-control-regex
      v.replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, ' ');
  v = multiline
    ? v
        .split('\n')
        .map((l) => l.replace(/[ \t]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    : v.replace(/\s+/g, ' ').trim();
  return v === '' ? null : v;
}
