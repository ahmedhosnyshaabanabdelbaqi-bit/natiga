import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { BodyType, PowertrainType } from '../../../generated/prisma/enums';
import { MarketCode } from '../../comparisons/common/validators';
import { BrandRefDto, ModelRefDto } from '../../vehicles/dto/public.dto';
import { ImageDto, MoneyDto, PriceDto } from '../../vehicles/dto/shared.dto';
import { FACTORS } from '../engine/types';

const BODY_TYPES = Object.values(BodyType);
const POWERTRAINS = Object.values(PowertrainType);
export const DEFAULT_POWERTRAINS = ['BEV', 'PHEV', 'EREV'];

const Weight = () =>
  applyDecorators(
    ApiPropertyOptional({ minimum: 0, maximum: 10, description: 'Relative weight (0 = ignore).' }),
    IsOptional(),
    IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 3 }),
    Min(0),
    Max(10),
  );

export class RecommendationWeightsDto {
  @Weight() price?: number;
  @Weight() range?: number;
  @Weight() dcCharging?: number;
  @Weight() acCharging?: number;
  @Weight() efficiency?: number;
  @Weight() space?: number;
  @Weight() performance?: number;
}

export class RecommendationRequestDto {
  @ApiPropertyOptional({ example: 'EG', description: 'Defaults to the request market.' })
  @IsOptional()
  @MarketCode()
  market?: string;

  @ApiProperty({ example: 1800000, description: 'Maximum price in the market currency.' })
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(1)
  @Max(1_000_000_000_000)
  budget!: number;

  @ApiProperty({ example: 45, description: 'Typical daily distance in km.' })
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 1 })
  @Min(0)
  @Max(2000)
  dailyKm!: number;

  @ApiProperty({ example: 2, description: 'Long trips (beyond one charge) per month.' })
  @IsInt()
  @Min(0)
  @Max(60)
  longTripsPerMonth!: number;

  @ApiProperty({ example: true, description: 'Can charge at home.' })
  @IsBoolean()
  homeCharging!: boolean;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(1)
  @Max(9)
  seatsNeeded!: number;

  @ApiPropertyOptional({ enum: BODY_TYPES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(BODY_TYPES.length)
  @IsIn(BODY_TYPES, { each: true })
  bodyTypes?: string[];

  @ApiPropertyOptional({ enum: POWERTRAINS, isArray: true, default: DEFAULT_POWERTRAINS })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(POWERTRAINS.length)
  @IsIn(POWERTRAINS, { each: true })
  powertrains?: string[];

  @ApiPropertyOptional({
    type: RecommendationWeightsDto,
    description: 'Override default weights per factor (others keep their defaults).',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RecommendationWeightsDto)
  weights?: RecommendationWeightsDto;

  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

// --- response ---------------------------------------------------------------------------

export class RecommendationCarDto {
  @ApiProperty({ description: '"variantId@MARKET"' }) key!: string;
  @ApiProperty({ format: 'uuid' }) variantId!: string;
  @ApiProperty() variantSlug!: string;
  @ApiProperty({ format: 'uuid' }) modelYearId!: string;
  @ApiProperty() modelYear!: number;
  @ApiProperty({ example: 'BYD Seal 2025 Design AWD' }) title!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: BrandRefDto }) brand!: BrandRefDto;
  @ApiProperty({ type: ModelRefDto }) model!: ModelRefDto;
  @ApiProperty({ enum: POWERTRAINS }) powertrainType!: string;
  @ApiProperty({ nullable: true, type: String }) bodyType!: string | null;
  @ApiProperty({ nullable: true, type: Number }) seats!: number | null;
  @ApiProperty() availability!: string;
  @ApiProperty({ nullable: true, type: ImageDto }) image!: ImageDto | null;
  @ApiProperty({ nullable: true, type: PriceDto }) price!: PriceDto | null;
  @ApiProperty() isDemo!: boolean;
}

export class FactorWeightDto {
  @ApiProperty({ enum: FACTORS }) factor!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ description: 'Normalized (all weights sum to 1).' }) weight!: number;
  @ApiProperty() raw!: number;
  @ApiProperty({ enum: ['default', 'usage', 'user'] }) source!: string;
  @ApiProperty({ enum: ['higher', 'lower'] }) betterDirection!: string;
  @ApiProperty() description!: string;
}

export class ContributionDto {
  @ApiProperty({ enum: FACTORS }) factor!: string;
  @ApiProperty() label!: string;
  @ApiProperty() weight!: number;
  @ApiProperty({ description: '0..1 position among the ranked cars (1 = best).' }) score!: number;
  @ApiProperty({ description: 'weight × score × 100; the car score is the sum.' }) points!: number;
  @ApiProperty({ nullable: true, type: Number }) value!: number | null;
  @ApiProperty({ nullable: true, type: String }) unit!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'e.g. cycle "WLTP" or "peak".' })
  basis!: string | null;
}

