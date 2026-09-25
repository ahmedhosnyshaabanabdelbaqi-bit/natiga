/**
 * Admin DTOs of the data attached to a variant: specs, ranges, consumption,
 * charging (curves, times, inlets per market), market availability, prices,
 * gallery images and data sources.
 *
 * Numeric inputs may be sent in any known unit of the right dimension
 * (`unit`); they are stored in the canonical unit and the value "as
 * published" is kept in originalValue / originalUnit.
 */
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CleanText } from '../../../common/validation/decorators';
import { PaginationQueryDto } from '../../../common/http/pagination';
import {
  AVAILABILITIES,
  CONSUMPTION_KINDS,
  CONSUMPTION_MODES,
  CURRENT_TYPES,
  MARKET_CODE_RE,
  PRICE_TYPES,
  RANGE_CYCLES,
  RANGE_TYPES,
  RELIABILITIES,
  SOURCE_TYPES,
  VEHICLE_MEDIA_KINDS,
} from '../common/catalog-constants';
import {
  ChargingCurveDto,
  ChargingTimeDto,
  ConsumptionDto,
  DataPointDto,
  ImageDto,
  InletDto,
  PriceDto,
  RangeDto,
  SourceSummaryDto,
} from './shared.dto';
import { AdminVariantDto } from './admin-catalog.dto';
import {
  DateOnly,
  FiniteNumber,
  MoneyAmount,
  NullableBool,
  NullableDateOnly,
  NullableEnum,
  NullableMultiline,
  NullableNumber,
  NullableText,
  NullableTimestamp,
  NullableUuid,
  OptionalBool,
  OptionalEnum,
  OptionalInt,
  RequiredText,
  RequiredUuid,
} from './validators';

const DP_NOTE =
  'reliability "verified" or a verifiedAt date needs specs.verify and a source. Editing a verified value without re-verifying resets it to unverified.';

/** Source / reliability / verification of a data point. */
export class DataPointWriteDto {
  @ApiPropertyOptional({ nullable: true, format: 'uuid', description: 'Specification source.' })
  @NullableUuid()
  sourceId?: string | null;

  @ApiPropertyOptional({ enum: RELIABILITIES, description: DP_NOTE })
  @OptionalEnum(RELIABILITIES)
  reliability?: string;

  @ApiPropertyOptional({ nullable: true, format: 'date-time', description: DP_NOTE })
  @NullableTimestamp()
  verifiedAt?: string | null;
}

// --- specs ------------------------------------------------------------------------------

export class SpecValueWriteDto extends DataPointWriteDto {
  @ApiProperty({ example: 'battery.usable_kwh', description: 'Key from /admin/spec-definitions.' })
  @IsString()
  @MaxLength(100)
  specKey!: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    example: 'EG',
    description: 'null / omitted = applies to every market; a market row overrides it there.',
  })
  @IsOptional()
  @Matches(MARKET_CODE_RE)
  marketCode?: string | null;

  @ApiProperty({
    oneOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }],
    description: 'Number (in `unit` or the canonical unit), text or boolean per the definition.',
  })
  @IsDefined()
  value!: number | string | boolean;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    example: 'mi',
    description: 'Unit of `value` when it is not the canonical unit.',
  })
  @NullableText(20)
  unit?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'Value as published.' })
  @NullableText(200)
  originalValue?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @NullableText(20)
  originalUnit?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @NullableMultiline(2000)
  notes?: string | null;
}

export class UpsertSpecsDto {
  @ApiProperty({ type: [SpecValueWriteDto], description: 'Upserted by (specKey, marketCode).' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SpecValueWriteDto)
  items!: SpecValueWriteDto[];
}

export class DeleteSpecQueryDto {
  @ApiPropertyOptional({ description: 'Market row to delete; omitted = the global row.' })
  @IsOptional()
  @Matches(MARKET_CODE_RE)
  marketCode?: string;
}

export class SpecDefinitionDto {
  @ApiProperty() key!: string;
  @ApiProperty() group!: string;
  @ApiProperty({ enum: ['number', 'text', 'boolean'] }) dataType!: string;
  @ApiProperty({ nullable: true, type: String }) unit!: string | null;
  @ApiProperty({ enum: ['higher', 'lower', 'none'] }) betterDirection!: string;
  @ApiProperty() labelEn!: string;
  @ApiProperty() labelAr!: string;
  @ApiProperty({ nullable: true, type: String }) descriptionEn!: string | null;
  @ApiProperty({ nullable: true, type: String }) descriptionAr!: string | null;
  @ApiProperty() isKeySpec!: boolean;
  @ApiProperty() isComparable!: boolean;
  @ApiProperty() sortOrder!: number;
}

export class AdminSpecValueDto extends DataPointDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() specKey!: string;
  @ApiProperty() group!: string;
  @ApiProperty() labelEn!: string;
  @ApiProperty() labelAr!: string;
  @ApiProperty({ nullable: true, type: String }) notes!: string | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

// --- ranges / consumption -----------------------------------------------------------------

export class CreateRangeDto extends DataPointWriteDto {
  @ApiPropertyOptional({ nullable: true, type: String, description: 'null = all markets.' })
  @IsOptional()
  @Matches(MARKET_CODE_RE)
  marketCode?: string | null;

