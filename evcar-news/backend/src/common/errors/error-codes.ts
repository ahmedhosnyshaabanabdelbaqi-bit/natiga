import type { LocalizedText } from '../i18n/localized-text';

/**
 * Generic error codes and their default localized messages. Modules may use
 * their own codes (SCREAMING_SNAKE_CASE, e.g. ARTICLE_NOT_PUBLISHABLE) by
 * passing an explicit message to AppException.
 */
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  INVALID_JSON: 'INVALID_JSON',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  CONFLICT: 'CONFLICT',
  GONE: 'GONE',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  PRECONDITION_FAILED: 'PRECONDITION_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTEGRATION_NOT_CONFIGURED: 'INTEGRATION_NOT_CONFIGURED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export const DEFAULT_ERROR_MESSAGES: Record<ErrorCodeValue, LocalizedText> = {
  BAD_REQUEST: { ar: 'الطلب غير صالح.', en: 'The request is invalid.' },
  INVALID_JSON: { ar: 'نص JSON في الطلب غير صالح.', en: 'The request body is not valid JSON.' },
  VALIDATION_FAILED: {
    ar: 'بعض الحقول غير صالحة. راجع التفاصيل.',
    en: 'Some fields are invalid. See details.',
  },
  UNAUTHORIZED: { ar: 'يجب تسجيل الدخول.', en: 'Authentication is required.' },
  TOKEN_EXPIRED: { ar: 'انتهت صلاحية الجلسة.', en: 'The access token has expired.' },
  FORBIDDEN: {
    ar: 'ليست لديك صلاحية لتنفيذ هذا الإجراء.',
    en: 'You do not have permission to perform this action.',
  },
  NOT_FOUND: { ar: 'العنصر المطلوب غير موجود.', en: 'The requested resource was not found.' },
  METHOD_NOT_ALLOWED: { ar: 'الطريقة غير مسموحة.', en: 'Method not allowed.' },
  CONFLICT: {
    ar: 'يتعارض الطلب مع بيانات موجودة.',
    en: 'The request conflicts with existing data.',
  },
  GONE: { ar: 'لم يعد هذا العنصر متاحًا.', en: 'This resource is no longer available.' },
  PAYLOAD_TOO_LARGE: {
    ar: 'حجم البيانات المرسلة أكبر من المسموح.',
    en: 'The payload is too large.',
  },
  UNSUPPORTED_MEDIA_TYPE: { ar: 'نوع المحتوى غير مدعوم.', en: 'Unsupported media type.' },
  PRECONDITION_FAILED: {
    ar: 'تغيّر العنصر منذ آخر قراءة.',
    en: 'The resource changed since it was read.',
  },
  RATE_LIMITED: {
    ar: 'طلبات كثيرة جدًا. حاول مرة أخرى بعد قليل.',
    en: 'Too many requests. Please try again shortly.',
  },
  INTEGRATION_NOT_CONFIGURED: {
    ar: 'هذه الخدمة غير مهيأة بعد.',
    en: 'This integration is not configured.',
  },
  SERVICE_UNAVAILABLE: {
    ar: 'الخدمة غير متاحة حاليًا.',
    en: 'The service is currently unavailable.',
  },
  UPSTREAM_ERROR: {
    ar: 'تعذر الوصول إلى خدمة خارجية.',
    en: 'An external service could not be reached.',
  },
  NOT_IMPLEMENTED: { ar: 'هذه الميزة غير منفذة بعد.', en: 'This feature is not implemented yet.' },
  INTERNAL_ERROR: { ar: 'حدث خطأ غير متوقع.', en: 'An unexpected error occurred.' },
};
