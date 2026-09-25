/**
 * Admin stations API (permission-guarded, audited). See
 * docs/decisions/backend-stations.md §2.
 */
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination';
import { CleanText, OptionalNotNull } from '../../../common/validation/decorators';
import { localizedMessage } from '../../../common/validation/messages';
import {
  ACCESS_TYPE_VALUES,
  CURRENT_TYPES,
  DATA_SOURCE_VALUES,
  OPERATIONAL_STATUS_VALUES,
  PUBLICATION_STATUS_VALUES,
} from './public.dto';
import { CHECKIN_OUTCOME_VALUES, REPORT_TYPE_VALUES } from './community.dto';
import {
  CodeArray,
  DecimalString,
  HHMM_END_RE,
  HHMM_MESSAGE,
  HHMM_RE,
  Nullable,
  QueryBool,
  QueryList,
} from './validators';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_MESSAGE = localizedMessage({ ar: 'معرّف غير صالح.', en: 'Invalid id.' });
const COUNTRY_MESSAGE = localizedMessage({
  ar: 'رمز الدولة من حرفين كبيرين (EG).',
  en: 'Two-letter upper-case country code (EG).',
});
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const URL_OPTS = { protocols: ['http', 'https'], require_protocol: true };

export const REPORT_STATUS_VALUES = ['open', 'in_review', 'resolved', 'rejected'] as const;
export const MODERATION_STATUS_VALUES = ['pending', 'approved', 'rejected', 'hidden'] as const;
export const SUGGESTION_STATUS_VALUES = [
  'pending',
  'approved',
  'rejected',
  'duplicate',
  'withdrawn',
] as const;
export const DUPLICATE_STATUS_VALUES = ['pending', 'merged', 'not_duplicate'] as const;
export const RELIABILITY_VALUES = [
  'verified',
  'manufacturer_claim',
  'estimated',
  'unverified',
  'disputed',
] as const;
export const TARIFF_COMPONENT_VALUES = ['energy', 'time', 'flat', 'parking_time', 'idle'] as const;
export const PRICE_UNIT_VALUES = ['per_kwh', 'per_minute', 'per_hour', 'per_session'] as const;

// --- stations ------------------------------------------------------------------------------

export class AdminStationListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Name / address / city (Arabic-normalized).' })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: PUBLICATION_STATUS_VALUES, isArray: true })
  @QueryList(PUBLICATION_STATUS_VALUES)
  publicationStatus?: string[];

  @ApiPropertyOptional({ enum: OPERATIONAL_STATUS_VALUES, isArray: true })
  @QueryList(OPERATIONAL_STATUS_VALUES)
  operationalStatus?: string[];

  @ApiPropertyOptional({ enum: DATA_SOURCE_VALUES, isArray: true })
  @QueryList(DATA_SOURCE_VALUES)
  dataSource?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[A-Z]{2}$/) countryCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[A-Z]{2,8}$/) marketCode?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { context: UUID_MESSAGE })
  operatorId?: string;

  @ApiPropertyOptional() @QueryBool() isDemo?: boolean;
  @ApiPropertyOptional({ description: 'Only stations with open / in-review reports.' })
  @QueryBool()
  hasOpenReports?: boolean;
  @ApiPropertyOptional({ description: 'Include merged duplicates and deleted stations.' })
  @QueryBool()
  includeMerged?: boolean;
}

export class CreateStationDto {
  @ApiProperty({ maxLength: 300 }) @CleanText() @IsString() @Length(2, 300) name!: string;
  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(300) nameAr?:
    string | null;
  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(300) nameEn?:
    string | null;

  @ApiPropertyOptional({ description: 'Stable URL slug (lower-case, dashes).' })
  @Nullable()
  @IsString()
  @MaxLength(200)
  @Matches(SLUG_RE)
  slug?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @Nullable()
  @IsString()
  @Matches(UUID_RE, { context: UUID_MESSAGE })
  operatorId?: string | null;

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

  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(500) addressLine?:
    string | null;
  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(500) addressAr?:
    string | null;
  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(500) addressEn?:
    string | null;
  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(120) city?: string | null;
  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(120) region?:
    string | null;
  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(20) postalCode?:
    string | null;

