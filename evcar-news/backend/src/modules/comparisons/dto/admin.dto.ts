import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination';
import { CleanText, OptionalNotNull } from '../../../common/validation/decorators';
import { MarketCode, QueryInt } from '../common/validators';
import { ComparisonDto, ComparisonItemInputDto, MAX_ITEMS, MIN_ITEMS } from './comparison.dto';

/** Curated comparisons use the catalog workflow subset. */
export const CURATED_STATUSES = ['draft', 'published', 'archived'] as const;
export type CuratedStatus = (typeof CURATED_STATUSES)[number];

export class CreateCuratedComparisonDto {
  @ApiProperty({ type: [ComparisonItemInputDto], minItems: MIN_ITEMS, maxItems: MAX_ITEMS })
  @IsArray()
  @ArrayMinSize(MIN_ITEMS)
  @ArrayMaxSize(MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ComparisonItemInputDto)
  items!: ComparisonItemInputDto[];

  @ApiProperty({ example: 'EG', description: 'Market whose home page shows it.' })
  @MarketCode()
  marketCode!: string;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 200 })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(200)
  titleAr?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 200 })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(200)
  titleEn?: string | null;

  @ApiPropertyOptional({ enum: CURATED_STATUSES, default: 'draft' })
  @OptionalNotNull()
  @IsIn(CURATED_STATUSES)
  status?: CuratedStatus;

  @ApiPropertyOptional({ nullable: true, type: Number, description: 'Home order (ascending).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  order?: number | null;
}

export class UpdateCuratedComparisonDto {
  @ApiPropertyOptional({ type: [ComparisonItemInputDto], minItems: MIN_ITEMS, maxItems: MAX_ITEMS })
  @OptionalNotNull()
  @IsArray()
  @ArrayMinSize(MIN_ITEMS)
  @ArrayMaxSize(MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ComparisonItemInputDto)
  items?: ComparisonItemInputDto[];

  @ApiPropertyOptional({ example: 'EG' })
  @OptionalNotNull()
  @MarketCode()
  marketCode?: string;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 200 })
  @ValidateIf((_o: unknown, v: unknown) => v !== null && v !== undefined)
  @CleanText()
  @IsString()
  @MaxLength(200)
  titleAr?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 200 })
  @ValidateIf((_o: unknown, v: unknown) => v !== null && v !== undefined)
  @CleanText()
  @IsString()
  @MaxLength(200)
  titleEn?: string | null;

  @ApiPropertyOptional({ enum: CURATED_STATUSES })
  @OptionalNotNull()
  @IsIn(CURATED_STATUSES)
  status?: CuratedStatus;

  @ApiPropertyOptional({ nullable: true, type: Number })
  @ValidateIf((_o: unknown, v: unknown) => v !== null && v !== undefined)
  @IsInt()
  @Min(0)
  @Max(100000)
  order?: number | null;
}

export class AdminComparisonListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CURATED_STATUSES })
  @IsOptional()
  @IsIn(CURATED_STATUSES)
  status?: CuratedStatus;

  @ApiPropertyOptional({ example: 'EG' })
  @IsOptional()
  @MarketCode()
  marketCode?: string;
}

export class MostComparedQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 365, default: 30, description: 'Last N days (UTC).' })
  @QueryInt(1, 365)
  days?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @QueryInt(1, 100)
  limit?: number;
}

export class AdminComparisonDto extends ComparisonDto {
  @ApiProperty({ nullable: true, type: String }) titleAr!: string | null;
  @ApiProperty({ nullable: true, type: String }) titleEn!: string | null;
  @ApiProperty({ enum: CURATED_STATUSES }) status!: string;
  @ApiProperty({ nullable: true, type: Number }) order!: number | null;
  @ApiProperty() viewCount!: number;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) lastViewedAt!: string | null;
}

export class MostComparedItemDto {
  @ApiProperty({ format: 'uuid' }) variantId!: string;
  @ApiProperty({ nullable: true, type: String }) title!: string | null;
  @ApiProperty({ nullable: true, type: String }) powertrainType!: string | null;
  @ApiProperty({ nullable: true, type: Number }) modelYear!: number | null;
  @ApiProperty() published!: boolean;
  @ApiProperty({ description: 'Comparisons containing this trim in the period.' })
  comparisons!: number;
}
