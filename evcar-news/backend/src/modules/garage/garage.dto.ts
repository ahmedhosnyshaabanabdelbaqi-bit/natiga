import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
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
import { CleanText, OptionalNotNull } from '../../common/validation/decorators';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const Km = () => IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 1 });
const Nullable = () => ValidateIf((_o: unknown, v: unknown) => v !== null);

export class CreateUserVehicleDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Published trim (fixes brand, model and model year).',
  })
  @IsUUID()
  variantId!: string;

  @ApiPropertyOptional({ example: 'EG', description: 'Default: the request market.' })
  @OptionalNotNull()
  @IsString()
  @Matches(/^[A-Za-z]{2,8}$/)
  marketCode?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 100 })
  @IsOptional()
  @Nullable()
  @CleanText()
  @IsString()
  @MaxLength(100)
  nickname?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '2025-03-15' })
  @IsOptional()
  @Nullable()
  @Matches(DATE_RE)
  purchaseDate?: string | null;

  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  @IsOptional()
  @Nullable()
  @Km()
  @Min(0)
  @Max(9_999_999)
  initialOdometerKm?: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 0 })
  @IsOptional()
  @Nullable()
  @Km()
  @Min(0)
  @Max(9_999_999)
  currentOdometerKm?: number | null;

  @ApiPropertyOptional()
  @OptionalNotNull()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @IsOptional()
  @Nullable()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class UpdateUserVehicleDto {
  @ApiPropertyOptional({ format: 'uuid' }) @OptionalNotNull() @IsUUID() variantId?: string;
  @ApiPropertyOptional()
  @OptionalNotNull()
  @IsString()
  @Matches(/^[A-Za-z]{2,8}$/)
  marketCode?: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Nullable()
  @CleanText()
  @IsString()
  @MaxLength(100)
  nickname?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Nullable()
  @Matches(DATE_RE)
  purchaseDate?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Nullable()
  @Km()
  @Min(0)
  @Max(9_999_999)
  initialOdometerKm?: number | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Nullable()
  @Km()
  @Min(0)
  @Max(9_999_999)
  currentOdometerKm?: number | null;
  @ApiPropertyOptional() @OptionalNotNull() @IsBoolean() isPrimary?: boolean;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Nullable()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

class NamedRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
}

export class VariantSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty() trimName!: string;
  @ApiProperty() modelYear!: number;
  @ApiProperty() powertrainType!: string;
  @ApiProperty({ type: NamedRefDto }) brand!: NamedRefDto;
  @ApiProperty({ type: NamedRefDto }) model!: NamedRefDto;
  @ApiProperty() isPublished!: boolean;
}

class GarageStatsDto {
  @ApiProperty() chargingLogs!: number;
  @ApiProperty() openReminders!: number;
}

export class UserVehicleDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ nullable: true, type: String }) nickname!: string | null;
  @ApiProperty() displayName!: string;
  @ApiProperty({ type: VariantSummaryDto }) variant!: VariantSummaryDto;
  @ApiProperty() marketCode!: string;
  @ApiProperty() listedInMarket!: boolean;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) purchaseDate!: string | null;
  @ApiProperty({ nullable: true, type: Number }) initialOdometerKm!: number | null;
  @ApiProperty({ nullable: true, type: Number }) currentOdometerKm!: number | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) odometerUpdatedAt!:
    string | null;
  @ApiProperty() isPrimary!: boolean;
  @ApiProperty({ nullable: true, type: String }) notes!: string | null;
  @ApiProperty({ type: GarageStatsDto }) stats!: GarageStatsDto;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