  @ApiProperty({ example: 'EG' })
  @IsString()
  @Matches(/^[A-Z]{2}$/, { context: COUNTRY_MESSAGE })
  countryCode!: string;

  @ApiPropertyOptional({
    example: 'EG',
    description: 'Defaults to the market with the country code.',
  })
  @Nullable()
  @IsString()
  @Matches(/^[A-Z]{2,8}$/)
  marketCode?: string | null;

  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(1000) accessEntranceNote?:
    string | null;

  @ApiPropertyOptional({ enum: ACCESS_TYPE_VALUES })
  @OptionalNotNull()
  @IsIn(ACCESS_TYPE_VALUES)
  accessType?: (typeof ACCESS_TYPE_VALUES)[number];

  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(2000) accessRestrictions?:
    string | null;

  @ApiPropertyOptional({
    description:
      'Weekly schedule {"mon":[["08:00","22:00"]],"fri":[]} — [] closed, missing day unknown, end < start = past midnight, "24:00" allowed. Must be null when isAlwaysOpen = true.',
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  @Nullable()
  @IsObject()
  openingHours?: Record<string, unknown> | null;

  @ApiPropertyOptional({ nullable: true, type: Boolean })
  @Nullable()
  @IsBoolean()
  isAlwaysOpen?: boolean | null;

  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(500) openingHoursText?:
    string | null;

  @ApiPropertyOptional({
    example: 'Africa/Cairo',
    description: 'IANA; default = market time zone.',
  })
  @OptionalNotNull()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(50) phone?: string | null;
  @ApiPropertyOptional() @Nullable() @IsString() @MaxLength(320) email?: string | null;

  @ApiPropertyOptional()
  @Nullable()
  @IsString()
  @MaxLength(2048)
  @IsUrl(URL_OPTS)
  websiteUrl?: string | null;

  @ApiPropertyOptional({ type: [String], example: ['app', 'rfid'] })
  @OptionalNotNull()
  @CodeArray()
  paymentMethods?: string[];

  @ApiPropertyOptional({ type: [String], example: ['app'] })
  @OptionalNotNull()
  @CodeArray()
  startMethods?: string[];

  @ApiPropertyOptional({ type: [String], example: ['restroom', 'cafe'] })
  @OptionalNotNull()
  @CodeArray()
  amenities?: string[];

  @ApiPropertyOptional({ enum: OPERATIONAL_STATUS_VALUES })
  @OptionalNotNull()
  @IsIn(OPERATIONAL_STATUS_VALUES)
  operationalStatus?: (typeof OPERATIONAL_STATUS_VALUES)[number];

  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(200) dataLicense?:
    string | null;
  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(1000) attribution?:
    string | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  @Nullable()
  @IsInt()
  @Min(1)
  @Max(1000)
  publishedPointCount?: number | null;

  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(1000) usageCostText?:
    string | null;

  @ApiPropertyOptional({ format: 'date-time', description: 'Default: now (verified by staff).' })
  @Nullable()
  @IsISO8601({ strict: true })
  lastVerifiedAt?: string | null;

  @ApiPropertyOptional({
    default: false,
    description: 'Publish immediately (needs stations.publish); default draft.',
  })
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}

export class UpdateStationDto extends PartialType(CreateStationDto) {}

export class StationPublicationDto {
  @ApiProperty({ enum: PUBLICATION_STATUS_VALUES })
  @IsIn(PUBLICATION_STATUS_VALUES)
  status!: (typeof PUBLICATION_STATUS_VALUES)[number];
}

export class CreatePointDto {
  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(64) label?: string | null;
  @ApiPropertyOptional({ description: 'eMI3 EVSE id' })
  @Nullable()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9*\-_.]+$/)
  evseId?: string | null;
  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(64) physicalReference?:
    string | null;
  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(16) floorLevel?:
    string | null;
  @ApiPropertyOptional()
  @Nullable()
  @CleanText()
  @IsString()
  @MaxLength(1000)
  parkingRestrictions?: string | null;
  @ApiPropertyOptional({ enum: OPERATIONAL_STATUS_VALUES })
  @OptionalNotNull()
  @IsIn(OPERATIONAL_STATUS_VALUES)
  operationalStatus?: (typeof OPERATIONAL_STATUS_VALUES)[number];
  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(1000) notes?:
    string | null;
}