  @ApiProperty({ enum: RANGE_CYCLES, description: 'Never converted between cycles.' })
  @IsIn(RANGE_CYCLES)
  cycle!: string;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'Required when OTHER.' })
  @NullableText(100)
  cycleNote?: string | null;

  @ApiProperty({
    enum: RANGE_TYPES,
    description: 'electric, or total (hybrids / range extenders only).',
  })
  @IsIn(RANGE_TYPES)
  rangeType!: string;

  @ApiProperty({ example: 520 }) @FiniteNumber() @Min(0.1) @Max(100_000) value!: number;

  @ApiPropertyOptional({ example: 'km', description: 'km (default) or mi.' })
  @NullableText(20)
  unit?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(50) originalValue?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(20) originalUnit?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: Number })
  @NullableNumber(1, 40)
  wheelSizeInch?: number | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableMultiline(2000) conditions?:
    string | null;
}

export class UpdateRangeDto extends PartialType(CreateRangeDto, { skipNullProperties: false }) {}

export class CreateConsumptionDto extends DataPointWriteDto {
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Matches(MARKET_CODE_RE)
  marketCode?: string | null;
  @ApiProperty({ enum: RANGE_CYCLES }) @IsIn(RANGE_CYCLES) cycle!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(100) cycleNote?:
    string | null;
  @ApiProperty({ enum: CONSUMPTION_KINDS }) @IsIn(CONSUMPTION_KINDS) kind!: string;
  @ApiPropertyOptional({ enum: CONSUMPTION_MODES, nullable: true, type: String })
  @NullableEnum(CONSUMPTION_MODES)
  mode?: string | null;
  @ApiProperty({ example: 165 }) @FiniteNumber() @Min(0.01) @Max(100_000) value!: number;
  @ApiPropertyOptional({
    example: 'kWh/100km',
    description: 'Default Wh/km (electricity) or L/100km (fuel).',
  })
  @NullableText(20)
  unit?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(50) originalValue?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(20) originalUnit?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableMultiline(2000) conditions?:
    string | null;
}

export class UpdateConsumptionDto extends PartialType(CreateConsumptionDto, {
  skipNullProperties: false,
}) {}

// --- charging -----------------------------------------------------------------------------

export class CurvePointWriteDto {
  @ApiProperty({ minimum: 0, maximum: 100 }) @FiniteNumber() @Min(0) @Max(100) socPercent!: number;
  @ApiProperty({ minimum: 0 }) @FiniteNumber() @Min(0) @Max(2000) powerKw!: number;
}

export class CreateChargingCurveDto extends DataPointWriteDto {
  @ApiPropertyOptional({ enum: CURRENT_TYPES, default: 'DC' })
  @OptionalEnum(CURRENT_TYPES)
  currentType?: string;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(200) label?: string | null;
  @ApiPropertyOptional({ nullable: true, type: Number, description: 'Charger rating (kW).' })
  @NullableNumber(0.1, 2000)
  chargerMaxPowerKw?: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) @NullableNumber(-40, 80) batteryTempC?:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: Boolean }) @NullableBool() preconditioned?:
    boolean | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableMultiline(2000) conditions?:
    string | null;
  @ApiProperty({ type: [CurvePointWriteDto], description: '2–101 points, unique SoC.' })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(101)
  @ValidateNested({ each: true })
  @Type(() => CurvePointWriteDto)
  points!: CurvePointWriteDto[];
}

export class UpdateChargingCurveDto extends PartialType(CreateChargingCurveDto, {
  skipNullProperties: false,
}) {}

