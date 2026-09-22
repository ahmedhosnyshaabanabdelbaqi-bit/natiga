import type { StatusTone } from '@/components/shared/status-badge';
import { boot, currentLocale, hasTranslation, t } from '@/lib/i18n';
import type { LocalizedLabel } from '@/features/system/types';

/** Label in the current locale from an `{ ar, en }` pair (falls back to the other language). */
export function pick(
    label: LocalizedLabel | string | null | undefined,
): string {
    if (!label) {
        return '';
    }
    if (typeof label === 'string') {
        return label;
    }
    const locale = currentLocale();
    return label[locale] || label[locale === 'ar' ? 'en' : 'ar'] || '';
}

/** Humanise a technical code (`account_disabled` → `account disabled`). */
export function humanize(code: string): string {
    return code.replace(/[._-]+/g, ' ').trim();
}

/** Translate `key` when it exists, otherwise return the fallback (never a raw key). */
export function tOr(
    key: string,
    fallback: string,
    replacements: Record<string, string | number> = {},
): string {
    return hasTranslation(key) ? t(key, replacements) : fallback;
}

/** Security event type label (types are registered by many modules; unknown ones are humanised). */
export function securityEventLabel(type: string): string {
    return tOr(`audit.security.types.${type}`, humanize(type));
}

export function severityTone(severity: string): StatusTone {
    return severity === 'critical'
        ? 'danger'
        : severity === 'warning'
          ? 'warning'
          : 'info';
}

/** Platform-timezone (Cairo) wall-clock value for a `datetime-local` input from an ISO timestamp. */
export function toCairoInput(iso: string | null | undefined): string {
    if (!iso) {
        return '';
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: boot().timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value ?? '00';
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
