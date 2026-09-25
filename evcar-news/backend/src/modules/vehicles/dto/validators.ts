/**
 * Decorator bundles for catalog DTOs (keep request validation uniform).
 */
import { applyDecorators } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CleanText, OptionalNotNull } from '../../../common/validation/decorators';
import { localizedMessage } from '../../../common/validation/messages';
import { SLUG_MAX, SLUG_RE } from '../common/catalog-constants';

/** Keeps line breaks, removes control / bidi-override characters, trims. */
export const CleanMultiline = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .replace(/\r\n?/g, '\n')
          // eslint-disable-next-line no-control-regex
          .replace(/[\u0000-\u0009\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
          .trim()
      : value,
  );

const SLUG_MESSAGE = localizedMessage({
  ar: 'المعرّف النصي يجب أن يتكون من حروف لاتينية صغيرة وأرقام وشرطات فقط.',
  en: 'The slug may only contain lower-case latin letters, digits and dashes.',
});

/** Optional explicit slug (generated from the English name when omitted). */
export const OptionalSlug = () =>
  applyDecorators(
    OptionalNotNull(),
    IsString(),
    MaxLength(SLUG_MAX),
    Matches(SLUG_RE, { context: SLUG_MESSAGE }),
  );

/** Required single-line text. */
export const RequiredText = (max: number) =>
  applyDecorators(CleanText(), IsString(), Length(1, max));

/** Optional single-line text that may not be null. */
export const OptionalText = (max: number) =>
  applyDecorators(OptionalNotNull(), CleanText(), IsString(), Length(1, max));

/** Optional nullable single-line text ("" is stored as null). */
export const NullableText = (max: number) =>
  applyDecorators(IsOptional(), CleanText(), IsString(), MaxLength(max));

/** Optional nullable multi-line text ("" is stored as null). */
export const NullableMultiline = (max: number) =>
  applyDecorators(IsOptional(), CleanMultiline(), IsString(), MaxLength(max));

export const NullableUuid = () => applyDecorators(IsOptional(), IsUUID());
export const RequiredUuid = () => applyDecorators(IsUUID());

export const OptionalEnum = (values: readonly string[]) =>
  applyDecorators(OptionalNotNull(), IsIn(values));
export const NullableEnum = (values: readonly string[]) =>
  applyDecorators(IsOptional(), IsIn(values));

export const OptionalInt = (min: number, max: number) =>
  applyDecorators(OptionalNotNull(), IsInt(), Min(min), Max(max));
export const NullableInt = (min: number, max: number) =>
  applyDecorators(IsOptional(), IsInt(), Min(min), Max(max));

/** Finite JSON number (no NaN/Infinity). */
export const FiniteNumber = () =>
  IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 6 });

export const NullableNumber = (min?: number, max?: number) =>
  applyDecorators(
    IsOptional(),
    FiniteNumber(),
    ...(min !== undefined ? [Min(min)] : []),
    ...(max !== undefined ? [Max(max)] : []),
  );

export const OptionalBool = () => applyDecorators(OptionalNotNull(), IsBoolean());
export const NullableBool = () => applyDecorators(IsOptional(), IsBoolean());

const DATE_MESSAGE = localizedMessage({
  ar: 'التاريخ يجب أن يكون بصيغة YYYY-MM-DD.',
  en: 'The date must use the format YYYY-MM-DD.',
});

/** Calendar date "YYYY-MM-DD". */
export const DateOnly = () =>
  applyDecorators(
    IsString(),
    Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, { context: DATE_MESSAGE }),
  );
export const NullableDateOnly = () => applyDecorators(IsOptional(), DateOnly());

export const NullableTimestamp = () => applyDecorators(IsOptional(), IsISO8601({ strict: true }));

/** Query-string integer. */
export const QueryInt = (min: number, max: number) =>
  applyDecorators(
    IsOptional(),
    Type(() => Number),
    IsInt(),
    Min(min),
    Max(max),
  );

/** Query-string boolean ("true" / "false" / "1" / "0"). */
export const QueryBool = () =>
  applyDecorators(
    IsOptional(),
    Transform(({ value }: { value: unknown }) =>
      value === 'true' || value === '1' || value === true
        ? true
        : value === 'false' || value === '0' || value === false
          ? false
          : value,
    ),
    IsBoolean(),
  );

/** Query-string comma list ("BEV,PHEV") → string[] validated against `values`. */
export const QueryList = (values: readonly string[]) =>
  applyDecorators(
    IsOptional(),
    Transform(({ value }: { value: unknown }): unknown[] => {
      const list: unknown[] = Array.isArray(value) ? (value as unknown[]) : [value];
      return list
        .flatMap((v): unknown[] => (typeof v === 'string' ? v.split(',') : [v]))
        .map((v): unknown => (typeof v === 'string' ? v.trim() : v))
        .filter((v) => v !== '');
    }),
    IsIn(values, { each: true }),
  );

/** Money amount as a decimal string (a JSON number is accepted and converted). */
export const MoneyAmount = () =>
  applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'number' && Number.isFinite(value) ? String(value) : value,
    ),
    IsString(),
    Matches(/^\d{1,12}(\.\d{1,2})?$/, {
      context: localizedMessage({
        ar: 'المبلغ يجب أن يكون رقمًا موجبًا بحد أقصى منزلتين عشريتين.',
        en: 'The amount must be a positive number with at most 2 decimals.',
      }),
    }),
  );
