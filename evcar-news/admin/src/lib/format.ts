/** Locale-aware formatting helpers (Arabic uses Arabic-Indic digits by default in Intl). */

export function formatDate(iso: string | null | undefined, lang: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(d);
}

export function formatDateTime(iso: string | null | undefined, lang: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export function formatNumber(value: number | null | undefined, lang: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return new Intl.NumberFormat(lang).format(value);
}

/** Relative time like "3 minutes ago" / "منذ ٣ دقائق". */
export function formatRelative(
  iso: string | null | undefined,
  lang: string,
  now = Date.now(),
): string {
  if (!iso) return '';
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return iso;
  const diffSec = Math.round((d - now) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  if (abs < 60) return rtf.format(diffSec, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day');
  return formatDate(iso, lang);
}
