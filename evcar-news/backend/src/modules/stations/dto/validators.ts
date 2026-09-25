import { applyDecorators } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { localizedMessage } from '../../../common/validation/messages';
import { CODE_RE } from '../common/labels';

/** Query-string integer. */
export const QueryInt = (min: number, max: number) =>
  applyDecorators(
    IsOptional(),
    Type(() => Number),
    IsInt(),
    Min(min),
    Max(max),
  );

/** Query-string number (decimal). */
export const QueryNumber = (min: number, max: number) =>
  applyDecorators(
    IsOptional(),
    Type(() => Number),
    IsNumber({ allowNaN: false, allowInfinity: false }),
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

function splitList(value: unknown): unknown[] {
  const list: unknown[] = Array.isArray(value) ? (value as unknown[]) : [value];
  return [
    ...new Set(
      list
        .flatMap((v): unknown[] => (typeof v === 'string' ? v.split(',') : [v]))
        .map((v): unknown => (typeof v === 'string' ? v.trim() : v))
        .filter((v) => v !== ''),
    ),
  ];
}

/** Query-string comma list validated against fixed values. */
export const QueryList = (values: readonly string[], max = 20) =>
  applyDecorators(
    IsOptional(),
    Transform(({ value }: { value: unknown }) => splitList(value)),
    IsArray(),
    ArrayMaxSize(max),
    IsIn(values, { each: true }),
  );

const CODE_MESSAGE = localizedMessage({
  ar: 'رمز غير صالح (حروف إنجليزية صغيرة وأرقام و _).',
  en: 'Invalid code (lower-case letters, digits and _).',
});

/** Query-string comma list of reference codes (connector types, amenities…). */
export const QueryCodes = (max = 20) =>
  applyDecorators(
    IsOptional(),
    Transform(({ value }: { value: unknown }) => splitList(value)),
    IsArray(),
    ArrayMaxSize(max),
    IsString({ each: true }),
    Matches(CODE_RE, { each: true, context: CODE_MESSAGE }),
  );

const UUID_LIST_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Query-string comma list of UUIDs. */
export const QueryUuids = (max = 20) =>
  applyDecorators(
    IsOptional(),
    Transform(({ value }: { value: unknown }) => splitList(value)),
    IsArray(),
    ArrayMaxSize(max),
    IsString({ each: true }),
    Matches(UUID_LIST_RE, {
      each: true,
      context: localizedMessage({ ar: 'معرّف غير صالح.', en: 'Invalid id.' }),
    }),
  );

/** Body array of reference codes (amenities, payment / start methods). */
export const CodeArray = (max = 30) =>
  applyDecorators(
    IsArray(),
    ArrayMaxSize(max),
    IsString({ each: true }),
    Matches(CODE_RE, { each: true, context: CODE_MESSAGE }),
  );

/** Optional field whose column is nullable: undefined = keep, null = clear. */
export const Nullable = () =>
  applyDecorators(
    IsOptional(),
    ValidateIf((_o, v) => v !== null),
  );

/** Decimal amount as string (a JSON number is accepted). */
export const DecimalString = (maxIntDigits = 8, maxDecimals = 4) =>
  applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'number' && Number.isFinite(value) ? String(value) : value,
    ),
    IsString(),
    Matches(new RegExp(`^\\d{1,${maxIntDigits}}(\\.\\d{1,${maxDecimals}})?$`), {
      context: localizedMessage({
        ar: `يجب أن يكون رقمًا موجبًا بحد أقصى ${maxDecimals} منازل عشرية.`,
        en: `Must be a non-negative number with at most ${maxDecimals} decimals.`,
      }),
    }),
  );

export const HHMM_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
export const HHMM_END_RE = /^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$/;
export const HHMM_MESSAGE = localizedMessage({
  ar: 'الوقت بصيغة HH:MM.',
  en: 'Time must be HH:MM.',
});
