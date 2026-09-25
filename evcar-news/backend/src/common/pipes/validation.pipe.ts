import { ValidationPipe, type ArgumentMetadata, type ValidationError } from '@nestjs/common';
import { getMetadataStorage } from 'class-validator';
import type { SupportedLanguage } from '../../config/app-config';
import { AppException } from '../errors/app.exception';
import { localizeConstraint, requestLang } from '../validation/messages';

export interface FieldError {
  /** Dotted path, e.g. "items.0.name". */
  field: string;
  /** constraint name → message, e.g. { isEmail: "email must be an email" } */
  constraints: Record<string, string>;
}

/**
 * Flattens class-validator errors into `details` entries. Messages are
 * translated into the request language (never raw English / regular
 * expressions); the constraint NAMES stay stable for clients that map them
 * to their own texts.
 */
export function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
  lang: SupportedLanguage = requestLang(),
): FieldError[] {
  const out: FieldError[] = [];
  for (const err of errors) {
    const field = parent ? `${parent}.${err.property}` : err.property;
    if (err.constraints && Object.keys(err.constraints).length > 0) {
      const constraints: Record<string, string> = {};
      for (const name of Object.keys(err.constraints)) {
        constraints[name] = localizeConstraint(err, name, lang);
      }
      out.push({ field, constraints });
    }
    if (err.children?.length) out.push(...flattenValidationErrors(err.children, field, lang));
  }
  return out;
}

/**
 * Query parameters that are valid on EVERY route (contract §4.3: `?lang`
 * overrides Accept-Language, `?market` overrides X-Market). They are resolved
 * by RequestContextMiddleware before any pipe runs, so a query DTO does not
 * need to declare them.
 */
export const GLOBAL_QUERY_PARAMS: readonly string[] = ['lang', 'market'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/** Property names that carry class-validator metadata (= whitelisted) on a DTO class. */
function declaredProperties(metatype: abstract new (...args: never[]) => unknown): Set<string> {
  const metas = getMetadataStorage().getTargetValidationMetadatas(metatype, '', true, false);
  return new Set(metas.map((m) => m.propertyName));
}

/**
 * Removes the global query params from a query payload when the DTO does not
 * declare them itself, so `forbidNonWhitelisted` does not answer 422 for
 * `?lang=en` on a route whose DTO only lists its own filters. DTOs that do
 * declare them (e.g. LocaleQueryDto) still receive and validate them.
 */
export function stripGlobalQueryParams(
  query: Record<string, unknown>,
  metatype: abstract new (...args: never[]) => unknown,
): Record<string, unknown> {
  const present = GLOBAL_QUERY_PARAMS.filter((key) => key in query);
  if (present.length === 0) return query;
  const declared = declaredProperties(metatype);
  const copy: Record<string, unknown> = { ...query };
  for (const key of present) if (!declared.has(key)) delete copy[key];
  return copy;
}

const PRIMITIVE_METATYPES = new Set<unknown>([String, Boolean, Number, Array, Object]);

/**
 * Global validation: strips nothing silently — unknown fields are rejected
 * (whitelist + forbidNonWhitelisted), payloads are transformed to DTO
 * instances, and failures return 422 VALIDATION_FAILED with
 * details = FieldError[]. The only exception is GLOBAL_QUERY_PARAMS on
 * whole-object `@Query()` DTOs (see stripGlobalQueryParams).
 */
export class AppValidationPipe extends ValidationPipe {
  override async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    const { type, data, metatype } = metadata;
    if (
      type === 'query' &&
      data === undefined &&
      typeof metatype === 'function' &&
      !PRIMITIVE_METATYPES.has(metatype) &&
      isPlainObject(value)
    ) {
      return super.transform(
        stripGlobalQueryParams(value, metatype as abstract new (...args: never[]) => unknown),
        metadata,
      );
    }
    return super.transform(value, metadata);
  }
}

export function createValidationPipe(): ValidationPipe {
  return new AppValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    // The target is needed to read constraint arguments for translated
    // messages; it never leaves the exception factory (details only carry
    // field names and messages).
    validationError: { target: true, value: false },
    stopAtFirstError: false,
    exceptionFactory: (errors: ValidationError[]) =>
      AppException.validation(flattenValidationErrors(errors)),
  });
}
