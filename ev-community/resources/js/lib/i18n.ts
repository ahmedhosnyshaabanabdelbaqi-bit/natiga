import { usePage } from '@inertiajs/react';

export type Locale = 'ar' | 'en';
export type Direction = 'rtl' | 'ltr';

type Boot = {
    locale: Locale;
    dir: Direction;
    locales: { code: Locale; name: string; dir: Direction }[];
    translations: Record<string, string>;
    map: {
        provider: string;
        public_key: string | null;
        tile_url: string;
        default: { lat: number; lng: number; zoom: number };
    };
    timezone: string;
    currency: string;
};

declare global {
    interface Window {
        __EV__?: Boot;
    }
}

const fallbackBoot: Boot = {
    locale: 'ar',
    dir: 'rtl',
    locales: [
        { code: 'ar', name: 'العربية', dir: 'rtl' },
        { code: 'en', name: 'English', dir: 'ltr' },
    ],
    translations: {},
    map: {
        provider: 'osm',
        public_key: null,
        tile_url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        default: { lat: 30.0444, lng: 31.2357, zoom: 7 },
    },
    timezone: 'Africa/Cairo',
    currency: 'EGP',
};

export function boot(): Boot {
    if (typeof window !== 'undefined' && window.__EV__) {
        return window.__EV__;
    }
    return fallbackBoot;
}

export function currentLocale(): Locale {
    return boot().locale;
}

export function currentDir(): Direction {
    return boot().dir;
}

export function isRtl(): boolean {
    return currentDir() === 'rtl';
}

type Replacements = Record<string, string | number | null | undefined>;

/**
 * Translate a key from lang/<locale>/<file>.php (flattened as "file.key.sub").
 * Supports Laravel-style :param replacements and a simple `{count}` pluralization
 * via "singular|plural" strings when `count` is passed.
 */
export function t(key: string, replacements: Replacements = {}): string {
    const dict = boot().translations;
    let value = dict[key];

    if (value === undefined) {
        if (import.meta.env.DEV) {
            console.warn(`[i18n] missing translation: ${key}`);
        }
        // Never show raw keys to users: fall back to a humanized last segment.
        const last = key.split('.').pop() ?? key;
        value = last.replace(/_/g, ' ');
    }

    if (value.includes('|') && typeof replacements.count === 'number') {
        const parts = value.split('|');
        value = replacements.count === 1 ? parts[0] : (parts[1] ?? parts[0]);
    }

    for (const [name, replacement] of Object.entries(replacements)) {
        if (replacement === null || replacement === undefined) {
            continue;
        }
        value = value.replaceAll(`:${name}`, String(replacement));
    }

    return value;
}

/** Whether a key exists in the dictionary. */
export function hasTranslation(key: string): boolean {
    return boot().translations[key] !== undefined;
}

/** Pick a localized value from an object like { ar: '...', en: '...' } or `name_ar`/`name_en` columns. */
export function localized(
    source: Record<string, unknown> | null | undefined,
    base = 'name',
    locale: Locale = currentLocale(),
): string {
    if (!source) {
        return '';
    }
    const direct = source[`${base}_${locale}`] ?? source[locale];
    if (typeof direct === 'string' && direct !== '') {
        return direct;
    }
    const other: Locale = locale === 'ar' ? 'en' : 'ar';
    const fallback = source[`${base}_${other}`] ?? source[other] ?? source[base];
    return typeof fallback === 'string' ? fallback : '';
}

/** Hook wrapper: re-renders with page props (locale is part of shared props). */
export function useLocale(): {
    locale: Locale;
    dir: Direction;
    isRtl: boolean;
    locales: Boot['locales'];
} {
    const props = usePage().props as { locale?: Locale; dir?: Direction };
    const locale = props.locale ?? currentLocale();
    const dir = props.dir ?? (locale === 'ar' ? 'rtl' : 'ltr');
    return { locale, dir, isRtl: dir === 'rtl', locales: boot().locales };
}

export function useTrans(): typeof t {
    return t;
}
