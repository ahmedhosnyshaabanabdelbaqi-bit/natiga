import { t, useLocale } from '@/lib/i18n';

type Props = {
    siteName: string;
    tagline: string;
    logo: string | null;
    primary: string;
    accent: string;
    background: string;
};

const HEX = /^#[0-9a-f]{6}$/i;

function safe(color: string, fallback: string): string {
    return HEX.test(color) ? color : fallback;
}

/** Relative luminance → readable text colour on top of `hex`. */
function readableOn(hex: string): string {
    const value = Number.parseInt(hex.slice(1), 16);
    const [r, g, b] = [
        (value >> 16) & 255,
        (value >> 8) & 255,
        value & 255,
    ].map((channel) => {
        const c = channel / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 0.45 ? '#0B1220' : '#FFFFFF';
}

/** Live preview of the unsaved branding values (header, heading, buttons) — nothing is persisted here. */
export function BrandingPreview({
    siteName,
    tagline,
    logo,
    primary,
    accent,
    background,
}: Props) {
    const { dir } = useLocale();
    const p = safe(primary, '#0B1220');
    const a = safe(accent, '#0F766E');
    const bg = safe(background, '#F8FAFC');

    return (
        <section
            aria-label={t('system.settings.preview.title')}
            className="grid gap-2"
        >
            <div>
                <h3 className="text-sm font-medium">
                    {t('system.settings.preview.title')}
                </h3>
                <p className="text-xs text-muted-foreground">
                    {t('system.settings.preview.description')}
                </p>
            </div>
            <div
                dir={dir}
                className="overflow-hidden rounded-xl border shadow-card"
                style={{ backgroundColor: bg }}
            >
                <div
                    className="flex items-center gap-3 px-4 py-3"
                    style={{ backgroundColor: p, color: readableOn(p) }}
                >
                    {logo ? (
                        <img
                            src={logo}
                            alt=""
                            className="h-7 max-w-28 object-contain"
                        />
                    ) : null}
                    <span className="truncate text-sm font-semibold">
                        {siteName || '—'}
                    </span>
                </div>
                <div
                    className="grid gap-3 px-4 py-5"
                    style={{ color: '#0B1220' }}
                >
                    <p className="text-base font-semibold">
                        {t('system.settings.preview.sample_heading')}
                    </p>
                    <p className="text-sm opacity-80">
                        {tagline || t('system.settings.preview.sample_text')}
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                        <span
                            className="rounded-md px-3 py-1.5 text-sm font-medium"
                            style={{ backgroundColor: a, color: readableOn(a) }}
                        >
                            {t('system.settings.preview.button')}
                        </span>
                        <span
                            className="text-sm font-medium underline underline-offset-4"
                            style={{ color: a }}
                        >
                            {t('system.settings.preview.link')}
                        </span>
                    </div>
                </div>
            </div>
        </section>
    );
}
