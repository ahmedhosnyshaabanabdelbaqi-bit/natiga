import type { SupportedLanguage } from '../../../config/app-config';
import type { Bilingual } from '../../../common/validation/messages';

/**
 * Codes stored on stations (amenities[], payment_methods[], start_methods[])
 * and enum values, with their ar/en labels. Unknown codes (e.g. added by an
 * import) are served with the code as label, never dropped.
 */
export const AMENITIES: Record<string, Bilingual> = {
  restroom: { ar: 'دورات مياه', en: 'Restrooms' },
  cafe: { ar: 'مقهى', en: 'Café' },
  restaurant: { ar: 'مطعم', en: 'Restaurant' },
  shopping: { ar: 'تسوق', en: 'Shopping' },
  supermarket: { ar: 'سوبر ماركت', en: 'Supermarket' },
  wifi: { ar: 'واي فاي', en: 'Wi-Fi' },
  mosque: { ar: 'مسجد / مصلى', en: 'Mosque / prayer room' },
  hotel: { ar: 'فندق', en: 'Hotel' },
  parking: { ar: 'موقف سيارات', en: 'Parking' },
  covered_parking: { ar: 'موقف مظلل', en: 'Covered parking' },
  fuel_station: { ar: 'محطة وقود', en: 'Fuel station' },
  car_wash: { ar: 'غسيل سيارات', en: 'Car wash' },
  lounge: { ar: 'استراحة', en: 'Lounge' },
  playground: { ar: 'منطقة ألعاب', en: 'Playground' },
  atm: { ar: 'صراف آلي', en: 'ATM' },
  pharmacy: { ar: 'صيدلية', en: 'Pharmacy' },
  accessible: { ar: 'مهيأ لذوي الإعاقة', en: 'Wheelchair accessible' },
  lighting: { ar: 'إضاءة ليلية', en: 'Lit at night' },
  security: { ar: 'حراسة / كاميرات', en: 'Security / CCTV' },
};

export const PAYMENT_METHODS: Record<string, Bilingual> = {
  app: { ar: 'تطبيق المشغّل', en: 'Operator app' },
  rfid: { ar: 'بطاقة RFID', en: 'RFID card' },
  bank_card: { ar: 'بطاقة بنكية', en: 'Bank card' },
  contactless: { ar: 'دفع لا تلامسي', en: 'Contactless' },
  cash: { ar: 'نقدًا', en: 'Cash' },
  free: { ar: 'مجاني', en: 'Free of charge' },
  plug_and_charge: { ar: 'Plug & Charge', en: 'Plug & Charge' },
  subscription: { ar: 'اشتراك', en: 'Subscription' },
  qr_code: { ar: 'رمز QR', en: 'QR code' },
};

export const START_METHODS: Record<string, Bilingual> = {
  app: { ar: 'تطبيق المشغّل', en: 'Operator app' },
  rfid: { ar: 'بطاقة RFID', en: 'RFID card' },
  plug_and_charge: { ar: 'Plug & Charge', en: 'Plug & Charge' },
  card: { ar: 'بطاقة بنكية على الشاحن', en: 'Card at the charger' },
  qr_code: { ar: 'رمز QR', en: 'QR code' },
  staff: { ar: 'بمساعدة الموظفين', en: 'Staff-assisted' },
  plug_in: { ar: 'يبدأ عند التوصيل', en: 'Starts when plugged in' },
};

export const ACCESS_TYPES: Record<string, Bilingual> = {
  public: { ar: 'عامة', en: 'Public' },
  customers_only: { ar: 'للعملاء فقط', en: 'Customers only' },
  restricted: { ar: 'دخول مقيد', en: 'Restricted access' },
  private: { ar: 'خاصة', en: 'Private' },
  unknown: { ar: 'غير معروف', en: 'Unknown' },
};

export const OPERATIONAL_STATUSES: Record<string, Bilingual> = {
  operational: { ar: 'تعمل', en: 'Operational' },
  planned: { ar: 'مخطط لها', en: 'Planned' },
  temporarily_unavailable: { ar: 'متوقفة مؤقتًا', en: 'Temporarily unavailable' },
  permanently_closed: { ar: 'مغلقة نهائيًا', en: 'Permanently closed' },
  unknown: { ar: 'غير معروف', en: 'Unknown' },
};

