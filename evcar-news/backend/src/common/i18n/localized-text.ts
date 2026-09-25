import type { SupportedLanguage } from '../../config/app-config';

/** Text available in every supported language. */
export type LocalizedText = Record<SupportedLanguage, string>;

export function pickLocalized(
  text: LocalizedText | string | undefined,
  lang: SupportedLanguage,
): string | undefined {
  if (text === undefined) return undefined;
  if (typeof text === 'string') return text;
  return text[lang] ?? text.en ?? text.ar;
}