export class CreateChargingTimeDto extends DataPointWriteDto {
  @ApiProperty({ enum: CURRENT_TYPES }) @IsIn(CURRENT_TYPES) currentType!: string;
  @ApiProperty({ minimum: 0, maximum: 100, example: 10 })
  @FiniteNumber()
  @Min(0)
  @Max(100)
  fromSoc!: number;
  @ApiProperty({ minimum: 0, maximum: 100, example: 80 })
  @FiniteNumber()
  @Min(0)
  @Max(100)
  toSoc!: number;
  @ApiProperty({ example: 28, description: 'Duration in `durationUnit` (default min).' })
  @FiniteNumber()
  @Min(0.01)
  @Max(100_000)
  duration!: number;
  @ApiPropertyOptional({ enum: ['min', 'h', 's'], default: 'min' })
  @OptionalEnum(['min', 'h', 's'])
  durationUnit?: string;
  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: 'Rated charger power; required unless `conditions` describes the charger.',
  })
  @NullableNumber(0.1, 2000)
  chargerPowerKw?: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) @NullableNumber(0.1, 2000) peakPowerKw?:
    number | null;
  @ApiPropertyOptional({ nullable: true, type: Number, description: 'Must be ≤ peak.' })
  @NullableNumber(0.1, 2000)
  averagePowerKw?: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number })
  @NullableNumber(0.1, 2000)
  onboardChargerLimitKw?: number | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableMultiline(2000) conditions?:
    string | null;
}

export class UpdateChargingTimeDto extends PartialType(CreateChargingTimeDto, {
  skipNullProperties: false,
}) {}

export class InletWriteDto extends DataPointWriteDto {
  @ApiProperty({ example: 'ccs2', description: 'connector_types.code' })
  @IsString()
  @MaxLength(32)
  connectorTypeCode!: string;
  @ApiProperty({ enum: CURRENT_TYPES }) @IsIn(CURRENT_TYPES) currentType!: string;
  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: 'AC: on-board charger limit; DC: peak.',
  })
  @NullableNumber(0.1, 2000)
  maxPowerKw?: number | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableMultiline(1000) notes?:
    string | null;
}

export class ReplaceInletsDto {
  @ApiProperty({ type: [InletWriteDto], description: 'Replaces the inlets of this market.' })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => InletWriteDto)
  inlets!: InletWriteDto[];
}

// --- variant markets --------------------------------------------------------------------

export class UpsertVariantMarketDto {
  @ApiProperty({ enum: AVAILABILITIES }) @IsIn(AVAILABILITIES) availability!: string;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Local trim name.' })
  @NullableText(200)
  localNameEn?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(200) localNameAr?:
    string | null;
  @ApiPropertyOptional({ enum: ['lhd', 'rhd'], nullable: true, type: String })
  @NullableEnum(['lhd', 'rhd'])
  driveSide?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' })
  @NullableDateOnly()
  launchDate?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' })
  @NullableDateOnly()
  discontinuedAt?: string | null;
  @ApiPropertyOptional({ nullable: true, format: 'uuid' }) @NullableUuid() sourceId?: string | null;
  @ApiPropertyOptional({ nullable: true, format: 'date-time', description: 'Needs specs.verify.' })
  @NullableTimestamp()
  verifiedAt?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableMultiline(2000) notes?:
    string | null;
}

export class AdminVariantMarketDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() marketCode!: string;
  @ApiProperty({ enum: AVAILABILITIES }) availability!: string;
  @ApiProperty({ nullable: true, type: String }) localNameEn!: string | null;
  @ApiProperty({ nullable: true, type: String }) localNameAr!: string | null;
  @ApiProperty({ nullable: true, type: String }) driveSide!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) launchDate!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) discontinuedAt!: string | null;
  @ApiProperty({ nullable: true, type: SourceSummaryDto }) source!: SourceSummaryDto | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) verifiedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) notes!: string | null;
  @ApiProperty({ type: [InletDto] }) inlets!: InletDto[];
}

// --- prices -----------------------------------------------------------------------------

export class CreatePriceDto extends DataPointWriteDto {
  @ApiProperty({ example: 'EG' }) @Matches(MARKET_CODE_RE) marketCode!: string;
  @ApiProperty({ example: '1850000.00', description: 'Decimal string, > 0.' })
  @MoneyAmount()
  amount!: string;
  @ApiProperty({
    example: 'EGP',
    description:
      'official_msrp and dealer prices must be in the market currency; a foreign-currency figure can only be a market_estimate. Never converted.',
  })
  @Matches(/^[A-Z]{3}$/)
  currencyCode!: string;
  @ApiProperty({ enum: PRICE_TYPES }) @IsIn(PRICE_TYPES) priceType!: string;
  @ApiProperty({ format: 'date', example: '2026-01-01' }) @DateOnly() effectiveFrom!: string;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' })
  @NullableDateOnly()
  effectiveTo?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableMultiline(2000) notes?:
    string | null;
  @ApiPropertyOptional({
    default: true,
    description:
      'official_msrp: end the previous open-ended official price the day before effectiveFrom.',
  })
  @OptionalBool()
  closePrevious?: boolean;
}

export class UpdatePriceDto extends PartialType(CreatePriceDto, { skipNullProperties: false }) {}

export class PriceListQueryDto {
  @ApiPropertyOptional({ example: 'EG' })
  @IsOptional()
  @Matches(MARKET_CODE_RE)
  marketCode?: string;
}

