/**
 * ترجمة قيم الحالات القادمة من الخادم إلى عربية.
 *
 * الخادم يرسل رموزًا ثابتة (`standard`, `posted`, `sale_return`…) لأن العميل
 * يتصرف بناءً عليها، والواجهة وحدها مسؤولة عن عرضها للبشر. ترك الرمز ظاهرًا
 * في واجهة عربية خطأ في المحتوى، لا مجرد تفصيلة تصميم.
 */

const PRODUCT_TYPE: Record<string, string> = {
    standard: 'عادي',
    weighted: 'موزون',
    service: 'خدمة',
    bundle: 'باقة',
};

const TRACKING: Record<string, string> = {
    none: 'بدون',
    serial: 'رقم تسلسلي',
    batch: 'دفعات وصلاحية',
};

const MOVEMENT_REASON: Record<string, string> = {
    sale: 'بيع',
    sale_return: 'مرتجع مبيعات',
    purchase_receipt: 'استلام مشتريات',
    purchase_return: 'مرتجع مشتريات',
    transfer_out: 'تحويل صادر',
    transfer_in: 'تحويل وارد',
    stocktake: 'فرق جرد',
    adjustment: 'تسوية',
    opening: 'رصيد افتتاحي',
    damage: 'تالف',
};

const DOC_STATUS: Record<string, string> = {
    draft: 'مسودة',
    approved: 'معتمد',
    partially_received: 'مستلم جزئيًا',
    received: 'مستلم',
    posted: 'مُرحَّل',
    closed: 'مغلق',
    cancelled: 'ملغي',
    completed: 'معتمد',
    voided: 'ملغاة',
    open: 'مفتوحة',
    closing: 'قيد الإغلاق',
    reconciled: 'مسوّاة',
    paid: 'مسدد',
    partially_paid: 'مسدد جزئيًا',
};

/** الرمز غير المعروف يُعرض كما هو بدل إخفائه — الصمت أسوأ من رمز إنجليزي. */
const lookup = (map: Record<string, string>) => (value: unknown) =>
    map[String(value ?? '')] ?? String(value ?? '—');

export const productType = lookup(PRODUCT_TYPE);
export const tracking = lookup(TRACKING);
export const movementReason = lookup(MOVEMENT_REASON);
export const docStatus = lookup(DOC_STATUS);
