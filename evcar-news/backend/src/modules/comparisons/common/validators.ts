/** Small decorator bundles for comparison / recommendation DTOs. */
import { applyDecorators } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { localizedMessage } from '../../../common/validation/messages';

/** Market code, upper-cased ("eg" → "EG"). */
export const MarketCode = () =>
  applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim().toUpperCase() : value,
    ),
    IsString(),
    Matches(/^[A-Z]{2,8}$/, {
      context: localizedMessage({
        ar: 'رمز السوق يتكون من 2 إلى 8 حروف لاتينية (مثل EG).',
        en: 'The market code is 2 to 8 latin letters (e.g. EG).',
      }),
    }),
  );

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
