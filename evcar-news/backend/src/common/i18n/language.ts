import type { SupportedLanguage } from '../../config/app-config';

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = ['ar', 'en'];

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/** Parses an Accept-Language header into language ranges ordered by quality. */
export function parseAcceptLanguage(header: string | undefined): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part, index) => {
      const [rangeRaw, ...params] = part.trim().split(';');
      const range = rangeRaw.trim().toLowerCase();
      let q = 1;
      for (const p of params) {
        const [k, v] = p.trim().split('=');
        if (k === 'q') {
          const parsed = Number(v);
          q = Number.isFinite(parsed) ? parsed : 0;
        }
      }
      return { range, q, index };
    })
    .filter((x) => x.range && x.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map((x) => x.range);
}

/**
 * Language precedence (contract §4.3): ?lang=ar|en → Accept-Language → default.
 * Unsupported values are ignored rather than rejected.
 */
export function resolveLanguage(
  queryLang: string | undefined,
  acceptLanguage: string | undefined,
  fallback: SupportedLanguage,
): SupportedLanguage {
  const q = queryLang?.trim().toLowerCase();
  if (isSupportedLanguage(q)) return q;
  for (const range of parseAcceptLanguage(acceptLanguage)) {
    const primary = range.split('-')[0];
    if (isSupportedLanguage(primary)) return primary;
  }
  return fallback;
}

/** Text direction for a language (ar = rtl). */
export function directionOf(lang: SupportedLanguage): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}
