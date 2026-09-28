import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { localizedMessage } from '../../../common/validation/messages';
import { cleanMultiline } from '../common/community-rules';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_MESSAGE = localizedMessage({ ar: 'معرّف غير صالح.', en: 'Invalid id.' });

/** A UUID string field (body or query). */
export const IsUuidField = () =>
  applyDecorators(IsString(), Matches(UUID_RE, { context: UUID_MESSAGE }));

/** Multi-line user text (keeps line breaks, strips control characters). */
export const CleanMultiline = () =>
  Transform(({ value }: { value: unknown }) => cleanMultiline(value));

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
