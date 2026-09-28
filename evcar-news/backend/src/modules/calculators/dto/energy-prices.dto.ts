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
import { PaginationQueryDto } from '../../../common/http/pagination';
import { CleanText, OptionalNotNull } from '../../../common/validation/decorators';
import { ENERGY_TYPES } from '../energy-prices.service';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class AdminEnergyPriceQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'EG' }) @IsOptional() @IsString() @MaxLength(8) market?: string;
  @ApiPropertyOptional({ enum: ENERGY_TYPES })
  @IsOptional()
  @IsIn(ENERGY_TYPES)
  energyType?: (typeof ENERGY_TYPES)[number];
}

export class CreateEnergyPriceDto {
  @ApiProperty({ example: 'EG' }) @IsString() @Matches(/^[A-Za-z]{2,8}$/) marketCode!: string;
  @ApiProperty({
    enum: ENERGY_TYPES,
    description: 'Unit follows the type: electricity → per_kwh, fuels → per_liter.',
  })
  @IsIn(ENERGY_TYPES)
  energyType!: (typeof ENERGY_TYPES)[number];
  @ApiProperty({ example: 2.14 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1e7)
  price!: number;
  @ApiProperty({ example: 'EGP' }) @Matches(/^[A-Z]{3}$/) currency!: string;
  @ApiProperty({ example: '2026-08-01' }) @Matches(DATE_RE) effectiveFrom!: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Matches(DATE_RE) effectiveTo?:
    string | null;
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'specification_sources id (tariff decree, official site...)',
  })
  @IsOptional()
  @IsUUID()
  sourceId?: string | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601()
  verifiedAt?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class UpdateEnergyPriceDto {
  @ApiPropertyOptional()
  @OptionalNotNull()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1e7)
  price?: number;
  @ApiPropertyOptional() @OptionalNotNull() @Matches(/^[A-Z]{3}$/) currency?: string;
  @ApiPropertyOptional() @OptionalNotNull() @Matches(DATE_RE) effectiveFrom?: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Matches(DATE_RE)
  effectiveTo?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  sourceId?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsISO8601()
  verifiedAt?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @CleanText()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
