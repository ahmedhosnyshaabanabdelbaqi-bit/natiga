import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches } from 'class-validator';

/**
 * `?lang` / `?market` are accepted on every route (contract §4.3) and
 * resolved by RequestContextMiddleware. Query DTOs must whitelist them,
 * otherwise forbidNonWhitelisted answers 422. Combine with
 * IntersectionType(PaginationQueryDto, LocaleQueryDto).
 */
export class LocaleQueryDto {
  @ApiPropertyOptional({ enum: ['ar', 'en'], description: 'Overrides Accept-Language.' })
  @IsOptional()
  @IsIn(['ar', 'en'])
  lang?: 'ar' | 'en';

  @ApiPropertyOptional({ example: 'EG', description: 'Overrides X-Market.' })
  @IsOptional()
  @Matches(/^[A-Za-z]{2,8}$/)
  market?: string;
}
