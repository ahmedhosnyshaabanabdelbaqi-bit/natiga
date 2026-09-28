import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
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
import { CleanText, OptionalNotNull } from '../../common/validation/decorators';

export const REMINDER_TYPES = ['maintenance', 'insurance', 'licence', 'tyres', 'custom'] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const Km = () => IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 1 });
const Nullable = () => ValidateIf((_o: unknown, v: unknown) => v !== null);

class ReminderFieldsDto {
  @ApiPropertyOptional({
    nullable: true,
    maxLength: 200,
    description: 'Required for custom; default = type label.',
  })
  @IsOptional()
  @Nullable()
  @CleanText()
  @IsString()
  @MaxLength(200)
  title?: string | null;

  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  @IsOptional()
  @Nullable()
  @IsUUID()
  userVehicleId?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @IsOptional()
  @Nullable()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '2026-12-01' })
  @IsOptional()
  @Nullable()
  @Matches(DATE_RE)
  dueDate?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Nullable()
  @Km()
  @Min(0)
  @Max(9_999_999)
  dueOdometerKm?: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 120 })
  @IsOptional()
  @Nullable()
  @IsInt()
  @Min(1)
  @Max(120)
  repeatIntervalMonths?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Nullable()
  @Km()
  @Min(1)
  @Max(1_000_000)
  repeatIntervalKm?: number | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 365, default: 7 })
  @OptionalNotNull()
  @IsInt()
  @Min(0)
  @Max(365)
  notifyDaysBefore?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Nullable()
  @Km()
  @Min(0)
  @Max(1_000_000)
  notifyKmBefore?: number | null;
}

export class CreateReminderDto extends ReminderFieldsDto {
  @ApiProperty({ enum: REMINDER_TYPES })
  @IsIn(REMINDER_TYPES)
  type!: (typeof REMINDER_TYPES)[number];
}

export class UpdateReminderDto extends ReminderFieldsDto {
  @ApiPropertyOptional({ enum: REMINDER_TYPES })
  @OptionalNotNull()
  @IsIn(REMINDER_TYPES)
  type?: (typeof REMINDER_TYPES)[number];
}

export class CompleteReminderDto {
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  completedAt?: string;
  @ApiPropertyOptional({
    description: 'Odometer at completion (next km-based due is counted from it).',
  })
  @IsOptional()
  @Km()
  @Min(0)
  @Max(9_999_999)
  odometerKm?: number;
}

export class ListRemindersQueryDto {
  @ApiPropertyOptional({ enum: ['open', 'completed', 'all'], default: 'open' })
  @IsOptional()
  @IsIn(['open', 'completed', 'all'])
  status?: 'open' | 'completed' | 'all';

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() vehicleId?: string;
}

export class ReminderDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: REMINDER_TYPES }) type!: string;
  @ApiProperty() typeLabel!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) notes!: string | null;
  @ApiProperty({ nullable: true, type: 'object', additionalProperties: true })
  vehicle!: { id: string; displayName: string; currentOdometerKm: number | null } | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) dueDate!: string | null;
  @ApiProperty({ nullable: true, type: Number }) dueOdometerKm!: number | null;
  @ApiProperty({ nullable: true, type: Number }) repeatIntervalMonths!: number | null;
  @ApiProperty({ nullable: true, type: Number }) repeatIntervalKm!: number | null;
  @ApiProperty() notifyDaysBefore!: number;
  @ApiProperty({ nullable: true, type: Number }) notifyKmBefore!: number | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) completedAt!: string | null;
  @ApiProperty({ enum: ['upcoming', 'due_soon', 'overdue', 'completed'] }) status!: string;
  @ApiProperty({ nullable: true, type: Number }) dueInDays!: number | null;
  @ApiProperty({ nullable: true, type: Number }) dueInKm!: number | null;
  @ApiProperty({
    nullable: true,
    type: String,
    format: 'date',
    description: 'Day the app should fire its local notification.',
  })
  notifyOn!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
