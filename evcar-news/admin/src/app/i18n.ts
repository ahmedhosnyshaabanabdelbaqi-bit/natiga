import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { setRequestContext } from '@/api/client';
import { readStorage, writeStorage } from '@/lib/storage';

/**
 * One namespace file per feature: src/locales/{ar,en}/<namespace>.json.
 * Files are discovered at build time, so adding a feature never requires
 * editing a shared file.
 */
const modules = import.meta.glob<{ default: Record<string, unknown> }>('../locales/*/*.json', {
  eager: true,
});

export const SUPPORTED_LANGUAGES = ['ar', 'en'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

type Resources = Record<string, Record<string, Record<string, unknown>>>;

export const resources: Resources = {};
const namespaceSet = new Set<string>();
for (const [path, mod] of Object.entries(modules)) {
  const match = /locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
  if (!match) continue;
  const [, lng, ns] = match as unknown as [string, string, string];
  resources[lng] ??= {};
  resources[lng][ns] = mod.default;
  namespaceSet.add(ns);
}
export const namespaces = [...namespaceSet].sort();

const STORAGE_KEY = 'evcar-admin.lang';

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function directionFor(lang: string): 'rtl' | 'ltr' {
  return lang.startsWith('ar') ? 'rtl' : 'ltr';
}

function initialLanguage(): AppLanguage {
  const stored = readStorage(STORAGE_KEY);
  if (isAppLanguage(stored)) return stored;
  // Arabic is the product default (ARCHITECTURE §4.3).
  return 'ar';
}

export function applyDocumentLanguage(lang: string): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.documentElement.dir = directionFor(lang);
}

const lng = initialLanguage();

void i18n.use(initReactI18next).init({
  resources,
  lng,
  fallbackLng: { ar: ['en'], en: ['ar'], default: ['ar'] },
  supportedLngs: [...SUPPORTED_LANGUAGES],
  ns: namespaces,
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
});

applyDocumentLanguage(lng);
setRequestContext({ lang: lng });

i18n.on('languageChanged', (next) => {
  applyDocumentLanguage(next);
  setRequestContext({ lang: next });
  writeStorage(STORAGE_KEY, next);
});

export default i18n;
