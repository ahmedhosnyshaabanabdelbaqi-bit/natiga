import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

/**
 * Request bodies of the public calculators. Types are checked here; ranges,
 * required values and cross-field rules are checked by the pure engine (one
 * source of truth, 422 VALIDATION_FAILED with field details either way).
 * Every numeric value is a plain JSON number in canonical units.
 */
const N = () => IsNumber({ allowNaN: false, allowInfinity: false });

export class VehicleRefDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Published catalog trim: fills missing battery / charging / consumption values from the catalog (with source notes).',
  })
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'A car of the caller’s garage (needs a Bearer token); same as variantId, in the car’s market.',
  })
  @IsOptional()
  @IsUUID()
  userVehicleId?: string;
}

/** Admin reference prices picked by the client (GET /calculators/reference-prices). */
export class ReferencePriceIdsDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() electricityPricePerKwh?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() publicPricePerKwh?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() fuelPricePerLiter?: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'charge-cost: tariff.energyPerKwh' })
  @IsOptional()
  @IsUUID()
  energyPerKwh?: string;
}

class PricedDto extends VehicleRefDto {
  @ApiPropertyOptional({
    example: 'EGP',
    description: 'ISO-4217; required unless a reference price sets it.',
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    example: '2026-09-01',
    description: 'Date of the entered prices (YYYY-MM-DD).',
  })
  @IsOptional()
  @IsString()
  priceDate?: string;

  @ApiPropertyOptional({ type: ReferencePriceIdsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ReferencePriceIdsDto)
  referencePriceIds?: ReferencePriceIdsDto;
}

export class ChargeCostTariffDto {
  @ApiPropertyOptional() @IsOptional() @N() energyPerKwh?: number;
  @ApiPropertyOptional() @IsOptional() @N() timePerMinute?: number;
  @ApiPropertyOptional() @IsOptional() @N() timePerHour?: number;
  @ApiPropertyOptional() @IsOptional() @N() sessionFee?: number;
  @ApiPropertyOptional() @IsOptional() @N() parkingPerMinute?: number;
  @ApiPropertyOptional() @IsOptional() @N() parkingPerHour?: number;
  @ApiPropertyOptional() @IsOptional() @N() parkingFlat?: number;
  @ApiPropertyOptional() @IsOptional() @N() idlePerMinute?: number;
  @ApiPropertyOptional() @IsOptional() @N() idlePerHour?: number;
  @ApiPropertyOptional() @IsOptional() @N() idleGraceMinutes?: number;
}

export class ChargeCostDto extends PricedDto {
  @ApiPropertyOptional({ description: 'kWh (usable, not gross)' })
  @IsOptional()
  @N()
  batteryUsableKwh?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 100 }) @IsOptional() @N() fromSocPercent?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 100 }) @IsOptional() @N() toSocPercent?: number;
  @ApiPropertyOptional({ description: 'Alternative to capacity + SoC.' })
  @IsOptional()
  @N()
  energyKwh?: number;
  @ApiPropertyOptional({ enum: ['battery', 'grid'], default: 'battery' })
  @IsOptional()
  @IsIn(['battery', 'grid'])
  energyBasis?: 'battery' | 'grid';
  @ApiPropertyOptional({ description: '(0, 1], default 0.9' })
  @IsOptional()
  @N()
  efficiency?: number;
  @ApiPropertyOptional({ type: ChargeCostTariffDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ChargeCostTariffDto)
  tariff?: ChargeCostTariffDto;
  @ApiPropertyOptional() @IsOptional() @N() chargingMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @N() parkingMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @N() idleMinutes?: number;
}

export class CurvePointDto {
  @ApiProperty() @N() socPercent!: number;
  @ApiProperty() @N() powerKw!: number;
}

