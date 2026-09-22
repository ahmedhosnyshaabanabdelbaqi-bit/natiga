import { boot, currentLocale } from '@/lib/i18n';

const intlLocale = (locale = currentLocale()) => (locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-EG');

const currencyNamesAr: Record<string, string> = {
    EGP: 'ج.م',
    USD: 'دولار',
    EUR: 'يورو',
    CNY: 'يوان',
    AED: 'د.إ',
    SAR: 'ر.س',
};

/** Money is always a decimal string from the server. Never do arithmetic on the client for display-critical values. */
export function formatMoney(
    amount: string | number | null | undefined,
    currency: string = boot().currency,
    options: { locale?: 'ar' | 'en'; minimumFractionDigits?: number } = {},
): string {
    if (amount === null || amount === undefined || amount === '') {
        return '—';
    }
    const locale = options.locale ?? currentLocale();
    const numeric = typeof amount === 'number' ? amount : Number.parseFloat(amount);
    if (Number.isNaN(numeric)) {
        return String(amount);
    }
    const formatted = new Intl.NumberFormat(intlLocale(locale), {
        minimumFractionDigits: options.minimumFractionDigits ?? 2,
        maximumFractionDigits: 2,
    }).format(numeric);
    const label = locale === 'ar' ? (currencyNamesAr[currency] ?? currency) : currency;
    return locale === 'ar' ? `${formatted} ${label}` : `${label} ${formatted}`;
}

export function formatNumber(value: number | string | null | undefined, maximumFractionDigits = 2): string {
    if (value === null || value === undefined || value === '') {
        return '—';
    }
    const numeric = typeof value === 'number' ? value : Number.parseFloat(value);
    if (Number.isNaN(numeric)) {
        return String(value);
    }
    return new Intl.NumberFormat(intlLocale(), { maximumFractionDigits }).format(numeric);
}

export function formatPercent(value: number | string | null | undefined, maximumFractionDigits = 1): string {
    if (value === null || value === undefined || value === '') {
        return '—';
    }
    const numeric = typeof value === 'number' ? value : Number.parseFloat(value);
    return `${new Intl.NumberFormat(intlLocale(), { maximumFractionDigits }).format(numeric)}%`;
}

function toDate(value: string | Date | null | undefined): Date | null {
    if (!value) {
        return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | Date | null | undefined, style: 'short' | 'medium' | 'long' = 'medium'): string {
    const date = toDate(value);
    if (!date) {
        return '—';
    }
    return new Intl.DateTimeFormat(intlLocale(), {
        timeZone: boot().timezone,
        dateStyle: style,
    }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
    const date = toDate(value);
    if (!date) {
        return '—';
    }
    return new Intl.DateTimeFormat(intlLocale(), {
        timeZone: boot().timezone,
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date);
}

export function formatTime(value: string | Date | null | undefined): string {
    const date = toDate(value);
    if (!date) {
        return '—';
    }
    return new Intl.DateTimeFormat(intlLocale(), { timeZone: boot().timezone, timeStyle: 'short' }).format(date);
}

export function formatRelative(value: string | Date | null | undefined): string {
    const date = toDate(value);
    if (!date) {
        return '—';
    }
    const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
    const rtf = new Intl.RelativeTimeFormat(intlLocale(), { numeric: 'auto' });
    const abs = Math.abs(diffSeconds);
    if (abs < 60) {
        return rtf.format(diffSeconds, 'second');
    }
    if (abs < 3600) {
        return rtf.format(Math.round(diffSeconds / 60), 'minute');
    }
    if (abs < 86400) {
        return rtf.format(Math.round(diffSeconds / 3600), 'hour');
    }
    if (abs < 86400 * 30) {
        return rtf.format(Math.round(diffSeconds / 86400), 'day');
    }
    return formatDate(date);
}

export function formatFileSize(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(0)} KB`;
    }
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDistance(km: number | null | undefined, straightLine = true): string {
    if (km === null || km === undefined) {
        return '—';
    }
    const value = km < 10 ? km.toFixed(1) : Math.round(km).toString();
    const unit = currentLocale() === 'ar' ? 'كم' : 'km';
    return straightLine ? `≈ ${value} ${unit}` : `${value} ${unit}`;
}