export const CHECKIN_OUTCOMES: Record<string, Bilingual> = {
  charged_successfully: { ar: 'تم الشحن بنجاح', en: 'Charged successfully' },
  waited_then_charged: { ar: 'انتظرت ثم شحنت', en: 'Waited, then charged' },
  could_not_charge: { ar: 'لم أتمكن من الشحن', en: 'Could not charge' },
  other: { ar: 'أخرى', en: 'Other' },
};

/** Fallback labels when the report_reasons table has no row for a type. */
export const REPORT_TYPES: Record<string, Bilingual> = {
  not_working: { ar: 'لا يعمل', en: 'Not working' },
  wrong_location: { ar: 'الموقع غير صحيح', en: 'Wrong location' },
  different_connector: { ar: 'الموصل مختلف', en: 'Different connector' },
  price_changed: { ar: 'السعر تغير', en: 'Price changed' },
  access_restricted: { ar: 'الدخول مقيد', en: 'Access restricted' },
  other: { ar: 'أخرى', en: 'Other' },
};

export const TARIFF_COMPONENTS: Record<string, Bilingual> = {
  energy: { ar: 'الطاقة', en: 'Energy' },
  time: { ar: 'مدة الشحن', en: 'Charging time' },
  flat: { ar: 'رسوم الجلسة', en: 'Session fee' },
  parking_time: { ar: 'رسوم الوقوف', en: 'Parking fee' },
  idle: { ar: 'رسوم الخمول بعد اكتمال الشحن', en: 'Idle fee after charging' },
};

export const PRICE_UNITS: Record<string, Bilingual> = {
  per_kwh: { ar: 'لكل كيلوواط ساعة', en: 'per kWh' },
  per_minute: { ar: 'لكل دقيقة', en: 'per minute' },
  per_hour: { ar: 'لكل ساعة', en: 'per hour' },
  per_session: { ar: 'لكل جلسة', en: 'per session' },
};

export const NOT_AVAILABLE: Bilingual = { ar: 'غير متوفر', en: 'Not available' };

export const COMMUNITY_DISCLAIMER: Bilingual = {
  ar: 'تسجيلات الزيارة والبلاغات بيانات مجتمعية مؤرخة من المستخدمين، وليست حالة لحظية رسمية للمحطة.',
  en: 'Check-ins and reports are dated community data from users, not an official live status of the station.',
};

export const AVAILABILITY_DISCLAIMER: Bilingual = {
  ar: 'يُعرض التوافر اللحظي فقط من مصدر يقدمه فعليًا وقبل انتهاء صلاحيته؛ غير ذلك تكون الحالة غير معروفة.',
  en: 'Live availability is shown only from a source that provides it and before it expires; otherwise it is unknown.',
};

export const COMPATIBILITY_NOTE: Bilingual = {
  ar: 'التوافق مبني على منافذ الشحن الموثقة لهذه الفئة في هذا السوق فقط، دون افتراض محولات.',
  en: 'Compatibility uses only the documented charging inlets of this trim in this market; no adapters are assumed.',
};

export function label(
  dict: Record<string, Bilingual>,
  code: string,
  lang: SupportedLanguage,
): string {
  return dict[code]?.[lang] ?? code;
}

export function labelled(
  dict: Record<string, Bilingual>,
  codes: readonly string[],
  lang: SupportedLanguage,
): { code: string; label: string }[] {
  return codes.map((code) => ({ code, label: label(dict, code, lang) }));
}

export function dictionary(
  dict: Record<string, Bilingual>,
  lang: SupportedLanguage,
): { code: string; label: string }[] {
  return Object.keys(dict).map((code) => ({ code, label: dict[code][lang] }));
}

/** Codes accepted in amenities / payment / start method arrays. */
export const CODE_RE = /^[a-z][a-z0-9_]{1,39}$/;
