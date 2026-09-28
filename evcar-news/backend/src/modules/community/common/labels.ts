import type { Bilingual } from '../../../common/validation/messages';

export const CAR_DIMENSIONS = [
  'range_real_world',
  'charging',
  'comfort',
  'technology',
  'build_quality',
  'value_for_money',
  'reliability',
  'after_sales',
] as const;
export const STATION_DIMENSIONS = [
  'station_reliability',
  'station_access',
  'station_price',
  'station_amenities',
] as const;
export const RATING_DIMENSIONS = [...CAR_DIMENSIONS, ...STATION_DIMENSIONS] as const;
export type RatingDimension = (typeof RATING_DIMENSIONS)[number];

export const DIMENSION_LABELS: Record<RatingDimension, Bilingual> = {
  range_real_world: { ar: 'المدى الفعلي', en: 'Real-world range' },
  charging: { ar: 'الشحن', en: 'Charging' },
  comfort: { ar: 'الراحة', en: 'Comfort' },
  technology: { ar: 'التقنية', en: 'Technology' },
  build_quality: { ar: 'جودة التصنيع', en: 'Build quality' },
  value_for_money: { ar: 'القيمة مقابل السعر', en: 'Value for money' },
  reliability: { ar: 'الاعتمادية', en: 'Reliability' },
  after_sales: { ar: 'خدمة ما بعد البيع', en: 'After-sales service' },
  station_reliability: { ar: 'اعتمادية المحطة', en: 'Station reliability' },
  station_access: { ar: 'سهولة الوصول', en: 'Ease of access' },
  station_price: { ar: 'السعر', en: 'Price' },
  station_amenities: { ar: 'المرافق', en: 'Amenities' },
};

export const CONTENT_REPORT_REASONS = [
  'spam',
  'abuse',
  'off_topic',
  'misinformation',
  'personal_data',
  'copyright',
  'other',
] as const;
export type ContentReportReasonCode = (typeof CONTENT_REPORT_REASONS)[number];

/** Fallback labels when the report_reasons reference row is missing. */
export const REPORT_REASON_FALLBACK: Record<ContentReportReasonCode, Bilingual> = {
  spam: { ar: 'رسائل مزعجة أو إعلان', en: 'Spam or advertising' },
  abuse: { ar: 'إساءة أو تحرش', en: 'Abuse or harassment' },
  off_topic: { ar: 'خارج الموضوع', en: 'Off topic' },
  misinformation: { ar: 'معلومات مضللة', en: 'Misinformation' },
  personal_data: { ar: 'بيانات شخصية', en: 'Personal data' },
  copyright: { ar: 'انتهاك حقوق النشر', en: 'Copyright infringement' },
  other: { ar: 'سبب آخر', en: 'Other' },
};

export const VERIFIED_OWNER_LABEL: Bilingual = { ar: 'مالك موثّق', en: 'Verified owner' };
export const DELETED_USER_LABEL: Bilingual = { ar: 'مستخدم محذوف', en: 'Deleted user' };