export class ReasonDto {
  @ApiProperty({ enum: [...FACTORS, 'fit'] }) factor!: string;
  @ApiProperty({ example: 'RANGE_COVERS_DAYS' }) code!: string;
  @ApiProperty({ enum: ['positive', 'neutral', 'negative'] }) sentiment!: string;
  @ApiProperty({ description: 'Localized sentence (request language).' }) text!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) params!: Record<string, unknown>;
}

export class RankedCarDto {
  @ApiProperty() rank!: number;
  @ApiProperty() key!: string;
  @ApiProperty({ type: RecommendationCarDto }) car!: RecommendationCarDto;
  @ApiProperty({ description: '0–100' }) score!: number;
  @ApiProperty({ type: [ContributionDto] }) contributions!: ContributionDto[];
  @ApiProperty({ type: [ReasonDto] }) reasons!: ReasonDto[];
  @ApiProperty({ enum: [false] }) sponsored!: false;
}

export class MissingItemDto {
  @ApiProperty({ enum: [...FACTORS, 'seats'] }) factor!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ enum: ['missing', 'cycle_mismatch', 'mode_mismatch'] }) reason!: string;
  @ApiProperty() detail!: string;
}

export class NotRankedCarDto {
  @ApiProperty() key!: string;
  @ApiProperty({ type: RecommendationCarDto }) car!: RecommendationCarDto;
  @ApiProperty({
    enum: ['missing_data', 'not_comparable', 'price_not_available', 'seats_not_available'],
  })
  reason!: string;
  @ApiProperty({ type: [MissingItemDto] }) missingData!: MissingItemDto[];
  @ApiProperty() explanation!: string;
}

export class DecisionDto {
  @ApiProperty() decisive!: boolean;
  @ApiProperty({
    nullable: true,
    type: String,
    enum: [
      'no_candidates',
      'no_comparable_candidates',
      'fewer_than_two_comparable',
      'scores_too_close',
    ],
  })
  reason!: string | null;
  @ApiProperty() message!: string;
  @ApiProperty({ nullable: true, type: String }) topPickKey!: string | null;
}

export class ExcludedDto {
  @ApiProperty() total!: number;
  @ApiProperty() overBudget!: number;
  @ApiProperty() seatsTooFew!: number;
  @ApiProperty() bodyType!: number;
  @ApiProperty() powertrain!: number;
}

export class FactorAvailabilityDto {
  @ApiProperty({ enum: FACTORS }) factor!: string;
  @ApiProperty() label!: string;
  @ApiProperty() available!: number;
  @ApiProperty() missing!: number;
  @ApiProperty() notComparable!: number;
  @ApiProperty({ nullable: true, type: String }) suggestion!: string | null;
}

export class RecommendationBasisDto {
  @ApiProperty({ nullable: true, type: String, example: 'WLTP' }) rangeCycle!: string | null;
  @ApiProperty({ nullable: true, type: String }) consumptionCycle!: string | null;
  @ApiProperty({ nullable: true, type: String }) consumptionMode!: string | null;
  @ApiProperty({ example: 'EGP' }) currency!: string;
}

export class RecommendationMarketDto {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() currencyCode!: string;
}

export class RecommendationInputEchoDto {
  @ApiProperty({ type: MoneyDto }) budget!: MoneyDto;
  @ApiProperty() dailyKm!: number;
  @ApiProperty() longTripsPerMonth!: number;
  @ApiProperty() homeCharging!: boolean;
  @ApiProperty() seatsNeeded!: number;
  @ApiProperty({ nullable: true, type: [String] }) bodyTypes!: string[] | null;
  @ApiProperty({ type: [String] }) powertrains!: string[];
}

export class RecommendationResultDto {
  @ApiProperty({ type: RecommendationMarketDto }) market!: RecommendationMarketDto;
  @ApiProperty({ type: RecommendationInputEchoDto }) input!: RecommendationInputEchoDto;
  @ApiProperty({ type: [FactorWeightDto] }) weights!: FactorWeightDto[];
  @ApiProperty({ type: [String] }) weightNotes!: string[];
  @ApiProperty({ type: RecommendationBasisDto }) basis!: RecommendationBasisDto;
  @ApiProperty({ type: DecisionDto }) decision!: DecisionDto;
  @ApiProperty({ type: [RankedCarDto] }) ranked!: RankedCarDto[];
  @ApiProperty({ type: [NotRankedCarDto] }) notRanked!: NotRankedCarDto[];
  @ApiProperty({ type: ExcludedDto }) excluded!: ExcludedDto;
  @ApiProperty({ type: [FactorAvailabilityDto] }) factorAvailability!: FactorAvailabilityDto[];
  @ApiProperty() candidatesConsidered!: number;
  @ApiProperty({ type: [String] }) notes!: string[];
  @ApiProperty({ enum: [false], description: 'Always false: sponsorship never affects scoring.' })
  sponsored!: false;
  @ApiProperty() disclosure!: string;
  @ApiProperty() notAvailableLabel!: string;
  @ApiProperty({ format: 'date-time' }) generatedAt!: string;
}
