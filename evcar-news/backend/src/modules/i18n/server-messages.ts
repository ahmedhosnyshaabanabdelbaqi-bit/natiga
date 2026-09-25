import type { SupportedLanguage } from '../../config/app-config';
import type { LocalizedText } from '../../common/i18n/localized-text';
import { AR } from './catalogs/ar';
import { EN } from './catalogs/en';

/**
 * Server message catalogs (ar/en) + admin overrides, usable without DI
 * (provider adapters, exception mapping). I18nService installs the override
 * snapshot at startup and refreshes it after every admin change.
 */
export const CATALOGS: Record<SupportedLanguage, Readonly<Record<string, string>>> = {
  ar: AR,
  en: EN,
};

/** Namespaces owned by the server catalogs (overridable, placeholders enforced). */
export const SERVER_NAMESPACES = ['errors', 'notifications', 'labels'] as const;
export type ServerNamespace = (typeof SERVER_NAMESPACES)[number];

export type MessageParams = Record<string, string | number | null | undefined>;

type OverrideLookup = (lang: SupportedLanguage, fullKey: string) => string | undefined;

let overrideLookup: OverrideLookup = () => undefined;

/** Installed by I18nService; tests may reset with `setOverrideLookup(() => undefined)`. */
export function setOverrideLookup(fn: OverrideLookup): void {
  overrideLookup = fn;
}

const PLACEHOLDER = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;

export function placeholdersOf(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]))].sort();
}

export function interpolate(template: string, params: MessageParams = {}): string {
  return template.replace(PLACEHOLDER, (whole, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? whole : String(value);
  });
}

export function catalogHas(fullKey: string): boolean {
  return fullKey in EN;
}

/** Text of `fullKey` ("errors.NOT_FOUND") in `lang`: override → catalog → English → undefined. */
export function serverMessageText(
  fullKey: string,
  lang: SupportedLanguage,
  params?: MessageParams,
): string | undefined {
  const raw = overrideLookup(lang, fullKey) ?? CATALOGS[lang][fullKey] ?? CATALOGS.en[fullKey];
  return raw === undefined ? undefined : interpolate(raw, params);
}

/** Both languages, for AppException messages (the filter picks the request language). */
export function serverMessage(fullKey: string, params?: MessageParams): LocalizedText {
  return {
    ar: serverMessageText(fullKey, 'ar', params) ?? fullKey,
    en: serverMessageText(fullKey, 'en', params) ?? fullKey,
  };
}

/**
 * Localized text for an error code, honouring admin overrides — the helper
 * for AllExceptionsFilter (see docs/decisions/backend-platform.md §i18n):
 *   resolveErrorMessage(normalized.code, lang) ?? <default catalog message>
 */
export function resolveErrorMessage(code: string, lang: SupportedLanguage): string | undefined {
  return serverMessageText(`errors.${code}`, lang);
}