export class ChargeTimeDto extends VehicleRefDto {
  @ApiPropertyOptional({ enum: ['AC', 'DC'] }) @IsOptional() @IsIn(['AC', 'DC']) currentType?:
    'AC' | 'DC';
  @ApiPropertyOptional() @IsOptional() @N() batteryUsableKwh?: number;
  @ApiPropertyOptional() @IsOptional() @N() fromSocPercent?: number;
  @ApiPropertyOptional() @IsOptional() @N() toSocPercent?: number;
  @ApiPropertyOptional() @IsOptional() @N() efficiency?: number;
  @ApiPropertyOptional() @IsOptional() @N() stationPowerKw?: number;
  @ApiPropertyOptional() @IsOptional() @N() vehicleAcMaxKw?: number;
  @ApiPropertyOptional({ enum: [1, 3] }) @IsOptional() @N() supplyPhases?: number;
  @ApiPropertyOptional() @IsOptional() @N() supplyAmps?: number;
  @ApiPropertyOptional({ default: 230 }) @IsOptional() @N() supplyVoltsPerPhase?: number;
  @ApiPropertyOptional() @IsOptional() @N() vehicleDcPeakKw?: number;
  @ApiPropertyOptional({ type: [CurvePointDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(202)
  @ValidateNested({ each: true })
  @Type(() => CurvePointDto)
  curve?: CurvePointDto[];
}

export class ElectricUseDto extends PricedDto {
  @ApiPropertyOptional() @IsOptional() @N() consumptionKwhPer100km?: number;
  @ApiPropertyOptional() @IsOptional() @N() consumptionWhPerKm?: number;
  @ApiPropertyOptional({ enum: ['grid', 'battery'], default: 'grid' })
  @IsOptional()
  @IsIn(['grid', 'battery'])
  consumptionBasis?: 'grid' | 'battery';
  @ApiPropertyOptional() @IsOptional() @N() efficiency?: number;
  @ApiPropertyOptional() @IsOptional() @N() electricityPricePerKwh?: number;
  @ApiPropertyOptional() @IsOptional() @N() publicPricePerKwh?: number;
  @ApiPropertyOptional() @IsOptional() @N() publicSharePercent?: number;
}

export class CostPer100kmDto extends ElectricUseDto {}

export class MonthlyCostDto extends ElectricUseDto {
  @ApiPropertyOptional() @IsOptional() @N() kmPerMonth?: number;
  @ApiPropertyOptional() @IsOptional() @N() kmPerDay?: number;
  @ApiPropertyOptional() @IsOptional() @N() fixedMonthlyFees?: number;
}

export class VsFuelDto extends ElectricUseDto {
  @ApiPropertyOptional() @IsOptional() @N() fuelConsumptionLPer100km?: number;
  @ApiPropertyOptional() @IsOptional() @N() fuelPricePerLiter?: number;
  @ApiPropertyOptional() @IsOptional() @N() kmPerMonth?: number;
  @ApiPropertyOptional() @IsOptional() @N() kmPerDay?: number;
}

export class OwnershipCostsDto {
  @ApiPropertyOptional() @IsOptional() @N() purchasePrice?: number;
  @ApiPropertyOptional() @IsOptional() @N() incentives?: number;
  @ApiPropertyOptional() @IsOptional() @N() residualValue?: number;
  @ApiPropertyOptional() @IsOptional() @N() insurancePerYear?: number;
  @ApiPropertyOptional() @IsOptional() @N() maintenancePerYear?: number;
  @ApiPropertyOptional() @IsOptional() @N() feesPerYear?: number;
  @ApiPropertyOptional() @IsOptional() @N() oneOffCosts?: number;
}

export class FuelCarCostsDto extends OwnershipCostsDto {
  @ApiPropertyOptional() @IsOptional() @N() fuelConsumptionLPer100km?: number;
  @ApiPropertyOptional() @IsOptional() @N() fuelPricePerLiter?: number;
}

export class TcoDto extends ElectricUseDto {
  @ApiPropertyOptional() @IsOptional() @N() years?: number;
  @ApiPropertyOptional() @IsOptional() @N() kmPerYear?: number;
  @ApiPropertyOptional({ type: OwnershipCostsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => OwnershipCostsDto)
  ev?: OwnershipCostsDto;
  @ApiPropertyOptional({ type: FuelCarCostsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => FuelCarCostsDto)
  fuelCar?: FuelCarCostsDto;
}

// ---- responses ---------------------------------------------------------------------------

export class CalcStepDto {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiProperty() expression!: string;
  @ApiProperty({ nullable: true, oneOf: [{ type: 'number' }, { type: 'string' }] }) value!:
    number | string | null;
  @ApiProperty({ nullable: true, type: String }) unit!: string | null;
}

export class CalcAssumptionDto {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ nullable: true }) value!: number | string | boolean | null;
  @ApiProperty({ nullable: true, type: String }) unit!: string | null;
  @ApiProperty({ enum: ['user', 'default', 'catalog', 'reference_price'] }) origin!: string;
  @ApiProperty({ nullable: true, type: String }) note!: string | null;
}

export class CalcWarningDto {
  @ApiProperty() code!: string;
  @ApiProperty() message!: string;
}

export class CalcOutputDto {
  @ApiProperty({ example: 'charge-cost' }) calculator!: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Calculator-specific result (see docs/decisions/backend-personal.md).',
  })
  result!: Record<string, unknown>;
  @ApiProperty() formula!: string;
  @ApiProperty({ type: [CalcStepDto] }) steps!: CalcStepDto[];
  @ApiProperty({ type: [CalcAssumptionDto] }) assumptions!: CalcAssumptionDto[];
  @ApiProperty({ type: [CalcWarningDto] }) warnings!: CalcWarningDto[];
  @ApiProperty({ enum: ['high', 'medium', 'low'] }) confidence!: string;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } }) units!: Record<
    string,
    string
  >;
  @ApiProperty() disclaimer!: string;
  @ApiProperty({
    nullable: true,
    type: 'object',
    additionalProperties: true,
    description: 'Catalog trim used to fill values (null when none).',
  })
  vehicle!: { variantId: string; marketCode: string; name: string } | null;
}

export class MoneyDto {
  @ApiProperty({ example: '2.1500' }) amount!: string;
  @ApiProperty({ example: 'EGP' }) currency!: string;
}

export class ReferencePriceSourceDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) publisher!: string | null;
  @ApiProperty({ nullable: true, type: String }) url!: string | null;
}

export class ReferencePriceDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() marketCode!: string;
  @ApiProperty({
    enum: [
      'electricity_residential',
      'electricity_commercial',
      'electricity_public_ac',
      'electricity_public_dc',
      'gasoline_80',
      'gasoline_92',
      'gasoline_95',
      'diesel',
    ],
  })
  energyType!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ type: MoneyDto }) price!: MoneyDto;
  @ApiProperty({ enum: ['per_kwh', 'per_liter'] }) unit!: string;
  @ApiProperty({
    format: 'date',
    description: 'Price valid from this date — show it next to the price.',
  })
  effectiveFrom!: string;
  @ApiProperty({ format: 'date', nullable: true, type: String }) effectiveTo!: string | null;
  @ApiProperty({ nullable: true, type: ReferencePriceSourceDto })
  source!: ReferencePriceSourceDto | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) verifiedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) notes!: string | null;
  @ApiProperty({ description: 'Days since effectiveFrom.' }) ageDays!: number;
  @ApiProperty({ description: 'True when older than 365 days: show "may be outdated".' })
  possiblyOutdated!: boolean;
  @ApiProperty() isDemo!: boolean;
}
