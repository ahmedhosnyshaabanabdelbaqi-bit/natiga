/**
 * Request / response shapes of the comparisons API (REQUIREMENTS §7).
 * Missing values are `null` (clients show "غير متوفر / Not available"),
 * never 0.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination';
import { CleanText } from '../../../common/validation/decorators';
import { BrandRefDto, ModelRefDto } from '../../vehicles/dto/public.dto';
import { ImageDto, PriceDto, SourceSummaryDto } from '../../vehicles/dto/shared.dto';
import { MarketCode, QueryBool } from '../common/validators';
import { COMPARABILITY, METRIC_GROUPS, OUTCOMES } from '../engine/types';

export const MIN_ITEMS = 2;
export const MAX_ITEMS = 4;
export const VIEWS = ['summary', 'detailed'] as const;
export type ComparisonView = (typeof VIEWS)[number];

// --- requests -----------------------------------------------------------------------------

/**
 * One car of a comparison: a trim (variant) of a model year in a market.
 * Year, trim and market are all mandatory (§7): send `modelYearId` (picker
 * year level) or `modelYear` (the year number); it must match the trim.
 */
export class ComparisonItemInputDto {
  @ApiProperty({ format: 'uuid', description: 'Variant (trim) id.' })
  @IsUUID()
  variantId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Model year id (or send modelYear).' })
  @IsOptional()
  @IsUUID()
  modelYearId?: string;

  @ApiPropertyOptional({ example: 2025, description: 'Model year number (or send modelYearId).' })
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  modelYear?: number;

  @ApiProperty({
    example: 'EG',
    description: 'Market whose price, availability and inlets are used.',
  })
  @MarketCode()
  market!: string;
}

export class ComparisonItemsDto {
  @ApiProperty({ type: [ComparisonItemInputDto], minItems: MIN_ITEMS, maxItems: MAX_ITEMS })
  @IsArray()
  @ArrayMinSize(MIN_ITEMS)
  @ArrayMaxSize(MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ComparisonItemInputDto)
  items!: ComparisonItemInputDto[];
}

export class ComputeComparisonDto extends ComparisonItemsDto {
  @ApiPropertyOptional({
    enum: VIEWS,
    default: 'detailed',
    description: 'summary = key rows only; detailed = every row.',
  })
  @IsOptional()
  @IsIn(VIEWS)
  view?: ComparisonView;

  @ApiPropertyOptional({
    default: false,
    description:
      'Drop rows where every car shows the same value (every row also carries isDifferent).',
  })
  @IsOptional()
  @IsBoolean()
  differencesOnly?: boolean;
}

export class CreateComparisonDto extends ComparisonItemsDto {
  @ApiPropertyOptional({
    maxLength: 200,
    description: 'Your own label (signed-in users only; ignored for guest share links).',
  })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(200)
  title?: string;
}

export class UpdateMyComparisonDto {
  @ApiProperty({ nullable: true, type: String, maxLength: 200 })
  @ValidateIf((_o: unknown, v: unknown) => v !== null)
  @CleanText()
  @IsString()
  @MaxLength(200)
  title!: string | null;
}

export class ComparisonViewQueryDto {
  @ApiPropertyOptional({ enum: VIEWS, default: 'detailed' })
  @IsOptional()
  @IsIn(VIEWS)
  view?: ComparisonView;

  @ApiPropertyOptional({ default: false })
  @QueryBool()
  differencesOnly?: boolean;
}

export class MyComparisonsQueryDto extends PaginationQueryDto {}

export class FeaturedQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

// --- result -------------------------------------------------------------------------------

export class MetricConditionDto {
  @ApiPropertyOptional({ nullable: true, type: String, example: 'WLTP' }) cycle?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) cycleNote?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, enum: ['electric', 'total'] })
  rangeType?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, example: 'combined' }) mode?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, enum: ['AC', 'DC'] })
  currentType?: string | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) fromSoc?: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) toSoc?: number | null;
  @ApiPropertyOptional({ nullable: true, type: String, example: '10–80%' })
  socWindow?: string | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) chargerPowerKw?: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) wheelSizeInch?: number | null;
  @ApiPropertyOptional({ nullable: true, type: String }) conditions?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) priceType?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) priceTypeLabel?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, example: 'EGP' }) currency?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' })
  effectiveFrom?: string | null;
  @ApiPropertyOptional({ nullable: true, type: Boolean }) inMarketCurrency?: boolean | null;
}

export class AlternativeValueDto {
  @ApiProperty({ oneOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }] })
  value!: number | string | boolean;
  @ApiProperty({ nullable: true, type: String }) unit!: string | null;
  @ApiProperty({ nullable: true, type: String }) originalValue!: string | null;
  @ApiProperty({ nullable: true, type: String }) originalUnit!: string | null;
  @ApiProperty({ nullable: true, type: MetricConditionDto }) condition!: MetricConditionDto | null;
  @ApiProperty({ nullable: true, type: String }) reliability!: string | null;
}

