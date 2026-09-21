/**
 * Display formatting.
 *
 * Money and quantities arrive from the API as strings and stay strings until
 * the moment they are rendered. Nothing here parses a financial value into a
 * JavaScript number for arithmetic — it is only ever parsed to be displayed.
 */

const currencyFormatter = new Intl.NumberFormat('ar-EG', {
  style: 'decimal',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const qtyFormatter = new Intl.NumberFormat('ar-EG', {
  style: 'decimal',
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});

const intFormatter = new Intl.NumberFormat('ar-EG');

export function money(value: string | number | null | undefined, currency = 'ج.م'): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return `${currencyFormatter.format(n)} ${currency}`;
}

/** The bare number, for table cells where the currency sits in the header. */
export function amount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? currencyFormatter.format(n) : String(value);
}

export function qty(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? qtyFormatter.format(n) : String(value);
}

export function count(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? intFormatter.format(n) : String(value);
}

export function percent(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? `${currencyFormatter.format(n)}٪` : String(value);
}

export function formatKpi(value: string, format: string): string {
  switch (format) {
    case 'currency':
      return money(value);
    case 'ratio':
      return percent(Number(value) * (Number(value) <= 1 ? 100 : 1));
    default:
      return count(value);
  }
}

export function date(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  }).format(d);
}

/** "منذ ٣ دقائق" — used wherever the AGE of a reading matters. */
export function relativeTime(value: string | null | undefined): string {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return value;

  const seconds = Math.round((then - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat('ar-EG', { numeric: 'auto' });

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000], ['month', 2592000], ['day', 86400],
    ['hour', 3600], ['minute', 60], ['second', 1],
  ];

  for (const [unit, secondsInUnit] of units) {
    if (Math.abs(seconds) >= secondsInUnit || unit === 'second') {
      return rtf.format(Math.round(seconds / secondsInUnit), unit);
    }
  }
  return '—';
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function startOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
