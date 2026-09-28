import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/http/pagination';
import { CleanText } from '../../common/validation/decorators';

const N = () => IsNumber({ allowNaN: false, allowInfinity: false });

export class TripPointDto {
  @ApiProperty({ example: 30.0444 }) @N() @IsLatitude() lat!: number;
  @ApiProperty({ example: 31.2357 }) @N() @IsLongitude() lng!: number;
  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(300)
  label?: string;
}

export class TripAssumptionsDto {
  @ApiPropertyOptional({ description: 'Overrides the catalog consumption (kWh/100 km).' })
  @IsOptional()
  @N()
  @Min(5)
  @Max(100)
  consumptionKwhPer100km?: number;

  @ApiPropertyOptional({ description: 'Overrides the catalog usable battery (kWh).' })
  @IsOptional()
  @N()
  @Min(5)
  @Max(300)
  batteryUsableKwh?: number;

  @ApiPropertyOptional({
    default: 10,
    description: 'Extra consumption for speed / climate / load (%).',
  })
  @IsOptional()
  @N()
  @Min(0)
  @Max(100)
  consumptionMarginPercent?: number;

  @ApiPropertyOptional({ default: 80, description: 'Maximum SoC to charge to at a stop.' })
  @IsOptional()
  @N()
  @Min(20)
  @Max(100)
  chargeToSocPercent?: number;

  @ApiPropertyOptional({
    default: 10,
    description: 'Max distance of a station from the route (km).',
  })
  @IsOptional()
  @N()
  @Min(0.5)
  @Max(30)
  corridorKm?: number;

  @ApiPropertyOptional({
    default: 0.9,
    description: 'Charging efficiency (0, 1] for grid energy / cost.',
  })
  @IsOptional()
  @N()
  @Min(0.5)
  @Max(1)
  efficiency?: number;

  @ApiPropertyOptional({
    description: 'Optional price per kWh at public chargers for the approximate cost (no default).',
  })
  @IsOptional()
  @N()
  @Min(0)
  @Max(1e6)
  electricityPricePerKwh?: number;

  @ApiPropertyOptional({ example: 'EGP' }) @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string;
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  priceDate?: string;
}

export class PlanTripDto {
  @ApiProperty({ type: TripPointDto })
  @IsObject()
  @ValidateNested()
  @Type(() => TripPointDto)
  origin!: TripPointDto;
  @ApiProperty({ type: TripPointDto })
  @IsObject()
  @ValidateNested()
  @Type(() => TripPointDto)
  destination!: TripPointDto;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'A car of the caller’s garage (needs a token).',
  })
  @IsOptional()
  @IsUUID()
  userVehicleId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'A published catalog trim (in the request market).',
  })
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @ApiProperty({ minimum: 1, maximum: 100 }) @N() @Min(1) @Max(100) currentSocPercent!: number;
  @ApiProperty({
    minimum: 0,
    maximum: 60,
    description: 'Kept at every arrival (stops and destination).',
  })
  @N()
  @Min(0)
  @Max(60)
  minArrivalSocPercent!: number;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Default: now. Used for opening hours at arrival.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  departureAt?: string;

  @ApiPropertyOptional({ type: TripAssumptionsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TripAssumptionsDto)
  assumptions?: TripAssumptionsDto;

  @ApiPropertyOptional({ description: 'Save the plan to "my trips" (signed in only).' })
  @IsOptional()
  @IsBoolean()
  save?: boolean;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(200)
  title?: string;
}

export class ListTripsQueryDto extends PaginationQueryDto {}