export class MetricValueDto {
  @ApiProperty({ example: '0190…@EG' }) carKey!: string;
  @ApiProperty({ enum: ['present', 'missing', 'not_applicable'] }) status!: string;
  @ApiProperty({
    nullable: true,
    oneOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }],
    description:
      'Canonical value (number in `unit`, text, boolean, or a decimal string for money). null = Not available.',
  })
  value!: number | string | boolean | null;
  @ApiProperty({ nullable: true, type: String, description: 'Localized label of a coded value.' })
  valueLabel!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Canonical unit (currency for money).',
  })
  unit!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Value as published.' })
  originalValue!: string | null;
  @ApiProperty({ nullable: true, type: String }) originalUnit!: string | null;
  @ApiProperty({ nullable: true, type: MetricConditionDto }) condition!: MetricConditionDto | null;
  @ApiProperty({ nullable: true, type: String }) reliability!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) verifiedAt!: string | null;
  @ApiProperty({ nullable: true, type: SourceSummaryDto }) source!: SourceSummaryDto | null;
  @ApiProperty() derived!: boolean;
  @ApiProperty({ nullable: true, type: String }) note!: string | null;
  @ApiProperty({ type: [AlternativeValueDto] }) alternatives!: AlternativeValueDto[];
}

export class MetricDto {
  @ApiProperty({ example: 'range.electric' }) key!: string;
  @ApiProperty({ enum: METRIC_GROUPS }) group!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ enum: ['number', 'text', 'boolean', 'money'] }) kind!: string;
  @ApiProperty({ nullable: true, type: String }) unit!: string | null;
  @ApiProperty({ enum: ['higher', 'lower', 'none'] }) betterDirection!: string;
  @ApiProperty({ enum: COMPARABILITY }) comparability!: string;
  @ApiProperty({ nullable: true, type: String }) comparabilityNote!: string | null;
  @ApiProperty({ nullable: true, type: MetricConditionDto }) basis!: MetricConditionDto | null;
  @ApiProperty({ enum: OUTCOMES }) outcome!: string;
  @ApiProperty({ type: [String] }) winners!: string[];
  @ApiProperty() isDifferent!: boolean;
  @ApiProperty() isKey!: boolean;
  @ApiProperty({ type: [MetricValueDto] }) values!: MetricValueDto[];
}

export class MetricGroupDto {
  @ApiProperty({ enum: METRIC_GROUPS }) key!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ type: [MetricDto] }) metrics!: MetricDto[];
}

export class CarWinsDto {
  @ApiProperty() carKey!: string;
  @ApiProperty() wins!: number;
}

export class ComparisonSummaryDto {
  @ApiProperty() metricsTotal!: number;
  @ApiProperty() comparableMetrics!: number;
  @ApiProperty() decidedMetrics!: number;
  @ApiProperty() notComparableMetrics!: number;
  @ApiProperty() missingDataMetrics!: number;
  @ApiProperty() notApplicableMetrics!: number;
  @ApiProperty({ type: [CarWinsDto], description: 'Rows won per car — not a weighted verdict.' })
  winsByCar!: CarWinsDto[];
  @ApiProperty() note!: string;
}

export class CarMarketDto {
  @ApiProperty({ example: 'EG' }) code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ example: 'EGP' }) currencyCode!: string;
  @ApiProperty({ example: 'available' }) availability!: string;
  @ApiProperty({ description: 'Listed (available / coming soon) in this market.' })
  offered!: boolean;
  @ApiProperty({ nullable: true, type: String }) localName!: string | null;
}

export class ComparisonCarDto {
  @ApiProperty({ description: '"variantId@MARKET", used by metric values and winners.' })
  key!: string;
  @ApiProperty({ example: 1 }) position!: number;
  @ApiProperty({ format: 'uuid' }) variantId!: string;
  @ApiProperty() variantSlug!: string;
  @ApiProperty({ format: 'uuid' }) modelYearId!: string;
  @ApiProperty({ example: 2025 }) modelYear!: number;
  @ApiProperty({ example: 'BYD Seal 2025 Design AWD' }) title!: string;
  @ApiProperty({ description: 'Trim name.' }) name!: string;
  @ApiProperty({ type: BrandRefDto }) brand!: BrandRefDto;
  @ApiProperty({ type: ModelRefDto }) model!: ModelRefDto;
  @ApiProperty({ enum: ['BEV', 'PHEV', 'EREV', 'HEV'] }) powertrainType!: string;
  @ApiProperty({ nullable: true, type: String }) bodyType!: string | null;
  @ApiProperty({ nullable: true, type: String }) driveType!: string | null;
  @ApiProperty({ nullable: true, type: Number }) seats!: number | null;
  @ApiProperty({ type: CarMarketDto }) market!: CarMarketDto;
  @ApiProperty({ nullable: true, type: ImageDto }) image!: ImageDto | null;
  @ApiProperty({ nullable: true, type: PriceDto }) price!: PriceDto | null;
  @ApiProperty() hasTour!: boolean;
  @ApiProperty() isDemo!: boolean;
}

