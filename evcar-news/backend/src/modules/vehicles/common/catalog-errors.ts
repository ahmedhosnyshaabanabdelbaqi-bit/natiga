/**
 * Localized errors of the vehicle catalog (ar/en). Field errors use the same
 * `details` shape as the global validation pipe:
 *   422 VALIDATION_FAILED, details: [{ field, constraints: { <rule>: <message> } }]
 */
import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { tr, type Bilingual } from '../../../common/validation/messages';

export interface FieldProblem {
  field: string;
  rule: string;
  message: Bilingual;
}

/** 422 VALIDATION_FAILED with one or more translated field errors. */
export function fieldErrors(problems: FieldProblem[]): AppException {
  const byField = new Map<string, Record<string, string>>();
  for (const p of problems) {
    const c = byField.get(p.field) ?? {};
    c[p.rule] = tr(p.message);
    byField.set(p.field, c);
  }
  return AppException.validation(
    [...byField.entries()].map(([field, constraints]) => ({ field, constraints })),
  );
}

export function fieldError(field: string, rule: string, message: Bilingual): AppException {
  return fieldErrors([{ field, rule, message }]);
}

function err(
  status: HttpStatus,
  code: string,
  message: Bilingual,
  details?: unknown,
): AppException {
  return new AppException({ status, code, message, details });
}

export const CatalogErrors = {
  notFound: (what?: string) =>
    new AppException({
      status: HttpStatus.NOT_FOUND,
      code: ErrorCode.NOT_FOUND,
      details: what ? { entity: what } : undefined,
    }),

  slugTaken: (slug: string) =>
    err(
      HttpStatus.CONFLICT,
      'SLUG_TAKEN',
      {
        ar: `المعرّف النصي (slug) "${slug}" مستخدم بالفعل.`,
        en: `The slug "${slug}" is already in use.`,
      },
      { slug },
    ),

  exists: (entity: string, details?: unknown) =>
    err(
      HttpStatus.CONFLICT,
      'ALREADY_EXISTS',
      { ar: 'يوجد عنصر مطابق بالفعل.', en: 'A matching record already exists.' },
      { entity, ...(details && typeof details === 'object' ? details : {}) },
    ),

  inUse: (entity: string, counts: Record<string, number>) =>
    err(
      HttpStatus.CONFLICT,
      'IN_USE',
      {
        ar: 'لا يمكن الحذف لأن العنصر مستخدم في بيانات أخرى. أرشفه أو أزل الارتباطات أولًا.',
        en: 'This record is still used by other data. Archive it or remove the references first.',
      },
      { entity, counts },
    ),

  publishPermission: () =>
    err(HttpStatus.FORBIDDEN, 'PUBLISH_PERMISSION_REQUIRED', {
      ar: 'تغيير حالة النشر يتطلب صلاحية نشر عناصر الدليل (vehicles.publish).',
      en: 'Changing the publication status requires the vehicles.publish permission.',
    }),

  verifyPermission: () =>
    err(HttpStatus.FORBIDDEN, 'VERIFY_PERMISSION_REQUIRED', {
      ar: 'توثيق البيانات (حالة "موثّق" أو تاريخ التحقق) يتطلب صلاحية specs.verify.',
      en: 'Marking data as verified (reliability "verified" or a verification date) requires the specs.verify permission.',
    }),

  permission: (permission: string) =>
    err(
      HttpStatus.FORBIDDEN,
      ErrorCode.FORBIDDEN,
      {
        ar: `هذا الإجراء يتطلب صلاحية ${permission}.`,
        en: `This action requires the ${permission} permission.`,
      },
      { permission },
    ),

  deleted: (entity: string) =>
    err(
      HttpStatus.CONFLICT,
      'ENTITY_DELETED',
      {
        ar: 'العنصر محذوف. استعده أولًا.',
        en: 'This record is deleted. Restore it first.',
      },
      { entity },
    ),

  notApplicable: (reason: string, message: Bilingual) =>
    err(HttpStatus.UNPROCESSABLE_ENTITY, 'NOT_APPLICABLE_TO_POWERTRAIN', message, { reason }),

  pricePeriodOverlap: (details: unknown) =>
    err(
      HttpStatus.CONFLICT,
      'PRICE_PERIOD_OVERLAP',
      {
        ar: 'تتداخل فترة هذا السعر الرسمي مع سعر رسمي آخر لنفس الفئة في نفس السوق.',
        en: 'This official price period overlaps another official price of the same variant in the same market.',
      },
      details,
    ),

  importJobState: (message: Bilingual, details?: unknown) =>
    err(HttpStatus.CONFLICT, 'IMPORT_JOB_STATE', message, details),

  csvInvalid: (message: Bilingual, details?: unknown) =>
    err(HttpStatus.UNPROCESSABLE_ENTITY, 'CSV_INVALID', message, details),
};

/** Messages reused by several validators. */
export const Msg = {
  required: { ar: 'هذا الحقل مطلوب.', en: 'This field is required.' },
  unknownSource: { ar: 'المصدر غير موجود.', en: 'Unknown source.' },
  unknownMarket: { ar: 'السوق غير موجود.', en: 'Unknown market.' },
  unknownCurrency: { ar: 'العملة غير موجودة.', en: 'Unknown currency.' },
  futureDate: {
    ar: 'لا يمكن أن يكون التاريخ في المستقبل.',
    en: 'The date cannot be in the future.',
  },
  verifiedNeedsSource: {
    ar: 'لا يمكن توثيق قيمة بلا مصدر. اختر المصدر أولًا.',
    en: 'A value cannot be marked verified without a source.',
  },
  positive: { ar: 'يجب أن تكون القيمة أكبر من صفر.', en: 'Must be greater than zero.' },
  nonNegative: { ar: 'لا يمكن أن تكون القيمة سالبة.', en: 'Cannot be negative.' },
} satisfies Record<string, Bilingual>;
