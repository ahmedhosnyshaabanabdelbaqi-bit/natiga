import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsDefined, ValidateIf, type ValidationOptions } from 'class-validator';

/**
 * Normalises free text: removes control characters (including NUL, which
 * PostgreSQL rejects in text), zero-width and bidi override characters,
 * collapses whitespace and trims. Use it on every free-text body field and
 * query parameter (search boxes, filters).
 */
export const CleanText = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          // eslint-disable-next-line no-control-regex
          .replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
      : value,
  );

/**
 * For optional fields whose column is NOT NULL: the field may be omitted,
 * but an explicit `null` is a 422 (instead of reaching the database and
 * failing with a 500). `@IsOptional()` would let null through.
 * Fields that really accept null keep `@IsOptional()` + `@ValidateIf(v => v !== null)`.
 */
export function OptionalNotNull(options?: ValidationOptions): PropertyDecorator {
  return applyDecorators(
    ValidateIf((_obj: unknown, value: unknown) => value !== undefined, options),
    IsDefined({ message: '$property must not be null', ...options }),
  );
}