export class ComparisonWarningDto {
  @ApiProperty({
    enum: ['MIXED_MARKETS', 'MIXED_POWERTRAINS', 'NOT_OFFERED', 'DEMO_DATA'],
  })
  code!: string;
  @ApiProperty() message!: string;
}

export class ComparabilityLegendDto {
  @ApiProperty({ enum: COMPARABILITY }) status!: string;
  @ApiProperty() label!: string;
}

export class ComparisonResultDto {
  @ApiProperty({ enum: VIEWS }) view!: string;
  @ApiProperty() differencesOnly!: boolean;
  @ApiProperty({ example: 'EG', description: 'Request (display) market.' }) marketCode!: string;
  @ApiProperty({ type: [ComparisonCarDto], description: 'Pinned car headers in item order.' })
  cars!: ComparisonCarDto[];
  @ApiProperty({ type: [MetricGroupDto] }) groups!: MetricGroupDto[];
  @ApiProperty({ type: ComparisonSummaryDto }) summary!: ComparisonSummaryDto;
  @ApiProperty({ type: [ComparisonWarningDto] }) warnings!: ComparisonWarningDto[];
  @ApiProperty({ type: [ComparabilityLegendDto] }) legend!: ComparabilityLegendDto[];
  @ApiProperty({
    enum: [false],
    description: 'Always false: ads / sponsorship never change comparison results.',
  })
  sponsored!: false;
  @ApiProperty() disclosure!: string;
  @ApiProperty({ example: 'غير متوفر' }) notAvailableLabel!: string;
  @ApiProperty({ format: 'date-time' }) generatedAt!: string;
}

// --- saved / shared -------------------------------------------------------------------------

export class ComparisonItemViewDto {
  @ApiProperty() position!: number;
  @ApiProperty({ format: 'uuid' }) variantId!: string;
  @ApiProperty({ example: 'EG' }) marketCode!: string;
  @ApiProperty({ description: 'False when the trim is no longer published.' }) available!: boolean;
  @ApiProperty({ nullable: true, type: String }) variantSlug!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) modelYearId!: string | null;
  @ApiProperty({ nullable: true, type: Number }) modelYear!: number | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) modelId!: string | null;
  @ApiProperty({ nullable: true, type: String }) modelSlug!: string | null;
  @ApiProperty({ nullable: true, type: String, example: 'BYD Seal 2025 Design AWD' })
  title!: string | null;
  @ApiProperty({ nullable: true, type: String }) powertrainType!: string | null;
  @ApiProperty({ nullable: true, type: String }) availability!: string | null;
  @ApiProperty({ nullable: true, type: ImageDto }) image!: ImageDto | null;
  @ApiProperty() isDemo!: boolean;
}

export class ComparisonDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'k3Jd8sQ1xY2a' }) shareId!: string;
  @ApiProperty({ example: 'https://evcar.news/compare/k3Jd8sQ1xY2a' }) shareUrl!: string;
  @ApiProperty({
    enum: ['saved', 'shared', 'curated'],
    description:
      'saved = in a user account; shared = anonymous share link; curated = featured by editors.',
  })
  kind!: string;
  @ApiProperty({ description: 'The caller owns it (saved in the caller account).' })
  isMine!: boolean;
  @ApiProperty({
    nullable: true,
    type: String,
    description: "Owner's own label (only returned to the owner).",
  })
  title!: string | null;
  @ApiProperty({ description: 'Title to show: own label, curated title or "A vs B".' })
  displayTitle!: string;
  @ApiProperty({ example: 'EG' }) marketCode!: string;
  @ApiProperty({ type: [ComparisonItemViewDto] }) items!: ComparisonItemViewDto[];
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty() isDemo!: boolean;
}

export class CreatedComparisonDto extends ComparisonDto {
  @ApiProperty({ description: 'Stored in the caller account (false for guests).' })
  saved!: boolean;
  @ApiProperty({ description: 'An identical comparison already existed and was reused.' })
  reused!: boolean;
}

export class SharedComparisonDto {
  @ApiProperty({ type: ComparisonDto }) comparison!: ComparisonDto;
  @ApiProperty({
    nullable: true,
    type: ComparisonResultDto,
    description: 'null when fewer than 2 of its trims are still published.',
  })
  result!: ComparisonResultDto | null;
  @ApiProperty({ type: [ComparisonItemViewDto], description: 'Trims no longer published.' })
  unavailableItems!: ComparisonItemViewDto[];
}
