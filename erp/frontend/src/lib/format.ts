/**
 * تنسيق موحّد. القيم المالية تصل من الخادم كنصوص عشرية دقيقة،
 * ولا تُحوَّل إلى Number قبل العرض حتى لا يُفقد جزء منها.
 */

const NUM = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const QTY = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });

export function money(value: string | number | null | undefined, currency = 'ج.م'): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return `${NUM.format(n)} ${currency}`;
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

export function pct(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return `${NUM.format(Number(value))}%`;
}

export function date(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('ar-EG', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return 'غير معروف';
  const diffMs = Date.now() - new Date(value).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  return `منذ ${Math.round(hours / 24)} يوم`;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function startOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

/** ترجمة حالات المستندات إلى عربي مع لون الشارة. */
export const STATUS_LABELS: Record<string, { label: string; tone: 'success' | 'warn' | 'danger' | 'info' | '' }> = {
  draft: { label: 'مسودة', tone: '' },
  pending_approval: { label: 'بانتظار الاعتماد', tone: 'warn' },
  pending_sync: { label: 'بانتظار المزامنة', tone: 'warn' },
  approved: { label: 'معتمد', tone: 'info' },
  posted: { label: 'مُرحَّل', tone: 'success' },
  partially_paid: { label: 'مسدد جزئيًا', tone: 'warn' },
  paid: { label: 'مسدد', tone: 'success' },
  cancelled: { label: 'ملغي', tone: 'danger' },
  received: { label: 'مُستلم', tone: 'info' },
  sent: { label: 'مُرسل', tone: 'info' },
  partially_received: { label: 'مستلم جزئيًا', tone: 'warn' },
  closed: { label: 'مقفل', tone: 'success' },
  reopened: { label: 'أُعيد فتحه', tone: 'warn' },
  open: { label: 'مفتوح', tone: 'info' },
  applied: { label: 'مُطبَّق', tone: 'success' },
  rejected: { label: 'مرفوض', tone: 'danger' },
  conflict: { label: 'تعارض', tone: 'danger' },
  processing: { label: 'قيد المعالجة', tone: 'warn' },
  estimated: { label: 'مقدَّرة', tone: 'warn' },
  earned: { label: 'مستحقة', tone: 'success' },
  settled: { label: 'مُسوّاة', tone: 'info' },
  available: { label: 'صالح للبيع', tone: 'success' },
  inspection: { label: 'تحت الفحص', tone: 'warn' },
  quarantine: { label: 'حجر', tone: 'warn' },
  damaged: { label: 'تالف', tone: 'danger' },
  in_transit: { label: 'بالطريق', tone: 'info' },
};

export function statusOf(key: string | null | undefined) {
  if (!key) return { label: '—', tone: '' as const };
  return STATUS_LABELS[key] ?? { label: key, tone: '' as const };
}
