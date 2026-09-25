import type { SupportedLanguage } from '../../../config/app-config';

export const POSITION_LABELS: Record<string, { ar: string; en: string }> = {
  driver: { ar: 'مقعد السائق', en: 'Driver seat' },
  front_passenger: { ar: 'مقعد الراكب الأمامي', en: 'Front passenger seat' },
  rear: { ar: 'المقاعد الخلفية', en: 'Rear seats' },
  third_row: { ar: 'الصف الثالث', en: 'Third row' },
  cargo: { ar: 'صندوق الأمتعة', en: 'Cargo area' },
  other: { ar: 'مشهد آخر', en: 'Other view' },
};

export const DEMO_TOUR_LABEL = {
  ar: 'تجريبي — ليست مقصورة سيارة حقيقية',
  en: 'Demo — not a real car interior',
};

export function positionLabel(position: string, lang: SupportedLanguage): string {
  return (POSITION_LABELS[position] ?? POSITION_LABELS.other)[lang];
}

/** Localized text with a fallback to the other language (null when both blank). */
export function textIn(
  lang: SupportedLanguage,
  ar: string | null | undefined,
  en: string | null | undefined,
): string | null {
  const primary = (lang === 'en' ? en : ar)?.trim();
  const other = (lang === 'en' ? ar : en)?.trim();
  return primary || other || null;
}

/** Localized name (never null: '' when both blank). */
export function nameIn(
  lang: SupportedLanguage,
  ar: string | null | undefined,
  en: string | null | undefined,
): string {
  return textIn(lang, ar, en) ?? '';
}
