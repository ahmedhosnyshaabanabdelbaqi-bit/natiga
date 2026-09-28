import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { AppException } from '../../../common/errors/app.exception';
import { tr, type Bilingual } from '../../../common/validation/messages';

/**
 * Small HTTP helpers shared by the discovery modules (search, home,
 * favorites, encyclopedia, services-directory).
 */

export interface FieldProblem {
  field: string;
  rule: string;
  message: Bilingual;
}

/** 422 VALIDATION_FAILED in the global shape: details[{ field, constraints: { rule: message } }]. */
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

export function notFound(code: string, message: Bilingual): AppException {
  return new AppException({ status: HttpStatus.NOT_FOUND, code, message });
}

export function conflict(code: string, message: Bilingual, details?: unknown): AppException {
  return new AppException({ status: HttpStatus.CONFLICT, code, message, details });
}

/**
 * Public, shared-cacheable response. Express adds a strong ETag and answers
 * If-None-Match with 304 by itself; the body depends on language + market.
 */
export function setPublicCache(res: Response, maxAgeSeconds: number): void {
  res.setHeader(
    'Cache-Control',
    `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds * 5}`,
  );
  res.setHeader('Vary', 'Accept-Language, X-Market, Authorization');
}

/** Per-user / per-location response: revalidate every time (ETag still works). */
export function setPrivateRevalidate(res: Response): void {
  res.setHeader('Cache-Control', 'private, no-cache');
  res.setHeader('Vary', 'Accept-Language, X-Market, Authorization');
}

export function setNoStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
}
