/**
 * Public catalog API used by the apps (guests allowed). Market-aware via
 * ?market / X-Market, language via ?lang / Accept-Language. Missing values
 * are null ("غير متوفر / Not available"), never 0. Prices are never
 * converted between currencies.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CleanText } from '../../../common/validation/decorators';
import { PaginationQueryDto } from '../../../common/http/pagination';
import {
  AVAILABILITIES,
  BODY_TYPES,
  DRIVE_TYPES,
  POWERTRAIN_TYPES,
  RANGE_CYCLES,
  RANGE_TYPES,
} from '../common/catalog-constants';
import {
  ChargingCurveDto,
  ChargingTimeDto,
  ConsumptionDto,
  DataPointDto,
  ImageDto,
  InletDto,
  MoneyDto,
  PriceDto,
  RangeDto,
  SourceSummaryDto,
} from './shared.dto';
import { QueryBool, QueryInt, QueryList } from './validators';

export const CAR_SORTS = ['newest', 'price_asc', 'price_desc', 'range_desc', 'name'] as const;
export type CarSort = (typeof CAR_SORTS)[number];

const DECIMAL_RE = /^\d{1,12}(\.\d{1,2})?$/;

// --- queries ----------------------------------------------------------------------------

export class BrandListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search in brand names (ar/en).' })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Only brands with at least one car listed in the market.',
  })
  @QueryBool()
  hasCars?: boolean;
}

export class CarListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Brand slug(s) or id(s), comma-separated.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  brand?: string;

  @ApiPropertyOptional({ enum: POWERTRAIN_TYPES, isArray: true, description: 'Comma list.' })
  @QueryList(POWERTRAIN_TYPES)
  powertrain?: string[];

  @ApiPropertyOptional({ enum: BODY_TYPES, isArray: true, description: 'Comma list.' })
  @QueryList(BODY_TYPES)
  body?: string[];

  @ApiPropertyOptional({ enum: DRIVE_TYPES, isArray: true, description: 'Comma list.' })
  @QueryList(DRIVE_TYPES)
  drive?: string[];

  @ApiPropertyOptional({ description: 'Exact number of seats.' })
  @QueryInt(1, 12)
  seats?: number;

  @ApiPropertyOptional({ description: 'At least this many seats.' })
  @QueryInt(1, 12)
  minSeats?: number;

  @ApiPropertyOptional({
    example: '1000000',
    description: 'Current local price ≥ (market currency; prices in other currencies are ignored).',
  })
  @IsOptional()
  @Matches(DECIMAL_RE)
  minPrice?: string;

  @ApiPropertyOptional({
    example: '2500000',
    description: 'Current local price ≤ (market currency).',
  })
  @IsOptional()
  @Matches(DECIMAL_RE)
  maxPrice?: string;

  @ApiPropertyOptional({
    description:
      'Minimum range in km. Requires rangeCycle (ranges are never compared across cycles).',
  })
  @QueryInt(1, 5000)
  minRange?: number;

  @ApiPropertyOptional({
    enum: RANGE_CYCLES,
    description: 'Cycle for minRange and sort=range_desc (default WLTP for sorting).',
  })
  @IsOptional()
  @IsIn(RANGE_CYCLES)
  rangeCycle?: string;

  @ApiPropertyOptional({ enum: RANGE_TYPES, default: 'electric' })
  @IsOptional()
  @IsIn(RANGE_TYPES)
  rangeType?: string;

  @ApiPropertyOptional({ description: 'Model year.' }) @QueryInt(1990, 2100) year?: number;

  @ApiPropertyOptional({ description: 'Text search in brand / model / trim names.' })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Also list trims marked discontinued in the market.',
  })
  @QueryBool()
  includeDiscontinued?: boolean;

  @ApiPropertyOptional({ enum: CAR_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(CAR_SORTS)
  sort?: CarSort;
}

export class PickerQueryDto {
  @ApiPropertyOptional({ description: 'Brand slug or id.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  brand?: string;

  @ApiPropertyOptional({ description: 'Model slug or id.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string;

  @ApiPropertyOptional({ description: 'Model year (with model).' })
  @QueryInt(1990, 2100)
  year?: number;

  @ApiPropertyOptional({ description: 'Variant id or slug → markets level.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  variant?: string;

  @ApiPropertyOptional({
    enum: ['market', 'all'],
    default: 'market',
    description:
      'market: only trims listed in the request market (compare). all: any public trim, e.g. an imported car in the garage.',
  })
  @IsOptional()
  @IsIn(['market', 'all'])
  scope?: 'market' | 'all';
}

// --- shared pieces ----------------------------------------------------------------------

export class BrandRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: ImageDto }) logo!: ImageDto | null;
}

export class PriceSummaryDto {
  @ApiProperty({ type: MoneyDto }) amount!: MoneyDto;
  @ApiProperty({ enum: ['official_msrp', 'dealer', 'market_estimate'] }) priceType!: string;
  @ApiProperty() priceTypeLabel!: string;
  @ApiProperty({ format: 'date' }) effectiveFrom!: string;
  @ApiProperty({ format: 'uuid' }) variantId!: string;
}

export class RangeSpanDto {
  @ApiProperty({ enum: RANGE_CYCLES }) cycle!: string;
  @ApiProperty({ enum: RANGE_TYPES }) rangeType!: string;
  @ApiProperty() minKm!: number;
  @ApiProperty() maxKm!: number;
}

export class NumberSpanDto {
  @ApiProperty() min!: number;
  @ApiProperty() max!: number;
}

// --- brands -----------------------------------------------------------------------------

export class BrandSummaryDto extends BrandRefDto {
  @ApiProperty() nameAr!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty({ nullable: true, type: String, example: 'CN' }) countryCode!: string | null;
  @ApiProperty({ description: 'Models with at least one trim listed in the market.' })
  carCount!: number;
  @ApiProperty() isDemo!: boolean;
}

export class CarCardDto {
  @ApiProperty({ format: 'uuid', description: 'Model id.' }) id!: string;
  @ApiProperty({ description: 'Model slug (→ /cars/:slug).' }) slug!: string;
  @ApiProperty({ example: 'BYD Seal', description: 'Brand + model in the request language.' })
  title!: string;
  @ApiProperty({ description: 'Model name only.' }) name!: string;
  @ApiProperty() nameAr!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty({ type: BrandRefDto }) brand!: BrandRefDto;
  @ApiProperty({ nullable: true, type: String, enum: BODY_TYPES }) bodyType!: string | null;
  @ApiProperty({ nullable: true, type: String }) segment!: string | null;
  @ApiProperty({ nullable: true, type: ImageDto }) image!: ImageDto | null;
  @ApiProperty({ type: [String], enum: POWERTRAIN_TYPES }) powertrainTypes!: string[];
  @ApiProperty({ type: [Number], description: 'Newest first.' }) modelYears!: number[];
  @ApiProperty({ description: 'Trims matching the filters in the market.' }) variantCount!: number;
  @ApiProperty({
    nullable: true,
    type: PriceSummaryDto,
    description: 'Lowest current local price.',
  })
  priceFrom!: PriceSummaryDto | null;
  @ApiProperty({ nullable: true, type: PriceSummaryDto }) priceTo!: PriceSummaryDto | null;
  @ApiProperty({
    type: [RangeSpanDto],
    description: 'Range span per cycle and range type — never merged across cycles.',
  })
  ranges!: RangeSpanDto[];
  @ApiProperty({ nullable: true, type: NumberSpanDto }) usableBatteryKwh!: NumberSpanDto | null;
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Highest peak DC power (not average).',
  })
  maxDcPeakKw!: number | null;
  @ApiProperty({ description: 'A published 360° interior tour exists in this market.' })
  hasTour!: boolean;
  @ApiProperty({ enum: AVAILABILITIES }) availability!: string;
  @ApiProperty() isDemo!: boolean;
}

export class ModelElsewhereDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: ImageDto }) image!: ImageDto | null;
  @ApiProperty({ type: [String] }) marketCodes!: string[];
}

export class BrandDetailDto extends BrandSummaryDto {
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ nullable: true, type: String }) websiteUrl!: string | null;
  @ApiProperty({ type: [CarCardDto], description: 'Models listed in the market.' })
  cars!: CarCardDto[];
  @ApiProperty({
    type: [ModelElsewhereDto],
    description: 'Published models not listed in this market (with their markets).',
  })
  notInMarket!: ModelElsewhereDto[];
}

// --- related content --------------------------------------------------------------------

export class ArticleCardDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ example: 'review' }) type!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) summary!: string | null;
  @ApiProperty({ example: 'ar', description: 'Language actually served.' }) language!: string;
  @ApiProperty({ nullable: true, type: ImageDto }) coverImage!: ImageDto | null;
  @ApiProperty({ format: 'date-time' }) publishedAt!: string;
  @ApiProperty() isSponsored!: boolean;
  @ApiProperty({ nullable: true, type: String }) sponsorName!: string | null;
  @ApiProperty() isDemo!: boolean;
}

export class TourSceneRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() key!: string;
  @ApiProperty({ enum: ['driver', 'front_passenger', 'rear', 'third_row', 'cargo', 'other'] })
  position!: string;
  @ApiProperty({ nullable: true, type: String }) title!: string | null;
}

export class TourCardDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ nullable: true, type: String }) title!: string | null;
  @ApiProperty({ format: 'uuid' }) variantId!: string;
  @ApiProperty() marketCode!: string;
  @ApiProperty({ enum: ['lhd', 'rhd'] }) driveSide!: string;
  @ApiProperty() interiorColorName!: string;
  @ApiProperty({ nullable: true, type: String, example: '#1F1F1F' }) interiorColorHex!:
    string | null;
  @ApiProperty({ type: [TourSceneRefDto], description: 'One independent panorama per seat.' })
  seatScenes!: TourSceneRefDto[];
  @ApiProperty({
    description:
      'True when the imagery is of a similar trim (editor-approved) — show differenceNote prominently.',
  })
  isReferenceForSimilarTrim!: boolean;
  @ApiProperty({ nullable: true, type: String }) differenceNote!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Trim actually photographed.' })
  referenceVariantName!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Fast low-res preview image.' })
  previewUrl!: string | null;
  @ApiProperty() isDemo!: boolean;
}

export class ToursSummaryDto {
  @ApiProperty({ description: 'At least one published tour for this car in the market.' })
  available!: boolean;
  @ApiProperty({ type: [TourCardDto] }) tours!: TourCardDto[];
  @ApiProperty({ example: 'الجولة غير متاحة لهذه الفئة' }) unavailableLabel!: string;
}

// --- model page ------------------------------------------------------------------------

export class VariantKeyFactsDto {
  @ApiProperty({ nullable: true, type: Number }) usableBatteryKwh!: number | null;
  @ApiProperty({ nullable: true, type: Number }) grossBatteryKwh!: number | null;
  @ApiProperty({ nullable: true, type: Number }) powerKw!: number | null;
  @ApiProperty({ nullable: true, type: Number }) accel0100S!: number | null;
  @ApiProperty({ nullable: true, type: Number }) acMaxKw!: number | null;
  @ApiProperty({ nullable: true, type: Number, description: 'Peak, not average.' })
  dcPeakKw!: number | null;
  @ApiProperty({ type: [RangeSpanDto], description: 'min = max per cycle for one trim.' })
  ranges!: RangeSpanDto[];
}

export class VariantSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String, description: 'Local name in the market.' })
  localName!: string | null;
  @ApiProperty({ nullable: true, type: String }) trimCode!: string | null;
  @ApiProperty({ enum: POWERTRAIN_TYPES }) powertrainType!: string;
  @ApiProperty({ nullable: true, type: String }) bodyType!: string | null;
  @ApiProperty({ nullable: true, type: String }) driveType!: string | null;
  @ApiProperty({ nullable: true, type: Number }) seats!: number | null;
  @ApiProperty() modelYear!: number;
  @ApiProperty({ enum: AVAILABILITIES }) availability!: string;
  @ApiProperty({ nullable: true, type: PriceDto }) currentPrice!: PriceDto | null;
  @ApiProperty({ type: VariantKeyFactsDto }) keyFacts!: VariantKeyFactsDto;
  @ApiProperty() hasTour!: boolean;
  @ApiProperty() isDemo!: boolean;
}

export class ModelYearViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() year!: number;
  @ApiProperty({ type: [VariantSummaryDto] }) variants!: VariantSummaryDto[];
}

export class GenerationViewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) code!: string | null;
  @ApiProperty({ nullable: true, type: Number }) startYear!: number | null;
  @ApiProperty({ nullable: true, type: Number }) endYear!: number | null;
  @ApiProperty({ type: [ModelYearViewDto], description: 'Newest first.' })
  years!: ModelYearViewDto[];
}

export class MarketRefDto {
  @ApiProperty({ example: 'EG' }) code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: AVAILABILITIES }) availability!: string;
}

export class CarDetailDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty() name!: string;
  @ApiProperty() nameAr!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ nullable: true, type: String }) bodyType!: string | null;
  @ApiProperty({ nullable: true, type: String }) segment!: string | null;
  @ApiProperty({ type: BrandRefDto }) brand!: BrandRefDto;
  @ApiProperty({ nullable: true, type: ImageDto }) heroImage!: ImageDto | null;
  @ApiProperty({ type: [ImageDto], description: 'Model + generation gallery.' })
  images!: ImageDto[];
  @ApiProperty({ example: 'EG' }) marketCode!: string;
  @ApiProperty({ description: 'At least one trim is listed in the request market.' })
  availableInMarket!: boolean;
  @ApiProperty({ type: [MarketRefDto], description: 'Markets where trims are listed.' })
  availableMarkets!: MarketRefDto[];
  @ApiProperty({ type: [String], enum: POWERTRAIN_TYPES }) powertrainTypes!: string[];
  @ApiProperty({ nullable: true, type: PriceSummaryDto }) priceFrom!: PriceSummaryDto | null;
  @ApiProperty({ nullable: true, type: PriceSummaryDto }) priceTo!: PriceSummaryDto | null;
  @ApiProperty({ type: [GenerationViewDto], description: 'Trims of the market only.' })
  generations!: GenerationViewDto[];
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) defaultVariantId!: string | null;
  @ApiProperty({ type: ToursSummaryDto }) tours!: ToursSummaryDto;
  @ApiProperty({ type: [CarCardDto] }) competitors!: CarCardDto[];
  @ApiProperty({ type: [ArticleCardDto] }) relatedArticles!: ArticleCardDto[];
  @ApiProperty() isDemo!: boolean;
  @ApiProperty({ example: 'غير متوفر' }) notAvailableLabel!: string;
}

// --- variant spec sheet ----------------------------------------------------------------

export class SpecItemDto {
  @ApiProperty({ example: 'battery.usable_kwh' }) key!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ enum: ['number', 'text', 'boolean'] }) dataType!: string;
  @ApiProperty({ nullable: true, type: String }) unit!: string | null;
  @ApiProperty({ enum: ['higher', 'lower', 'none'] }) betterDirection!: string;
  @ApiProperty() isKeySpec!: boolean;
  @ApiProperty({
    nullable: true,
    type: DataPointDto,
    description: 'null = not available (never 0).',
  })
  point!: DataPointDto | null;
}

export class SpecGroupDto {
  @ApiProperty({ example: 'battery' }) key!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ type: [SpecItemDto] }) items!: SpecItemDto[];
}

export class VariantMarketStatusDto {
  @ApiProperty({ example: 'EG' }) code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ example: 'EGP' }) currencyCode!: string;
  @ApiProperty({ description: 'The trim is listed (available / coming soon) in this market.' })
  offered!: boolean;
  @ApiProperty({
    enum: [...AVAILABILITIES, 'not_listed'],
    description: 'not_listed = no record for this market.',
  })
  availability!: string;
  @ApiProperty({ nullable: true, type: String }) localName!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) launchDate!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) discontinuedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, enum: ['lhd', 'rhd'] }) driveSide!: string | null;
  @ApiProperty({ nullable: true, type: SourceSummaryDto }) source!: SourceSummaryDto | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) verifiedAt!: string | null;
}

export class KeyFactsDto {
  @ApiProperty({ nullable: true, type: DataPointDto }) usableBatteryKwh!: DataPointDto | null;
  @ApiProperty({ nullable: true, type: DataPointDto }) grossBatteryKwh!: DataPointDto | null;
  @ApiProperty({ nullable: true, type: DataPointDto }) powerKw!: DataPointDto | null;
  @ApiProperty({ nullable: true, type: DataPointDto }) powerHp!: DataPointDto | null;
  @ApiProperty({ nullable: true, type: DataPointDto }) torqueNm!: DataPointDto | null;
  @ApiProperty({ nullable: true, type: DataPointDto }) accel0100S!: DataPointDto | null;
  @ApiProperty({ nullable: true, type: DataPointDto }) acMaxKw!: DataPointDto | null;
  @ApiProperty({ nullable: true, type: DataPointDto, description: 'Peak DC power, not average.' })
  dcPeakKw!: DataPointDto | null;
  @ApiProperty({ type: [RangeDto], description: 'Electric ranges, one per cycle.' })
  electricRanges!: RangeDto[];
}

export class PriceBlockDto {
  @ApiProperty({ nullable: true, type: PriceDto, description: 'Current price in the market.' })
  current!: PriceDto | null;
  @ApiProperty({ type: [PriceDto], description: 'Market history, newest effective date first.' })
  history!: PriceDto[];
}

export class ChargingBlockDto {
  @ApiProperty({ type: [InletDto], description: 'Inlets of the trim in the request market.' })
  inlets!: InletDto[];
  @ApiProperty({ type: [ChargingTimeDto] }) times!: ChargingTimeDto[];
  @ApiProperty({ type: [ChargingCurveDto] }) curves!: ChargingCurveDto[];
}

export class ModelRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
}

export class GenerationRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) code!: string | null;
  @ApiProperty({ nullable: true, type: Number }) startYear!: number | null;
  @ApiProperty({ nullable: true, type: Number }) endYear!: number | null;
}

export class VariantSheetDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ description: 'Trim name in the request language.' }) name!: string;
  @ApiProperty() nameAr!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty({ example: 'BYD Seal 2025 Design AWD' }) title!: string;
  @ApiProperty({ nullable: true, type: String }) trimCode!: string | null;
  @ApiProperty({ enum: POWERTRAIN_TYPES }) powertrainType!: string;
  @ApiProperty({ nullable: true, type: String, enum: BODY_TYPES }) bodyType!: string | null;
  @ApiProperty({ nullable: true, type: String, enum: DRIVE_TYPES }) driveType!: string | null;
  @ApiProperty({ nullable: true, type: Number }) seats!: number | null;
  @ApiProperty({ nullable: true, type: Number }) doors!: number | null;
  @ApiProperty() modelYear!: number;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) publishedAt!: string | null;
  @ApiProperty() isDemo!: boolean;
  @ApiProperty({ type: BrandRefDto }) brand!: BrandRefDto;
  @ApiProperty({ type: ModelRefDto }) model!: ModelRefDto;
  @ApiProperty({ type: GenerationRefDto }) generation!: GenerationRefDto;
  @ApiProperty({ type: VariantMarketStatusDto }) market!: VariantMarketStatusDto;
  @ApiProperty({ type: [MarketRefDto] }) availableMarkets!: MarketRefDto[];
  @ApiProperty({ type: [ImageDto], description: 'Trim, then generation, then model images.' })
  images!: ImageDto[];
  @ApiProperty({ type: PriceBlockDto }) price!: PriceBlockDto;
  @ApiProperty({ type: KeyFactsDto }) keyFacts!: KeyFactsDto;
  @ApiProperty({
    type: [SpecGroupDto],
    description:
      'Full grouped spec sheet (battery, charging, performance, dimensions, practicality, safety, comfort, tech, warranty). Missing values have point = null.',
  })
  specGroups!: SpecGroupDto[];
  @ApiProperty({ type: [RangeDto] }) ranges!: RangeDto[];
  @ApiProperty({ type: [ConsumptionDto] }) consumption!: ConsumptionDto[];
  @ApiProperty({ type: ChargingBlockDto }) charging!: ChargingBlockDto;
  @ApiProperty({ type: ToursSummaryDto }) tours!: ToursSummaryDto;
  @ApiProperty({ type: [ArticleCardDto] }) relatedArticles!: ArticleCardDto[];
  @ApiProperty({ type: [CarCardDto] }) competitors!: CarCardDto[];
  @ApiProperty({ type: [SourceSummaryDto], description: 'Every source cited on this page.' })
  sources!: SourceSummaryDto[];
  @ApiProperty({ example: 'غير متوفر' }) notAvailableLabel!: string;
}

// --- pickers ---------------------------------------------------------------------------

export class PickerMarketDto {
  @ApiProperty() code!: string;
  @ApiProperty({ enum: AVAILABILITIES }) availability!: string;
}

export class PickerItemDto {
  @ApiProperty({ description: 'brand / model / model-year / variant id, or market code.' })
  id!: string;
  @ApiProperty({ nullable: true, type: String }) slug!: string | null;
  @ApiProperty({ description: 'Display label in the request language.' }) label!: string;
  @ApiProperty({ nullable: true, type: String }) sublabel!: string | null;
  @ApiProperty({ nullable: true, type: String }) imageUrl!: string | null;
  @ApiProperty({ nullable: true, type: Number, description: 'Children at the next level.' })
  count!: number | null;
  @ApiPropertyOptional({ description: 'year level' }) year?: number;
  @ApiPropertyOptional({ description: 'variant level', enum: POWERTRAIN_TYPES })
  powertrainType?: string;
  @ApiPropertyOptional({ description: 'variant level' }) modelYear?: number;
  @ApiPropertyOptional({ description: 'variant level', format: 'uuid' }) modelId?: string;
  @ApiPropertyOptional({ description: 'variant level' }) modelSlug?: string;
  @ApiPropertyOptional({ description: 'variant level: "Brand Model Year Trim".' }) title?: string;
  @ApiPropertyOptional({ description: 'variant level', type: [PickerMarketDto] })
  markets?: PickerMarketDto[];
  @ApiPropertyOptional({ description: 'market level', enum: AVAILABILITIES })
  availability?: string;
  @ApiPropertyOptional({ description: 'market level', nullable: true, type: String })
  localName?: string | null;
  @ApiPropertyOptional({ description: 'market level' }) currencyCode?: string;
}

export class PickerResponseDto {
  @ApiProperty({ enum: ['brand', 'model', 'year', 'variant', 'market'] }) level!: string;
  @ApiProperty({ example: 'EG' }) marketCode!: string;
  @ApiProperty({ enum: ['market', 'all'] }) scope!: string;
  @ApiProperty({ type: [PickerItemDto] }) items!: PickerItemDto[];
}