// --- gallery ----------------------------------------------------------------------------

export class CreateVehicleMediaDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Exactly one of modelId / generationId / variantId.',
  })
  @IsOptional()
  @IsUUID()
  modelId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() generationId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() variantId?: string;
  @ApiProperty({ format: 'uuid', description: 'Ready, licensed image (never a panorama).' })
  @RequiredUuid()
  assetId!: string;
  @ApiPropertyOptional({ enum: VEHICLE_MEDIA_KINDS, default: 'gallery' })
  @OptionalEnum(VEHICLE_MEDIA_KINDS)
  kind?: string;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(500) captionEn?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(500) captionAr?:
    string | null;
  @ApiPropertyOptional({ default: false, description: 'One cover per target.' })
  @OptionalBool()
  isCover?: boolean;
  @ApiPropertyOptional({ default: 0 }) @OptionalInt(0, 100_000) sortOrder?: number;
}

export class UpdateVehicleMediaDto {
  @ApiPropertyOptional({ enum: VEHICLE_MEDIA_KINDS })
  @OptionalEnum(VEHICLE_MEDIA_KINDS)
  kind?: string;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(500) captionEn?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(500) captionAr?:
    string | null;
  @ApiPropertyOptional() @OptionalBool() isCover?: boolean;
  @ApiPropertyOptional() @OptionalInt(0, 100_000) sortOrder?: number;
}

export class VehicleMediaQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() modelId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() generationId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() variantId?: string;
}

export class AdminVehicleMediaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) modelId!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) generationId!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) variantId!: string | null;
  @ApiProperty({ format: 'uuid' }) assetId!: string;
  @ApiProperty({ enum: VEHICLE_MEDIA_KINDS }) kind!: string;
  @ApiProperty({ nullable: true, type: String }) captionEn!: string | null;
  @ApiProperty({ nullable: true, type: String }) captionAr!: string | null;
  @ApiProperty() isCover!: boolean;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({
    nullable: true,
    type: ImageDto,
    description: 'null when the asset is no longer ready / licensed (then it is hidden publicly).',
  })
  image!: ImageDto | null;
}

// --- sources ----------------------------------------------------------------------------

export class CreateSourceDto {
  @ApiProperty({ enum: SOURCE_TYPES }) @IsIn(SOURCE_TYPES) type!: string;
  @ApiProperty({ example: 'Official technical data sheet' }) @RequiredText(300) title!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableText(200) publisher?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'http(s) URL.' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^https?:\/\/[^\s]+$/)
  url?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' })
  @NullableDateOnly()
  documentDate?: string | null;
  @ApiPropertyOptional({ nullable: true, format: 'date-time' })
  @NullableTimestamp()
  accessedAt?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Matches(MARKET_CODE_RE)
  marketCode?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, example: 'en' })
  @IsOptional()
  @Matches(/^[a-z]{2}(-[A-Z]{2})?$/)
  language?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @NullableMultiline(5000) notes?:
    string | null;
}

export class UpdateSourceDto extends PartialType(CreateSourceDto, { skipNullProperties: false }) {}

export class SourceListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @CleanText() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional({ enum: SOURCE_TYPES }) @IsOptional() @IsIn(SOURCE_TYPES) type?: string;
}

export class AdminSourceDto extends SourceSummaryDto {
  @ApiProperty({ nullable: true, type: String }) language!: string | null;
  @ApiProperty({ nullable: true, type: String }) notes!: string | null;
  @ApiProperty() isDemo!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'integer' },
    description: 'Rows citing this source (detail view only).',
  })
  usage?: Record<string, number>;
}

// --- variant detail -----------------------------------------------------------------------

export class AdminVariantDetailDto extends AdminVariantDto {
  @ApiProperty({ type: [AdminVariantMarketDto] }) markets!: AdminVariantMarketDto[];
  @ApiProperty({ type: [AdminSpecValueDto] }) specs!: AdminSpecValueDto[];
  @ApiProperty({ type: [RangeDto] }) ranges!: RangeDto[];
  @ApiProperty({ type: [ConsumptionDto] }) consumption!: ConsumptionDto[];
  @ApiProperty({ type: [ChargingCurveDto] }) chargingCurves!: ChargingCurveDto[];
  @ApiProperty({ type: [ChargingTimeDto] }) chargingTimes!: ChargingTimeDto[];
  @ApiProperty({ type: [PriceDto], description: 'All markets, newest effective date first.' })
  prices!: PriceDto[];
  @ApiProperty({ type: [AdminVehicleMediaDto] }) media!: AdminVehicleMediaDto[];
  @ApiProperty({ description: 'Interior tours bound to this variant (any status).' })
  tourCount!: number;
}

export class RebuildResultDto {
  @ApiProperty() models!: number;
}
