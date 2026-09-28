import type { SupportedLanguage } from '../../../config/app-config';
import type { LocalizedText } from '../../../common/i18n/localized-text';
import { ServiceProviderType } from '../../../generated/prisma/enums';

export const SERVICE_TYPES = Object.values(ServiceProviderType) as ServiceProviderType[];

export const SERVICE_TYPE_LABELS: Record<ServiceProviderType, LocalizedText> = {
  service_center: { ar: 'مركز خدمة', en: 'Service centre' },
  dealer: { ar: 'وكيل', en: 'Dealer' },
  charger_installer: { ar: 'تركيب الشواحن', en: 'Charger installation' },
  emergency: { ar: 'خدمات الطوارئ', en: 'Emergency services' },
  battery_service: { ar: 'خدمة البطاريات', en: 'Battery service' },
  other: { ar: 'خدمات أخرى', en: 'Other services' },
};

export const serviceTypeLabel = (type: ServiceProviderType, lang: SupportedLanguage): string =>
  SERVICE_TYPE_LABELS[type][lang];

/** Shown with every sponsored entry when the stored label is empty (never unlabelled). */
export const DEFAULT_SPONSOR_LABEL: LocalizedText = { ar: 'مُموَّل', en: 'Sponsored' };

/** Contact data older than this is shown as "verification may be outdated". */
export const CONTACT_STALE_DAYS = 365;

export function sponsoredNow(
  p: { isSponsored: boolean; sponsoredUntil: Date | null },
  now: Date = new Date(),
): boolean {
  return p.isSponsored && (p.sponsoredUntil === null || p.sponsoredUntil.getTime() > now.getTime());
}

export function sponsorLabelOf(
  p: { isSponsored: boolean; sponsoredUntil: Date | null; sponsorLabel: string | null },
  lang: SupportedLanguage,
  now: Date = new Date(),
): string | null {
  if (!sponsoredNow(p, now)) return null;
  const stored = p.sponsorLabel?.trim();
  return stored ? stored : DEFAULT_SPONSOR_LABEL[lang];
}

/** Date in the reader's language for the "verified on …" label (UTC day). */
function formatDay(d: Date, lang: SupportedLanguage): string {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

export function contactLabel(
  verifiedAt: Date | null,
  stale: boolean,
  lang: SupportedLanguage,
): string {
  if (!verifiedAt) {
    return lang === 'ar'
      ? 'لم يتم التحقق من بيانات التواصل'
      : 'Contact details have not been verified';
  }
  const day = formatDay(verifiedAt, lang);
  if (stale) {
    return lang === 'ar'
      ? `تم التحقق في ${day} (قد تكون البيانات قديمة)`
      : `Verified on ${day} (may be outdated)`;
  }
  return lang === 'ar' ? `تم التحقق في ${day}` : `Verified on ${day}`;
}

export function isStale(verifiedAt: Date | null, now: Date = new Date()): boolean {
  if (!verifiedAt) return false;
  return now.getTime() - verifiedAt.getTime() > CONTACT_STALE_DAYS * 86_400_000;
}