export class UpdatePointDto extends PartialType(CreatePointDto) {}

export class CreateConnectorDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Charge point (EVSE); null = not grouped.' })
  @Nullable()
  @IsString()
  @Matches(UUID_RE, { context: UUID_MESSAGE })
  chargingPointId?: string | null;

  @ApiProperty({ example: 'ccs2' })
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,31}$/)
  connectorTypeCode!: string;

  @ApiProperty({ enum: CURRENT_TYPES }) @IsIn(CURRENT_TYPES) currentType!: 'AC' | 'DC';

  @ApiPropertyOptional({ nullable: true, type: Number, description: 'kW; null = unknown.' })
  @Nullable()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0.1)
  @Max(2000)
  maxPowerKw?: number | null;

  @ApiPropertyOptional() @Nullable() @IsInt() @Min(1) @Max(2000) maxVoltage?: number | null;
  @ApiPropertyOptional() @Nullable() @IsInt() @Min(1) @Max(2000) maxAmperage?: number | null;
  @ApiPropertyOptional({ enum: [1, 3] }) @Nullable() @IsIn([1, 3]) phases?: number | null;
  @ApiPropertyOptional({ enum: ['socket', 'cable'] })
  @Nullable()
  @IsIn(['socket', 'cable'])
  format?: 'socket' | 'cable' | null;

  @ApiPropertyOptional({ default: 1, description: 'Identical plugs (not "cars at once").' })
  @OptionalNotNull()
  @IsInt()
  @Min(1)
  @Max(50)
  quantity?: number;

  @ApiPropertyOptional({ enum: OPERATIONAL_STATUS_VALUES })
  @OptionalNotNull()
  @IsIn(OPERATIONAL_STATUS_VALUES)
  operationalStatus?: (typeof OPERATIONAL_STATUS_VALUES)[number];
}

export class UpdateConnectorDto extends PartialType(CreateConnectorDto) {}

export class TariffElementInputDto {
  @ApiProperty({ enum: TARIFF_COMPONENT_VALUES })
  @IsIn(TARIFF_COMPONENT_VALUES)
  componentType!: (typeof TARIFF_COMPONENT_VALUES)[number];

  @ApiProperty({ example: '5.25', description: 'Decimal string (max 4 decimals).' })
  @DecimalString(8, 4)
  price!: string;

  @ApiProperty({
    enum: PRICE_UNIT_VALUES,
    description:
      'energy → per_kwh; flat → per_session; time/parking_time/idle → per_minute|per_hour',
  })
  @IsIn(PRICE_UNIT_VALUES)
  priceUnit!: (typeof PRICE_UNIT_VALUES)[number];

