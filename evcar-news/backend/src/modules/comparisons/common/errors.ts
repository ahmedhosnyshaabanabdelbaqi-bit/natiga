/**
 * Localized errors of the comparisons / recommendations modules. Field errors
 * use the global validation shape:
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

export const ITEM_MESSAGES = {
  duplicate: {
    ar: 'هذه الفئة مضافة بالفعل لنفس السوق في المقارنة.',
    en: 'This trim is already in the comparison for the same market.',
  },
  yearRequired: {
    ar: 'اختر سنة الموديل (modelYearId أو modelYear).',
    en: 'Choose the model year (modelYearId or modelYear).',
  },
  yearMismatch: {
    ar: 'سنة الموديل لا تطابق الفئة المختارة.',
    en: 'The model year does not match the chosen trim.',
  },
  unknownMarket: { ar: 'السوق غير معروف أو غير مفعّل.', en: 'Unknown or disabled market.' },
  variantNotFound: {
    ar: 'الفئة غير موجودة أو غير منشورة.',
    en: 'The trim does not exist or is not published.',
  },
  notInMarket: {
    ar: 'لا يوجد سجل لهذه الفئة في السوق المختار.',
    en: 'This trim has no record in the chosen market.',
  },
  titlesRequired: {
    ar: 'نشر مقارنة مختارة يتطلب عنوانًا بالعربية والإنجليزية.',
    en: 'Publishing a featured comparison needs an Arabic and an English title.',
  },
} satisfies Record<string, Bilingual>;

export const ComparisonErrors = {
  notFound: () => new AppException({ status: HttpStatus.NOT_FOUND, code: ErrorCode.NOT_FOUND }),
  limitReached: (limit: number) =>
    new AppException({
      status: HttpStatus.CONFLICT,
      code: 'COMPARISON_LIMIT_REACHED',
      message: {
        ar: `وصلت إلى الحد الأقصى للمقارنات المحفوظة (${limit}). احذف مقارنة قديمة أولًا.`,
        en: `You reached the maximum of ${limit} saved comparisons. Delete an old one first.`,
      },
      details: { limit },
    }),
};
