import { currentLang, t, type Lang, type MessageKey } from './i18n';

/**
 * تنسيق موحّد حسب اللغة النشطة.
 *
 * القيم المالية تصل من الخادم كنصوص عشرية دقيقة، ولا تُحوَّل إلى Number
 * قبل العرض حتى لا يُفقد جزء منها.
 *
 * الأرقام تُعرض بالأرقام اللاتينية في اللغتين — وهو المعتاد في برامج
 * الأعمال العربية ويسهّل المطابقة مع المستندات المطبوعة.
 */

const NUM = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const QTY = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const INT = new Intl.NumberFormat('en-US');

const DATE_LOCALE: Record<Lang, string> = { ar: 'ar-EG', en: 'en-GB' };

export function currency(): string {
  return t('common.currency');
}

export function money(value: string | number | null | undefined, unit = currency()): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return `${NUM.format(n)} ${unit}`;
}

export function moneyPlain(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isNaN(n) ? String(value) : NUM.format(n);
}

export function qty(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isNaN(n) ? String(value) : QTY.format(n);
}

export function integer(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isNaN(n) ? String(value) : INT.format(n);
}

export function pct(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return `${NUM.format(Number(value))}%`;
}

export function date(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(DATE_LOCALE[currentLang()], {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(DATE_LOCALE[currentLang()], {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return t('common.unknown');

  const mins = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (mins < 1) return t('common.now');
  if (mins < 60) return t('common.minutesAgo', { n: mins });

  const hours = Math.round(mins / 60);
  if (hours < 24) return t('common.hoursAgo', { n: hours });

  return t('common.daysAgo', { n: Math.round(hours / 24) });
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function startOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

/** ترجمة حالة مستند إلى نص ولون شارة. */
export function statusOf(key: string | null | undefined): { label: string; tone: 'success' | 'warn' | 'danger' | 'info' | '' } {
  if (!key) return { label: '—', tone: '' };

  const tones: Record<string, 'success' | 'warn' | 'danger' | 'info' | ''> = {
    draft: '', pending_approval: 'warn', pending_sync: 'warn', approved: 'info',
    posted: 'success', partially_paid: 'warn', paid: 'success', cancelled: 'danger',
    received: 'info', sent: 'info', partially_received: 'warn', closed: 'success',
    reopened: 'warn', open: 'info', applied: 'success', rejected: 'danger',
    conflict: 'danger', processing: 'warn', estimated: 'warn', earned: 'success',
    settled: 'info', available: 'success', inspection: 'warn', quarantine: 'warn',
    damaged: 'danger', in_transit: 'info',
    // أمر البيع وإذن التسليم
    pending: '', partial: 'warn', delivered: 'success', partially_delivered: 'warn',
    out_for_delivery: 'info', failed: 'danger', rescheduled: 'warn',
    invoiced: 'success', unpaid: 'warn',
  };

  if (!(key in tones)) return { label: key, tone: '' };

  return { label: t(`status.${key}` as MessageKey), tone: tones[key] };
}
