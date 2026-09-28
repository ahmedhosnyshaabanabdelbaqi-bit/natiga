import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { tr, type Bilingual } from '../../../common/validation/messages';

/**
 * Localized errors shared by the personal-data modules (garage, charging
 * logs, reminders, calculators, notifications, trips). Field errors use the
 * global validation shape:
 *   422 VALIDATION_FAILED, details: [{ field, constraints: { <rule>: <message> } }]
 */
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

export function fieldError(field: string, rule: string, message: Bilingual): AppException {
  return fieldErrors([{ field, rule, message }]);
}

/** 404 with `details.entity` (never reveals whether another user's row exists). */
export function notFound(entity: string): AppException {
  return new AppException({
    status: HttpStatus.NOT_FOUND,
    code: ErrorCode.NOT_FOUND,
    details: { entity },
  });
}

export function appError(
  status: HttpStatus,
  code: string,
  message: Bilingual,
  details?: unknown,
): AppException {
  return new AppException({ status, code, message, details });
}

export const VEHICLE_NOT_FOUND = (field: string) =>
  fieldError(field, 'exists', {
    ar: 'السيارة غير موجودة أو غير متاحة.',
    en: 'The vehicle does not exist or is not available.',
  });