  @ApiPropertyOptional() @Nullable() @IsInt() @Min(1) @Max(86_400) stepSize?: number | null;
  @ApiPropertyOptional() @Nullable() @IsInt() @Min(0) @Max(1440) graceMinutes?: number | null;
  @ApiPropertyOptional()
  @Nullable()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(2000)
  minPowerKw?: number | null;
  @ApiPropertyOptional()
  @Nullable()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.1)
  @Max(2000)
  maxPowerKw?: number | null;
  @ApiPropertyOptional({ enum: CURRENT_TYPES }) @Nullable() @IsIn(CURRENT_TYPES) currentType?:
    'AC' | 'DC' | null;
  @ApiPropertyOptional({ example: '08:00' })
  @Nullable()
  @IsString()
  @Matches(HHMM_RE, { context: HHMM_MESSAGE })
  startTime?: string | null;
  @ApiPropertyOptional({ example: '22:00' })
  @Nullable()
  @IsString()
  @Matches(HHMM_END_RE, { context: HHMM_MESSAGE })
  endTime?: string | null;

  @ApiPropertyOptional({ type: [Number], description: 'ISO weekdays 1..7; empty = every day.' })
  @OptionalNotNull()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  daysOfWeek?: number[];
}

export class CreateTariffDto {
  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(200) name?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @Nullable()
  @IsString()
  @Matches(UUID_RE, { context: UUID_MESSAGE })
  chargingPointId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @Nullable()
  @IsString()
  @Matches(UUID_RE, { context: UUID_MESSAGE })
  connectorId?: string | null;

  @ApiProperty({ example: 'EGP' }) @IsString() @Matches(/^[A-Z]{3}$/) currencyCode!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @Nullable()
  @IsISO8601({ strict: true })
  validFrom?: string | null;
  @ApiPropertyOptional({ format: 'date-time' }) @Nullable() @IsISO8601({ strict: true }) validTo?:
    string | null;
  @ApiPropertyOptional({ nullable: true, type: Boolean, description: 'null = unknown' })
  @Nullable()
  @IsBoolean()
  taxIncluded?: boolean | null;
  @ApiPropertyOptional()
  @Nullable()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  taxPercent?: number | null;
  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(2000) notes?:
    string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'specification_sources id (tariff sheet, operator page…).',
  })
  @Nullable()
  @IsString()
  @Matches(UUID_RE, { context: UUID_MESSAGE })
  sourceId?: string | null;

  @ApiPropertyOptional({ format: 'date-time' })
  @Nullable()
  @IsISO8601({ strict: true })
  verifiedAt?: string | null;

  @ApiPropertyOptional({ enum: RELIABILITY_VALUES, default: 'unverified' })
  @OptionalNotNull()
  @IsIn(RELIABILITY_VALUES)
  reliability?: (typeof RELIABILITY_VALUES)[number];

  @ApiProperty({ type: [TariffElementInputDto], minItems: 1, maxItems: 20 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TariffElementInputDto)
  elements!: TariffElementInputDto[];
}

export class CreateStationWithConnectorsDto extends CreateStationDto {
  @ApiPropertyOptional({
    type: [CreateConnectorDto],
    maxItems: 50,
    description: 'Connectors created with the station (not grouped into charge points).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateConnectorDto)
  connectors?: CreateConnectorDto[];
}

export class UpdateTariffDto extends PartialType(CreateTariffDto) {}

export class AddStationPhotoDto {
  @ApiProperty({ format: 'uuid', description: 'media_assets id (image, ready, licensed).' })
  @IsString()
  @Matches(UUID_RE, { context: UUID_MESSAGE })
  assetId!: string;
  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(500) caption?:
    string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(10_000) sortOrder?: number;
}

// --- operators ---------------------------------------------------------------------------

export class OperatorListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @CleanText() @IsString() @MaxLength(100) q?: string;
}

export class CreateOperatorDto {
  @ApiProperty() @CleanText() @IsString() @Length(2, 200) name!: string;
  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(200) nameAr?:
    string | null;
  @ApiPropertyOptional() @Nullable() @IsString() @MaxLength(2048) @IsUrl(URL_OPTS) websiteUrl?:
    string | null;
  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(50) phone?: string | null;
  @ApiPropertyOptional() @Nullable() @IsString() @MaxLength(320) email?: string | null;
}

export class UpdateOperatorDto extends PartialType(CreateOperatorDto) {}

// --- moderation ---------------------------------------------------------------------------

export class AdminReportListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: REPORT_STATUS_VALUES, isArray: true })
  @QueryList(REPORT_STATUS_VALUES)
  status?: string[];
  @ApiPropertyOptional({ enum: REPORT_TYPE_VALUES, isArray: true })
  @QueryList(REPORT_TYPE_VALUES)
  type?: string[];
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { context: UUID_MESSAGE })
  stationId?: string;
}

