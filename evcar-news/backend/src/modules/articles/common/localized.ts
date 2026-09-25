import type { SupportedLanguage } from '../../../config/app-config';

/** Name in the request language, falling back to the other language (never an empty string). */
export function pickName(
  nameAr: string | null | undefined,
  nameEn: string | null | undefined,
  lang: SupportedLanguage,
): string | null {
  const primary = lang === 'en' ? nameEn : nameAr;
  const secondary = lang === 'en' ? nameAr : nameEn;
  return (primary?.trim() || secondary?.trim()) ?? null;
}

/** Value of a per-locale translation list in `lang`, else the other language. */
export function pickTranslation<T extends { locale: string }>(
  rows: readonly T[],
  lang: SupportedLanguage,
): T | undefined {
  return rows.find((r) => r.locale === lang) ?? rows.find((r) => r.locale !== lang);
}

export const CONTENT_LOCALES = ['ar', 'en'] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];

export function isContentLocale(value: unknown): value is ContentLocale {
  return value === 'ar' || value === 'en';
}
