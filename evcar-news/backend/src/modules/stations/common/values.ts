import type { Response } from 'express';
import type { SupportedLanguage } from '../../../config/app-config';

/** Decimal / number → number, null stays null (never 0 for a missing value). */
export function num(value: { toString(): string } | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value.toString());
  return Number.isFinite(n) ? n : null;
}

export function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

/** Text in the request language, falling back to the other one (never ""). */
export function pick(
  lang: SupportedLanguage,
  ar: string | null | undefined,
  en: string | null | undefined,
): string | null {
  const primary = lang === 'en' ? en : ar;
  const secondary = lang === 'en' ? ar : en;
  return primary?.trim() || secondary?.trim() || null;
}

/** Money as the API contract wants it: decimal string + currency. */
export function money(
  amount: { toString(): string } | number,
  currency: string,
  decimals = 4,
): { amount: string; currency: string } {
  const n = Number(amount.toString());
  return { amount: Number.isFinite(n) ? n.toFixed(decimals) : String(amount), currency };
}

/** Public GET cache headers (Express adds the strong ETag + 304 itself). */
export function setPublicCache(res: Response, maxAgeSeconds: number): void {
  res.setHeader(
    'Cache-Control',
    `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds * 5}`,
  );
  res.setHeader('Vary', 'Accept-Language, X-Market, Authorization');
}

export function setNoStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
}

/** Comma list query param → trimmed unique non-empty values. */
export function csv(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = Array.isArray(value) ? value.join(',') : String(value);
  const items = [
    ...new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  return items.length > 0 ? items : undefined;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
