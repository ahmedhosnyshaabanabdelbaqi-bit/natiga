/**
 * Arabic labels and badge tones for the status vocabularies the API returns.
 *
 * Kept in one place so the same status never reads differently on two screens.
 */

type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger';

interface Label {
  text: string;
  tone: Tone;
}

const DOCUMENT_STATUS: Record<string, Label> = {
  draft: { text: 'مسودة', tone: 'neutral' },
  pending_approval: { text: 'بانتظار الاعتماد', tone: 'warn' },
  approved: { text: 'معتمد', tone: 'brand' },
  posted: { text: 'مُرحّل', tone: 'ok' },
  received: { text: 'مستلم', tone: 'brand' },
  inspected: { text: 'تم الفحص', tone: 'brand' },
  issued: { text: 'مصروف', tone: 'brand' },
  in_transit: { text: 'بالطريق', tone: 'warn' },
  partially_received: { text: 'مستلم جزئيًا', tone: 'warn' },
  partially_delivered: { text: 'مسلّم جزئيًا', tone: 'warn' },
  delivered: { text: 'مسلّم', tone: 'ok' },
  dispatched: { text: 'تم الإرسال', tone: 'brand' },
  refused: { text: 'مرفوض', tone: 'danger' },
  rescheduled: { text: 'أُعيد جدولته', tone: 'warn' },
  closed: { text: 'مغلق', tone: 'neutral' },
  cancelled: { text: 'ملغي', tone: 'danger' },
  rejected: { text: 'مرفوض', tone: 'danger' },
  submitted: { text: 'مُسلَّم', tone: 'warn' },
  reopened: { text: 'أُعيد فتحه', tone: 'warn' },
  counting: { text: 'جارٍ العد', tone: 'warn' },
};

const DELIVERY_STATUS: Record<string, Label> = {
  pending: { text: 'لم يُسلَّم', tone: 'neutral' },
  partial: { text: 'جزئي', tone: 'warn' },
  delivered: { text: 'مكتمل', tone: 'ok' },
};

const INVOICE_STATUS: Record<string, Label> = {
  pending: { text: 'غير مفوتر', tone: 'neutral' },
  partial: { text: 'جزئي', tone: 'warn' },
  invoiced: { text: 'مفوتر', tone: 'ok' },
};

const PAYMENT_STATUS: Record<string, Label> = {
  unpaid: { text: 'غير مسدد', tone: 'danger' },
  partial: { text: 'مسدد جزئيًا', tone: 'warn' },
  paid: { text: 'مسدد', tone: 'ok' },
};

const PAYMENT_TYPE: Record<string, Label> = {
  cash: { text: 'نقدي', tone: 'ok' },
  credit: { text: 'آجل', tone: 'warn' },
  mixed: { text: 'مختلط', tone: 'brand' },
};

const WAREHOUSE_KIND: Record<string, Label> = {
  main: { text: 'رئيسي', tone: 'brand' },
  sub: { text: 'فرعي', tone: 'brand' },
  van: { text: 'سيارة', tone: 'warn' },
  transit: { text: 'بالطريق', tone: 'warn' },
  quarantine: { text: 'حجر', tone: 'danger' },
  inspection: { text: 'تحت الفحص', tone: 'warn' },
  damaged: { text: 'تالف', tone: 'danger' },
  returns: { text: 'مرتجعات', tone: 'neutral' },
};

const E_INVOICE_STATUS: Record<string, Label> = {
  not_submitted: { text: 'لم يُرسل', tone: 'neutral' },
  queued: { text: 'في الطابور', tone: 'warn' },
  submitted: { text: 'مُرسل', tone: 'warn' },
  accepted: { text: 'مقبول', tone: 'ok' },
  rejected: { text: 'مرفوض', tone: 'danger' },
  cancelled: { text: 'ملغي', tone: 'neutral' },
};

const SYNC_STATUS: Record<string, Label> = {
  pending: { text: 'قيد الانتظار', tone: 'warn' },
  applied: { text: 'تم التنفيذ', tone: 'ok' },
  rejected: { text: 'مرفوض', tone: 'danger' },
  conflict: { text: 'تعارض', tone: 'danger' },
  open: { text: 'مفتوح', tone: 'danger' },
  resolved: { text: 'تمت المعالجة', tone: 'ok' },
  dismissed: { text: 'مُستبعد', tone: 'neutral' },
};

const CUSTOMER_KIND: Record<string, Label> = {
  retail: { text: 'قطاعي', tone: 'neutral' },
  wholesale: { text: 'جملة', tone: 'brand' },
  distributor: { text: 'موزع', tone: 'brand' },
  project: { text: 'مشروع', tone: 'warn' },
  cash: { text: 'نقدي', tone: 'ok' },
};

const VOCABULARIES: Record<string, Record<string, Label>> = {
  status: DOCUMENT_STATUS,
  delivery_status: DELIVERY_STATUS,
  invoice_status: INVOICE_STATUS,
  payment_status: PAYMENT_STATUS,
  payment_type: PAYMENT_TYPE,
  warehouse_kind: WAREHOUSE_KIND,
  e_invoice_status: E_INVOICE_STATUS,
  sync_status: SYNC_STATUS,
  customer_kind: CUSTOMER_KIND,
};

export function label(vocabulary: string, value: string | null | undefined): Label {
  if (!value) return { text: '—', tone: 'neutral' };
  return VOCABULARIES[vocabulary]?.[value] ?? { text: value, tone: 'neutral' };
}

export const MODULE_LABELS: Record<string, string> = {
  dashboard: 'لوحة التحكم',
  items: 'الأصناف',
  customers: 'العملاء',
  sales: 'المبيعات',
  purchasing: 'المشتريات',
  inventory: 'المخازن',
  treasury: 'الخزينة',
  field: 'العمل الميداني',
  sync: 'المزامنة',
  reports: 'التقارير',
  accounting: 'الحسابات',
  approvals: 'الموافقات',
  admin: 'الإدارة',
};
