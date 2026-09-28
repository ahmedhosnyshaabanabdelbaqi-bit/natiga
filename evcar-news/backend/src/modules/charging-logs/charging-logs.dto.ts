import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/http/pagination';
import { OptionalNotNull } from '../../common/validation/decorators';

const Num = (decimals: number) =>
  IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: decimals });
const Nullable = () => ValidateIf((_o: unknown, v: unknown) => v !== null);

export const LOCATION_TYPES = ['home', 'public', 'work', 'other'] as const;
export const CURRENT_TYPES = ['AC', 'DC'] as const;

/** `YYYY-MM-DD` (whole day, UTC) or an ISO-8601 instant. */
const DATE_OR_INSTANT = /^\d{4}-\d{2}-\d{2}(T.*)?$/;

export class ChargingLogFieldsDto {
  @ApiPropertyOptional({
    nullable: true,
    format: 'uuid',
    description: 'Published station (optional).',
  })
  @IsOptional()
  @Nullable()
  @IsUUID()
  stationId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: '≥ 0; needs a currency (default: the car market currency).',
  })
  @IsOptional()
  @Nullable()
  @Num(2)
  @Min(0)
  @Max(10_000_000)
  cost?: number | null;

  @ApiPropertyOptional({ nullable: true, example: 'EGP' })
  @IsOptional()
  @Nullable()
  @Matches(/^[A-Z]{3}$/)
  currency?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Nullable()
  @Num(1)
  @Min(0)
  @Max(9_999_999)
  odometerKm?: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 0, maximum: 100 })
  @IsOptional()
  @Nullable()
  @Num(2)
  @Min(0)
  @Max(100)
  socStart?: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 0, maximum: 100 })
  @IsOptional()
  @Nullable()
  @Num(2)
  @Min(0)
  @Max(100)
  socEnd?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Nullable()
  @Num(2)
  @Min(0.01)
  @Max(100_000)
  durationMinutes?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Nullable()
  @Num(2)
  @Min(0.01)
  @Max(2000)
  chargerPowerKw?: number | null;

  @ApiPropertyOptional({ nullable: true, enum: CURRENT_TYPES })
  @IsOptional()
  @Nullable()
  @IsIn(CURRENT_TYPES)
  currentType?: 'AC' | 'DC' | null;

  @ApiPropertyOptional({ enum: LOCATION_TYPES, default: 'other' })
  @OptionalNotNull()
  @IsIn(LOCATION_TYPES)
  locationType?: (typeof LOCATION_TYPES)[number];

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @IsOptional()
  @Nullable()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class CreateChargingLogDto extends ChargingLogFieldsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() userVehicleId!: string;
  @ApiProperty({ format: 'date-time' }) @IsISO8601({ strict: true }) chargedAt!: string;
  @ApiProperty({ minimum: 0.001, maximum: 1000 }) @Num(3) @Min(0.001) @Max(1000) energyKwh!: number;
}

export class UpdateChargingLogDto extends ChargingLogFieldsDto {
  @ApiPropertyOptional({ format: 'uuid' }) @OptionalNotNull() @IsUUID() userVehicleId?: string;
  @ApiPropertyOptional({ format: 'date-time' })
  @OptionalNotNull()
  @IsISO8601({ strict: true })
  chargedAt?: string;
  @ApiPropertyOptional() @OptionalNotNull() @Num(3) @Min(0.001) @Max(1000) energyKwh?: number;
}

export class ChargingLogPeriodDto {
  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'YYYY-MM-DD (start of day UTC) or ISO instant',
  })
  @IsOptional()
  @Matches(DATE_OR_INSTANT)
  from?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'YYYY-MM-DD (inclusive, end of day UTC) or ISO instant',
  })
  @IsOptional()
  @Matches(DATE_OR_INSTANT)
  to?: string;

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() vehicleId?: string;
}

export class ListChargingLogsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @Matches(DATE_OR_INSTANT) from?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE_OR_INSTANT) to?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() vehicleId?: string;
}

class MoneyDto {
  @ApiProperty() amount!: string;
  @ApiProperty() currency!: string;
}

export class ChargingLogDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({
    type: 'object',
    properties: { id: { type: 'string' }, displayName: { type: 'string' } },
  })
  vehicle!: { id: string; displayName: string };
  @ApiProperty({
    nullable: true,
    type: 'object',
    properties: { id: { type: 'string' }, name: { type: 'string' } },
  })
  station!: { id: string; name: string } | null;
  @ApiProperty({ format: 'date-time' }) chargedAt!: string;
  @ApiProperty() energyKwh!: number;
  @ApiProperty({ nullable: true, type: MoneyDto }) cost!: MoneyDto | null;
  @ApiProperty({ nullable: true, type: MoneyDto, description: 'cost ÷ energy (4 decimals)' })
  costPerKwh!: MoneyDto | null;
  @ApiProperty({ nullable: true, type: Number }) odometerKm!: number | null;
  @ApiProperty({ nullable: true, type: Number }) socStart!: number | null;
  @ApiProperty({ nullable: true, type: Number }) socEnd!: number | null;
  @ApiProperty({ nullable: true, type: Number }) durationMinutes!: number | null;
  @ApiProperty({ nullable: true, type: Number }) chargerPowerKw!: number | null;
  @ApiProperty({ nullable: true, enum: CURRENT_TYPES }) currentType!: string | null;
  @ApiProperty({ enum: LOCATION_TYPES }) locationType!: string;
  @ApiProperty({ nullable: true, type: String }) notes!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class ChargingReportDto {
  @ApiProperty({ type: 'object', additionalProperties: true }) period!: Record<string, unknown>;
  @ApiProperty({ nullable: true, type: String }) vehicleId!: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true }) totals!: Record<string, unknown>;
  @ApiProperty({ type: 'array', items: { type: 'object' } }) byLocationType!: unknown[];
  @ApiProperty({ type: 'array', items: { type: 'object' } }) months!: unknown[];
  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description: 'See docs/decisions/backend-personal.md §3',
  })
  vehicles!: unknown[];
  @ApiProperty({ type: [String] }) notes!: string[];
}