export class UpdateReportDto {
  @ApiProperty({ enum: REPORT_STATUS_VALUES })
  @IsIn(REPORT_STATUS_VALUES)
  status!: (typeof REPORT_STATUS_VALUES)[number];
  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(2000) resolutionNote?:
    string | null;
}

export class AdminCheckinListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: MODERATION_STATUS_VALUES, isArray: true })
  @QueryList(MODERATION_STATUS_VALUES)
  status?: string[];
  @ApiPropertyOptional({ enum: CHECKIN_OUTCOME_VALUES, isArray: true })
  @QueryList(CHECKIN_OUTCOME_VALUES)
  outcome?: string[];
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { context: UUID_MESSAGE })
  stationId?: string;
}

export class UpdateCheckinDto {
  @ApiProperty({ enum: MODERATION_STATUS_VALUES })
  @IsIn(MODERATION_STATUS_VALUES)
  status!: (typeof MODERATION_STATUS_VALUES)[number];
}

export class AdminSuggestionListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SUGGESTION_STATUS_VALUES, isArray: true })
  @QueryList(SUGGESTION_STATUS_VALUES)
  status?: string[];
}

export class ApproveSuggestionDto extends PartialType(CreateStationDto) {
  @ApiPropertyOptional({ maxLength: 2000 })
  @Nullable()
  @CleanText()
  @IsString()
  @MaxLength(2000)
  reviewNote?: string | null;

  @ApiPropertyOptional({
    default: true,
    description: 'Create the suggested connectors (ungrouped) on the new station.',
  })
  @IsOptional()
  @IsBoolean()
  createConnectors?: boolean;
}

export class RejectSuggestionDto {
  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(2000) reviewNote?:
    string | null;
}

export class DuplicateSuggestionDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  @Matches(UUID_RE, { context: UUID_MESSAGE })
  stationId!: string;
  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(2000) reviewNote?:
    string | null;
}

// --- duplicates ---------------------------------------------------------------------------

export class DuplicateListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: DUPLICATE_STATUS_VALUES, isArray: true })
  @QueryList(DUPLICATE_STATUS_VALUES)
  status?: string[];
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { context: UUID_MESSAGE })
  stationId?: string;
}

export class CreateDuplicateDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  @Matches(UUID_RE, { context: UUID_MESSAGE })
  stationId!: string;
  @ApiProperty({ format: 'uuid' })
  @IsString()
  @Matches(UUID_RE, { context: UUID_MESSAGE })
  otherStationId!: string;
  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(1000) note?: string | null;
}

