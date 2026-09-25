import type { ArgumentMetadata } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';
import { RequestContext } from '../context/request-context';
import { OptionalNotNull } from '../validation/decorators';
import { Type } from 'class-transformer';
import { AppException } from '../errors/app.exception';
import { createValidationPipe, stripGlobalQueryParams } from './validation.pipe';

class FilterQuery {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

class LocaleAwareQuery {
  @IsOptional()
  @IsIn(['ar', 'en'])
  lang?: string;
}

const query = (metatype: ArgumentMetadata['metatype']): ArgumentMetadata => ({
  type: 'query',
  metatype,
  data: undefined,
});

describe('AppValidationPipe', () => {
  const pipe = createValidationPipe();

  it('accepts ?lang and ?market on query DTOs that do not declare them', async () => {
    const out = (await pipe.transform(
      { q: 'x', page: '2', lang: 'en', market: 'EG' },
      query(FilterQuery),
    )) as FilterQuery;
    expect(out).toBeInstanceOf(FilterQuery);
    expect(out).toEqual({ q: 'x', page: 2 });
  });

  it('still rejects other unknown query params with 422', async () => {
    await expect(pipe.transform({ q: 'x', bogus: '1' }, query(FilterQuery))).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(pipe.transform({ bogus: '1' }, query(FilterQuery))).rejects.toBeInstanceOf(
      AppException,
    );
  });

  it('keeps and validates lang when the DTO declares it', async () => {
    const out = (await pipe.transform({ lang: 'en' }, query(LocaleAwareQuery))) as LocaleAwareQuery;
    expect(out.lang).toBe('en');
    await expect(pipe.transform({ lang: 'fr' }, query(LocaleAwareQuery))).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('does not touch bodies', async () => {
    await expect(
      pipe.transform({ q: 'x', lang: 'en' }, { type: 'body', metatype: FilterQuery }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('stripGlobalQueryParams returns the same object when nothing is stripped', () => {
    const input = { q: 'a' };
    expect(stripGlobalQueryParams(input, FilterQuery)).toBe(input);
    expect(stripGlobalQueryParams({ q: 'a', lang: 'ar' }, FilterQuery)).toEqual({ q: 'a' });
  });

  describe('translated field messages', () => {
    class MarketBody {
      @Matches(/^[A-Z]{2,8}$/)
      code!: string;

      @IsString()
      @Length(1, 100)
      nameEn!: string;

      @OptionalNotNull()
      @IsInt()
      @Min(0)
      sortOrder?: number;
    }
    const body: ArgumentMetadata = { type: 'body', metatype: MarketBody };

    async function detailsIn(lang: 'ar' | 'en', value: unknown) {
      try {
        await RequestContext.run({ requestId: 't', lang, market: 'EG' }, () =>
          pipe.transform(value, body),
        );
      } catch (err) {
        return (err as AppException).details as {
          field: string;
          constraints: Record<string, string>;
        }[];
      }
      throw new Error('expected a validation error');
    }

    it('answers in Arabic without regular expressions or English', async () => {
      const details = await detailsIn('ar', { code: 'eg1', nameEn: '', sortOrder: -1, x: 1 });
      const byField = Object.fromEntries(details.map((d) => [d.field, d.constraints]));
      expect(byField.code).toEqual({ matches: 'تنسيق القيمة غير صالح.' });
      expect(byField.nameEn).toEqual({ isLength: 'يجب أن يكون الطول بين 1 و100 حرفًا.' });
      expect(byField.sortOrder).toEqual({ min: 'يجب ألا تقل القيمة عن 0.' });
      expect(byField.x).toEqual({ whitelistValidation: 'هذا الحقل غير مسموح به.' });
      expect(JSON.stringify(details)).not.toMatch(/regular expression|\^\[A-Z\]|must /);
    });

    it('answers in English for English requests, keeping the constraint names', async () => {
      const details = await detailsIn('en', { code: 'eg1', nameEn: 'Egypt' });
      expect(details).toEqual([{ field: 'code', constraints: { matches: 'Invalid format.' } }]);
    });

    it('explicit null on an optional NOT NULL field is a 422, not a database error', async () => {
      const details = await detailsIn('en', { code: 'EG', nameEn: 'Egypt', sortOrder: null });
      expect(details).toHaveLength(1);
      expect(details[0]).toMatchObject({
        field: 'sortOrder',
        constraints: { isDefined: 'This field cannot be null.' },
      });
      // Omitting it is fine.
      await expect(pipe.transform({ code: 'EG', nameEn: 'Egypt' }, body)).resolves.toBeInstanceOf(
        MarketBody,
      );
    });
  });
});
