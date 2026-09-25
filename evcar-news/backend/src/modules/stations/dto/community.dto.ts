import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination';
import { CleanText } from '../../../common/validation/decorators';
import { localizedMessage } from '../../../common/validation/messages';
import { ACCESS_TYPE_VALUES, CURRENT_TYPES } from './public.dto';

export const REPORT_TYPE_VALUES = [
  'not_working',
  'wrong_location',
  'different_connector',
  'price_changed',
  'access_restricted',
  'other',
] as const;
export const CHECKIN_OUTCOME_VALUES = [
  'charged_successfully',
  'waited_then_charged',
  'could_not_charge',
  'other',
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_MESSAGE = localizedMessage({ ar: 'معرّف غير صالح.', en: 'Invalid id.' });
const CODE_RE = /^[a-z][a-z0-9_]{1,31}$/;

export class ReportSuggestedDataDto {
  @ApiPropertyOptional({ description: 'Correct latitude (wrong_location).' })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({ description: 'Connector type seen on site (different_connector).' })
  @IsOptional()
  @IsString()
  @Matches(CODE_RE)
  connectorTypeCode?: string;

  @ApiPropertyOptional({ enum: CURRENT_TYPES })
  @IsOptional()
  @IsIn(CURRENT_TYPES)
  currentType?: 'AC' | 'DC';

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.1)
  @Max(2000)
  maxPowerKw?: number;

  @ApiPropertyOptional({ description: 'Price as seen on site, free text (price_changed).' })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(200)
  priceText?: string;
}

export class CreateStationReportDto {
  @ApiProperty({ enum: REPORT_TYPE_VALUES })
  @IsIn(REPORT_TYPE_VALUES)
  type!: (typeof REPORT_TYPE_VALUES)[number];

  @ApiPropertyOptional({ format: 'uuid', description: 'Connector concerned (optional).' })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { context: UUID_MESSAGE })
  connectorId?: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'Required when the reason needs details.' })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ type: ReportSuggestedDataDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ReportSuggestedDataDto)
  suggestedData?: ReportSuggestedDataDto;
}

export class CreateStationCheckinDto {
  @ApiProperty({ enum: CHECKIN_OUTCOME_VALUES })
  @IsIn(CHECKIN_OUTCOME_VALUES)
  outcome!: (typeof CHECKIN_OUTCOME_VALUES)[number];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { context: UUID_MESSAGE })
  connectorId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Catalog trim used (public).' })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { context: UUID_MESSAGE })
  variantId?: string;

  @ApiPropertyOptional({ description: 'Power seen during charging (kW).' })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0.1)
  @Max(2000)
  observedPowerKw?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1440 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  waitMinutes?: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class SuggestedConnectorDto {
  @ApiProperty({ example: 'ccs2' })
  @IsString()
  @Matches(CODE_RE)
  connectorTypeCode!: string;

  @ApiProperty({ enum: CURRENT_TYPES })
  @IsIn(CURRENT_TYPES)
  currentType!: 'AC' | 'DC';

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.1)
  @Max(2000)
  maxPowerKw?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  quantity?: number;
}

export class CreateStationSuggestionDto {
  @ApiProperty({ maxLength: 300 })
  @CleanText()
  @IsString()
  @Length(2, 300)
  name!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(200)
  operatorName?: string;

  @ApiProperty()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(500)
  addressText?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiProperty({ example: 'EG' })
  @IsString()
  @Matches(/^[A-Z]{2}$/, {
    context: localizedMessage({
      ar: 'رمز الدولة من حرفين (EG).',
      en: 'Two-letter country code (EG).',
    }),
  })
  countryCode!: string;

  @ApiPropertyOptional({ enum: ACCESS_TYPE_VALUES })
  @IsOptional()
  @IsIn(ACCESS_TYPE_VALUES)
  accessType?: (typeof ACCESS_TYPE_VALUES)[number];

  @ApiPropertyOptional({ type: [SuggestedConnectorDto], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SuggestedConnectorDto)
  connectors?: SuggestedConnectorDto[];

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(500)
  openingHoursText?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class MyListQueryDto extends PaginationQueryDto {}

// --- responses --------------------------------------------------------------------------

export class MyReportDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) stationId!: string;
  @ApiProperty() stationName!: string;
  @ApiProperty({ enum: REPORT_TYPE_VALUES }) type!: string;
  @ApiProperty() typeLabel!: string;
  @ApiProperty({ enum: ['open', 'in_review', 'resolved', 'rejected'] }) status!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) resolvedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) resolutionNote!: string | null;
}

export class MyCheckinDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) stationId!: string;
  @ApiProperty({ enum: CHECKIN_OUTCOME_VALUES }) outcome!: string;
  @ApiProperty({ nullable: true, type: String }) connectorId!: string | null;
  @ApiProperty({ nullable: true, type: String }) variantId!: string | null;
  @ApiProperty({ nullable: true, type: Number }) observedPowerKw!: number | null;
  @ApiProperty({ nullable: true, type: Number }) waitMinutes!: number | null;
  @ApiProperty({ nullable: true, type: String }) comment!: string | null;
  @ApiProperty({ enum: ['pending', 'approved', 'rejected', 'hidden'] }) status!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class MySuggestionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['pending', 'approved', 'rejected', 'duplicate', 'withdrawn'] })
  status!: string;
  @ApiProperty() name!: string;
  @ApiProperty() latitude!: number;
  @ApiProperty() longitude!: number;
  @ApiProperty() countryCode!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) reviewedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) reviewNote!: string | null;
  @ApiProperty({ nullable: true, type: String }) createdStationId!: string | null;
  @ApiProperty({ nullable: true, type: String }) duplicateOfStationId!: string | null;
}

export class NearbyStationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() distanceM!: number;
}

export class SuggestionCreatedDto {
  @ApiProperty({ type: MySuggestionDto }) suggestion!: MySuggestionDto;
  @ApiProperty({ type: [NearbyStationDto], description: 'Published stations within 150 m.' })
  possibleDuplicates!: NearbyStationDto[];
}