export class ScanDuplicatesDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'One station; omit to scan a country.' })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { context: UUID_MESSAGE })
  stationId?: string;

  @ApiPropertyOptional({ example: 'EG' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/, { context: COUNTRY_MESSAGE })
  countryCode?: string;

  @ApiPropertyOptional({ default: 500, maximum: 5000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number;
}

export class MergeDuplicateDto {
  @ApiProperty({
    format: 'uuid',
    description: 'The station that stays (the other one is merged into it).',
  })
  @IsString()
  @Matches(UUID_RE, { context: UUID_MESSAGE })
  keepStationId!: string;
  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(1000) note?: string | null;
}

export class DismissDuplicateDto {
  @ApiPropertyOptional() @Nullable() @CleanText() @IsString() @MaxLength(1000) note?: string | null;
}

// --- sync / availability -----------------------------------------------------------------

export class BoundingBoxDto {
  @ApiProperty() @IsNumber() @Min(-90) @Max(90) south!: number;
  @ApiProperty() @IsNumber() @Min(-180) @Max(180) west!: number;
  @ApiProperty() @IsNumber() @Min(-90) @Max(90) north!: number;
  @ApiProperty() @IsNumber() @Min(-180) @Max(180) east!: number;
}

export class OcmSyncDto {
  @ApiPropertyOptional({ example: 'EG', description: 'Country to import (ISO alpha-2).' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/, { context: COUNTRY_MESSAGE })
  countryCode?: string;

  @ApiPropertyOptional({ type: BoundingBoxDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BoundingBoxDto)
  boundingBox?: BoundingBoxDto;

  @ApiPropertyOptional({ format: 'date-time', description: 'Incremental sync.' })
  @IsOptional()
  @IsISO8601({ strict: true })
  modifiedSince?: string;

  @ApiPropertyOptional({ default: 200, minimum: 1, maximum: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  pageSize?: number;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 500 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxPages?: number;

  @ApiPropertyOptional({
    default: false,
    description:
      'Publish new stations directly (possible duplicates always wait for review). Default: pending_review.',
  })
  @IsOptional()
  @IsBoolean()
  autoPublish?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Run in the request and return the finished job (small imports only).',
  })
  @IsOptional()
  @IsBoolean()
  wait?: boolean;
}

export class SyncScheduleDto {
  @ApiProperty() @IsBoolean() enabled!: boolean;

  @ApiProperty({ minimum: 1, maximum: 720, example: 24 })
  @IsInt()
  @Min(1)
  @Max(720)
  intervalHours!: number;

  @ApiProperty({ type: [String], example: ['EG', 'SA', 'AE'] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Matches(/^[A-Z]{2}$/, { each: true, context: COUNTRY_MESSAGE })
  countryCodes!: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  autoPublish?: boolean;
}

export class SyncJobListQueryDto extends PaginationQueryDto {}

export class ExternalRefDto {
  @ApiProperty({ example: 'ocm' }) @IsString() @MaxLength(64) provider!: string;
  @ApiProperty({ example: 'conn:123' }) @IsString() @MaxLength(200) externalId!: string;
}

export const LIVE_STATUS_VALUES = [
  'available',
  'charging',
  'reserved',
  'blocked',
  'out_of_order',
  'inoperative',
  'unknown',
] as const;

export class ObservationInputDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { context: UUID_MESSAGE })
  stationId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { context: UUID_MESSAGE })
  connectorId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { context: UUID_MESSAGE })
  chargingPointId?: string;

  @ApiPropertyOptional({ description: 'eMI3 EVSE id of a charge point.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  evseId?: string;

  @ApiPropertyOptional({ type: ExternalRefDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExternalRefDto)
  external?: ExternalRefDto;

  @ApiProperty({ enum: LIVE_STATUS_VALUES })
  @IsIn(LIVE_STATUS_VALUES)
  status!: (typeof LIVE_STATUS_VALUES)[number];

  @ApiProperty({ format: 'date-time' }) @IsISO8601({ strict: true }) observedAt!: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Default observedAt + 10 min, max 24 h.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  expiresAt?: string;

  @ApiPropertyOptional({ minimum: 10, maximum: 86_400 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(86_400)
  ttlSeconds?: number;
}

export class IngestObservationsDto {
  @ApiProperty({ example: 'partner:acme', description: 'Live provider key.' })
  @IsString()
  @Matches(/^[a-z][a-z0-9_:.-]{1,63}$/)
  provider!: string;

  @ApiProperty({ type: [ObservationInputDto], minItems: 1, maxItems: 500 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ObservationInputDto)
  observations!: ObservationInputDto[];
}

export class RefreshAvailabilityDto {
  @ApiProperty({ type: [String], maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Matches(UUID_RE, { each: true, context: UUID_MESSAGE })
  stationIds!: string[];
}
