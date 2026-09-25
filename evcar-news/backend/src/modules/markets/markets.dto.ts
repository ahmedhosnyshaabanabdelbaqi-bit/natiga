import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { OptionalNotNull } from '../../common/validation/decorators';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export const MARKET_CODE_RE = /^[A-Z]{2,8}$/;
export const CURRENCY_CODE_RE = /^[A-Z]{3}$/;

export class CurrencyDto {
  @ApiProperty({ example: 'EGP' }) code!: string;
  @ApiProperty({ example: 'جنيه مصري' }) nameAr!: string;
  @ApiProperty({ example: 'Egyptian Pound' }) nameEn!: string;
  @ApiProperty({ nullable: true, type: String, example: 'ج.م' }) symbolAr!: string | null;
  @ApiProperty({ nullable: true, type: String, example: 'E£' }) symbolEn!: string | null;
  @ApiProperty({ example: 2 }) decimals!: number;
}

export class PublicCurrencyDto extends CurrencyDto {
  @ApiProperty({ description: 'Name in the request language.' }) name!: string;
  @ApiProperty({ nullable: true, type: String, description: 'Symbol in the request language.' })
  symbol!: string | null;
}

export class PublicMarketDto {
  @ApiProperty({ example: 'EG' }) code!: string;
  @ApiProperty({ description: 'Name in the request language.', example: 'مصر' }) name!: string;
  @ApiProperty({ example: 'مصر' }) nameAr!: string;
  @ApiProperty({ example: 'Egypt' }) nameEn!: string;
  @ApiProperty({ type: PublicCurrencyDto }) currency!: PublicCurrencyDto;
  @ApiProperty({ example: 'Africa/Cairo' }) timezone!: string;
  @ApiProperty({
    enum: ['ar', 'en'],
    description: 'Suggested language only — language and market are independent.',
  })
  defaultLanguage!: string;
  @ApiProperty({ enum: ['metric', 'imperial'] }) unitSystem!: string;
  @ApiProperty({ enum: ['lhd', 'rhd'] }) driveSide!: string;
  @ApiProperty() isDefault!: boolean;
  @ApiProperty() sortOrder!: number;
}

export class MarketUsageDto {
  @ApiProperty({ description: 'Rows referencing the market (deletion needs 0).' }) total!: number;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'integer' } })
  byRelation!: Record<string, number>;
}

export class AdminMarketDto {
  @ApiProperty({ example: 'EG' }) code!: string;
  @ApiProperty() nameAr!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty({ example: 'EGP' }) currencyCode!: string;
  @ApiProperty({ type: CurrencyDto }) currency!: CurrencyDto;
  @ApiProperty() timezone!: string;
  @ApiProperty({ enum: ['ar', 'en'] }) defaultLanguage!: string;
  @ApiProperty({ enum: ['metric', 'imperial'] }) unitSystem!: string;
  @ApiProperty({ enum: ['lhd', 'rhd'] }) driveSide!: string;
  @ApiProperty() enabled!: boolean;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isDefault!: boolean;
  @ApiPropertyOptional({ type: MarketUsageDto }) usage?: MarketUsageDto;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class CreateMarketDto {
  @ApiProperty({
    example: 'KW',
    description: 'ISO-3166 alpha-2 recommended (2–8 upper-case letters).',
  })
  @Matches(MARKET_CODE_RE)
  code!: string;

  @ApiProperty({ example: 'الكويت' })
  @IsString()
  @Length(1, 100)
  nameAr!: string;

  @ApiProperty({ example: 'Kuwait' })
  @IsString()
  @Length(1, 100)
  nameEn!: string;

  @ApiProperty({ example: 'KWD', description: 'Must exist in /admin/currencies.' })
  @Matches(CURRENCY_CODE_RE)
  currencyCode!: string;

  @ApiProperty({ example: 'Asia/Kuwait', description: 'IANA time zone.' })
  @IsString()
  @MaxLength(64)
  timezone!: string;

  @ApiPropertyOptional({ enum: ['ar', 'en'], default: 'ar' })
  @OptionalNotNull()
  @IsIn(['ar', 'en'])
  defaultLanguage?: 'ar' | 'en';

  @ApiPropertyOptional({ enum: ['metric', 'imperial'], default: 'metric' })
  @OptionalNotNull()
  @IsIn(['metric', 'imperial'])
  unitSystem?: 'metric' | 'imperial';

  @ApiPropertyOptional({ enum: ['lhd', 'rhd'], default: 'lhd' })
  @OptionalNotNull()
  @IsIn(['lhd', 'rhd'])
  driveSide?: 'lhd' | 'rhd';

  @ApiPropertyOptional({
    default: false,
    description: 'New markets start disabled until their data is ready.',
  })
  @OptionalNotNull()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ default: 100 })
  @OptionalNotNull()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;
}

/** Every field optional; an explicit null is a 422 (all market columns are NOT NULL). */
export class UpdateMarketDto extends PartialType(CreateMarketDto, { skipNullProperties: false }) {}

export class CreateCurrencyDto {
  @ApiProperty({ example: 'KWD', description: 'ISO-4217 code.' })
  @Matches(CURRENCY_CODE_RE)
  code!: string;

  @ApiProperty({ example: 'دينار كويتي' })
  @IsString()
  @Length(1, 100)
  nameAr!: string;

  @ApiProperty({ example: 'Kuwaiti Dinar' })
  @IsString()
  @Length(1, 100)
  nameEn!: string;

  @ApiPropertyOptional({ nullable: true, type: String, example: 'د.ك' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Length(1, 16)
  symbolAr?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, example: 'KD' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Length(1, 16)
  symbolEn?: string | null;

  @ApiPropertyOptional({ default: 2, minimum: 0, maximum: 4 })
  @OptionalNotNull()
  @IsInt()
  @Min(0)
  @Max(4)
  decimals?: number;
}

/** Every field optional; null only where the column is nullable (symbols). */
export class UpdateCurrencyDto extends PartialType(CreateCurrencyDto, {
  skipNullProperties: false,
}) {}
