import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import type { LocalizedText } from '../../common/i18n/localized-text';

/**
 * Error codes of the auth / users / rbac modules (error envelope `code`).
 * Clients may branch on them; messages are localized (ar/en).
 */
export const AuthErrorCode = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',
  INVALID_OR_EXPIRED_TOKEN: 'INVALID_OR_EXPIRED_TOKEN',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  REFRESH_TOKEN_REUSED: 'REFRESH_TOKEN_REUSED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  OAUTH_TOKEN_INVALID: 'OAUTH_TOKEN_INVALID',
  OAUTH_EMAIL_UNVERIFIED: 'OAUTH_EMAIL_UNVERIFIED',
  ADMIN_ROUTE_WITHOUT_PERMISSION: 'ADMIN_ROUTE_WITHOUT_PERMISSION',
  LAST_OWNER: 'LAST_OWNER',
  OWNER_ONLY: 'OWNER_ONLY',
  CANNOT_TARGET_SELF: 'CANNOT_TARGET_SELF',
  UNKNOWN_ROLE: 'UNKNOWN_ROLE',
  UNKNOWN_PERMISSION: 'UNKNOWN_PERMISSION',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  ROLE_NOT_FOUND: 'ROLE_NOT_FOUND',
  ROLE_NOT_EDITABLE: 'ROLE_NOT_EDITABLE',
  AUDIT_LOG_NOT_FOUND: 'AUDIT_LOG_NOT_FOUND',
} as const;

export type AuthErrorCodeValue = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];

export const AUTH_ERROR_MESSAGES: Record<AuthErrorCodeValue, LocalizedText> = {
  INVALID_CREDENTIALS: {
    ar: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
    en: 'Incorrect email or password.',
  },
  EMAIL_NOT_VERIFIED: {
    ar: 'يجب تأكيد بريدك الإلكتروني قبل تسجيل الدخول. تحقق من صندوق الوارد أو اطلب رابطًا جديدًا.',
    en: 'Please verify your email address before signing in. Check your inbox or request a new link.',
  },
  ACCOUNT_DISABLED: { ar: 'هذا الحساب موقوف.', en: 'This account is disabled.' },
  TOO_MANY_ATTEMPTS: {
    ar: 'محاولات كثيرة جدًا. حاول مرة أخرى بعد قليل.',
    en: 'Too many attempts. Please try again later.',
  },
  INVALID_OR_EXPIRED_TOKEN: {
    ar: 'الرابط أو الرمز غير صالح أو انتهت صلاحيته.',
    en: 'This link or code is invalid or has expired.',
  },
  INVALID_REFRESH_TOKEN: {
    ar: 'انتهت الجلسة. سجّل الدخول مرة أخرى.',
    en: 'Your session has ended. Please sign in again.',
  },
  REFRESH_TOKEN_REUSED: {
    ar: 'تم إنهاء الجلسة لأسباب أمنية. سجّل الدخول مرة أخرى.',
    en: 'The session was ended for security reasons. Please sign in again.',
  },
  SESSION_REVOKED: {
    ar: 'تم إنهاء هذه الجلسة. سجّل الدخول مرة أخرى.',
    en: 'This session has been ended. Please sign in again.',
  },
  OAUTH_TOKEN_INVALID: {
    ar: 'تعذر التحقق من تسجيل الدخول عبر الحساب الخارجي.',
    en: 'The sign-in token could not be verified.',
  },
  OAUTH_EMAIL_UNVERIFIED: {
    ar: 'البريد الإلكتروني في الحساب الخارجي غير مؤكد.',
    en: 'The email address of the external account is not verified.',
  },
  ADMIN_ROUTE_WITHOUT_PERMISSION: {
    ar: 'هذا المسار الإداري لا يحدد صلاحية مطلوبة، لذلك تم رفضه.',
    en: 'This admin route declares no required permission and was denied.',
  },
  LAST_OWNER: {
    ar: 'لا يمكن إزالة آخر مالك للنظام أو إيقافه.',
    en: 'The last owner cannot be removed or disabled.',
  },
  OWNER_ONLY: {
    ar: 'هذا الإجراء متاح للمالك فقط.',
    en: 'Only an owner can perform this action.',
  },
  CANNOT_TARGET_SELF: {
    ar: 'لا يمكنك تنفيذ هذا الإجراء على حسابك.',
    en: 'You cannot perform this action on your own account.',
  },
  UNKNOWN_ROLE: { ar: 'دور غير معروف.', en: 'Unknown role.' },
  UNKNOWN_PERMISSION: { ar: 'صلاحية غير معروفة.', en: 'Unknown permission.' },
  USER_NOT_FOUND: { ar: 'المستخدم غير موجود.', en: 'User not found.' },
  SESSION_NOT_FOUND: { ar: 'الجلسة غير موجودة.', en: 'Session not found.' },
  ROLE_NOT_FOUND: { ar: 'الدور غير موجود.', en: 'Role not found.' },
  ROLE_NOT_EDITABLE: {
    ar: 'صلاحيات دور المالك ثابتة (كل الصلاحيات).',
    en: 'The owner role always has every permission and cannot be edited.',
  },
  AUDIT_LOG_NOT_FOUND: { ar: 'سجل التدقيق غير موجود.', en: 'Audit log entry not found.' },
};

/** Builds an AppException for one of the auth error codes. */
export function authError(
  status: HttpStatus,
  code: AuthErrorCodeValue,
  details?: unknown,
  headers?: Record<string, string>,
): AppException {
  return new AppException({
    status,
    code,
    message: AUTH_ERROR_MESSAGES[code],
    details,
    headers,
  });
}

export const tokenExpired = (): AppException => AppException.unauthorized(ErrorCode.TOKEN_EXPIRED);
export const unauthorized = (): AppException => AppException.unauthorized(ErrorCode.UNAUTHORIZED);

/** 422 VALIDATION_FAILED with a single field error (maps onto client form fields). */
export function fieldError(
  field: string,
  constraint: string,
  message: LocalizedText,
  lang: 'ar' | 'en' = 'en',
): AppException {
  return AppException.validation([{ field, constraints: { [constraint]: message[lang] } }]);
}
