/**
 * Public stations API (guests allowed). See docs/decisions/backend-stations.md §1.
 * Missing values are null ("غير متوفر / Not available"), never 0.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CleanText } from '../../../common/validation/decorators';
import { localizedMessage } from '../../../common/validation/messages';
import {
  QueryBool,
  QueryCodes,
  QueryInt,
  QueryList,
  QueryNumber,
  QueryUuids,
} from './validators';

export const ACCESS_TYPE_VALUES = [
  'public',
  'customers_only',
  'restricted',
  'private',
  'unknown',
] as const;
export const OPERATIONAL_STATUS_VALUES = [
  'operational',
  'planned',
  'temporarily_unavailable',
  'permanently_closed',
  'unknown',
] as const;
export const PUBLICATION_STATUS_VALUES = [
  'draft',
  'pending_review',
  'published',
  'hidden',
  'rejected',
] as const;
export const DATA_SOURCE_VALUES = ['manual', 'ocm', 'csv', 'partner', 'user_suggestion'] as const;
export const CURRENT_TYPES = ['AC', 'DC'] as const;
export const STATION_SORTS = ['distance', 'name'] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_MESSAGE = localizedMessage({ ar: 'معرّف غير صالح.', en: 'Invalid id.' });
const BBOX_RE = /^-?\d{1,3}(\.\d+)?,-?\d{1,2}(\.\d+)?,-?\d{1,3}(\.\d+)?,-?\d{1,2}(\.\d+)?$/;

/** Filters shared by the list and the clusters endpoints. */
export class StationFilterQueryDto {
  @ApiPropertyOptional({
    description: 'Map viewport "minLng,minLat,maxLng,maxLat" (no antimeridian crossing).',
    example: '31.1,29.9,31.5,30.2',
  })
  @IsOptional()
  @IsString()
  @Matches(BBOX_RE, {
    context: localizedMessage({
      ar: 'النطاق بصيغة minLng,minLat,maxLng,maxLat.',
      en: 'bbox must be "minLng,minLat,maxLng,maxLat".',
    }),
  })
  bbox?: string;

  @ApiPropertyOptional({ description: 'Latitude of the search point.', example: 30.0444 })
  @QueryNumber(-90, 90)
  lat?: number;

  @ApiPropertyOptional({ description: 'Longitude of the search point.', example: 31.2357 })
  @QueryNumber(-180, 180)
  lng?: number;

  @ApiPropertyOptional({
    description: 'Radius around lat,lng when no bbox is given (km).',
    default: 25,
    minimum: 0.1,
    maximum: 300,
  })
  @QueryNumber(0.1, 300)
  radiusKm?: number;

  @ApiPropertyOptional({ description: 'Text in name / address / city / operator (Arabic-normalized).' })
  @IsOptional()
  @CleanText()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'Connector type codes, comma list (see /stations/meta).' })
  @QueryCodes()
  connectorTypes?: string[];

  @ApiPropertyOptional({ enum: CURRENT_TYPES })
  @IsOptional()
  @IsIn(CURRENT_TYPES)
  current?: 'AC' | 'DC';

  @ApiPropertyOptional({ description: 'Connectors with a KNOWN max power ≥ this (kW).' })
  @QueryNumber(0.1, 2000)
  minPowerKw?: number;

  @ApiPropertyOptional({ description: 'Operator ids, comma list.' })
  @QueryUuids()
  operatorId?: string[];

  @ApiPropertyOptional({ enum: ACCESS_TYPE_VALUES, isArray: true, description: 'Comma list.' })
  @QueryList(ACCESS_TYPE_VALUES)
  access?: string[];

  @ApiPropertyOptional({ description: 'Amenity codes, comma list (all required).' })
  @QueryCodes()
  amenities?: string[];

  @ApiPropertyOptional({ format: 'uuid', description: 'Catalog trim (request market).' })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { context: UUID_MESSAGE })
  vehicleVariantId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Car of the signed-in user (its market).' })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { context: UUID_MESSAGE })
  userVehicleId?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'With a vehicle: true = only compatible stations, false = annotate only.',
  })
  @QueryBool()
  compatibleOnly?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Also return planned and permanently closed stations.',
  })
  @QueryBool()
  includeClosed?: boolean;
}

export class StationSearchQueryDto extends StationFilterQueryDto {
  @ApiPropertyOptional({ description: 'Only stations open now according to their opening hours.' })
  @QueryBool()
  openNow?: boolean;

  @ApiPropertyOptional({ enum: STATION_SORTS, default: 'distance' })
  @IsOptional()
  @IsIn(STATION_SORTS)
  sort?: 'distance' | 'name';

  @ApiPropertyOptional({ minimum: 1, maximum: 500, default: 100 })
  @QueryInt(1, 500)
  limit?: number;

  @ApiPropertyOptional({ description: 'Opaque cursor from meta.nextCursor.' })
  @IsOptional()
  @IsString()
  @Matches(/^o\d{1,5}$/, {
    context: localizedMessage({ ar: 'مؤشر صفحات غير صالح.', en: 'Invalid cursor.' }),
  })
  cursor?: string;
}

export class StationClusterQueryDto extends StationFilterQueryDto {
  @ApiProperty({ minimum: 0, maximum: 22, description: 'Map zoom level.' })
  @QueryInt(0, 22)
  zoom?: number;
}

export class StationDetailQueryDto {
  @ApiPropertyOptional() @QueryNumber(-90, 90) lat?: number;
  @ApiPropertyOptional() @QueryNumber(-180, 180) lng?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { context: UUID_MESSAGE })
  vehicleVariantId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  @Matches(UUID_RE, { context: UUID_MESSAGE })
  userVehicleId?: string;
}

// --- responses (OpenAPI documentation) ---------------------------------------------------

export class CodeLabelDto {
  @ApiProperty() code!: string;
  @ApiProperty() label!: string;
}

export class ConnectorTypeRefDto {
  @ApiProperty({ example: 'ccs2' }) code!: string;
  @ApiProperty({ example: 'CCS2 (Combo 2)' }) name!: string;
}

export class ListAvailabilityDto {
  @ApiProperty({ enum: ['available', 'occupied', 'out_of_order', 'unknown'] }) status!: string;
  @ApiProperty({ nullable: true, type: Number }) availableConnectors!: number | null;
  @ApiProperty() liveConnectors!: number;
}

export class ListCompatibilityDto {
  @ApiProperty() compatibleConnectors!: number;
  @ApiProperty({ nullable: true, type: Number }) maxUsablePowerKw!: number | null;
}

export class StationListItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ nullable: true, type: String }) slug!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) operatorName!: string | null;
  @ApiProperty() latitude!: number;
  @ApiProperty() longitude!: number;
  @ApiProperty({ nullable: true, type: Number }) distanceM!: number | null;
  @ApiProperty({ nullable: true, type: String }) city!: string | null;
  @ApiProperty() countryCode!: string;
  @ApiProperty({ enum: ACCESS_TYPE_VALUES }) accessType!: string;
  @ApiProperty({ enum: OPERATIONAL_STATUS_VALUES }) operationalStatus!: string;
  @ApiProperty({ enum: ['open', 'closed', 'unknown'] }) openNow!: string;
  @ApiProperty({ nullable: true, type: Boolean }) isAlwaysOpen!: boolean | null;
  @ApiProperty({ nullable: true, type: Number }) maxPowerKw!: number | null;
  @ApiProperty({ enum: CURRENT_TYPES, isArray: true }) currentTypes!: string[];
  @ApiProperty({ type: [String] }) connectorTypes!: string[];
  @ApiProperty({ description: 'Σ connector quantity (not "cars at once").' })
  connectorCount!: number;
  @ApiProperty({ nullable: true, type: Number }) pointCount!: number | null;
  @ApiProperty({ type: ListAvailabilityDto }) availability!: ListAvailabilityDto;
  @ApiProperty({ nullable: true, type: ListCompatibilityDto })
  compatibility!: ListCompatibilityDto | null;
  @ApiProperty() isDemo!: boolean;
  @ApiProperty({ enum: DATA_SOURCE_VALUES }) dataSource!: string;
}

export class StationClusterDto {
  @ApiProperty() latitude!: number;
  @ApiProperty() longitude!: number;
  @ApiProperty() count!: number;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) stationId!: string | null;
}

export class ConnectorTypeDto {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() nameAr!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty() supportsAc!: boolean;
  @ApiProperty() supportsDc!: boolean;
  @ApiProperty({ nullable: true, type: String }) iconKey!: string | null;
  @ApiProperty({ nullable: true, type: String }) standard!: string | null;
}

export class ReportTypeDto {
  @ApiProperty() code!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ nullable: true, type: String }) help!: string | null;
  @ApiProperty() requiresDetails!: boolean;
}

export class LiveAvailabilityInfoDto {
  @ApiProperty() configured!: boolean;
  @ApiProperty({ nullable: true, type: String }) provider!: string | null;
}

export class StationsMetaDto {
  @ApiProperty({ type: [ConnectorTypeDto] }) connectorTypes!: ConnectorTypeDto[];
  @ApiProperty({ type: [CodeLabelDto] }) amenities!: CodeLabelDto[];
  @ApiProperty({ type: [CodeLabelDto] }) paymentMethods!: CodeLabelDto[];
  @ApiProperty({ type: [CodeLabelDto] }) startMethods!: CodeLabelDto[];
  @ApiProperty({ type: [CodeLabelDto] }) accessTypes!: CodeLabelDto[];
  @ApiProperty({ type: [CodeLabelDto] }) operationalStatuses!: CodeLabelDto[];
  @ApiProperty({ type: [CodeLabelDto] }) checkinOutcomes!: CodeLabelDto[];
  @ApiProperty({ type: [ReportTypeDto] }) reportTypes!: ReportTypeDto[];
  @ApiProperty({ type: LiveAvailabilityInfoDto }) liveAvailability!: LiveAvailabilityInfoDto;
  @ApiProperty() notAvailableLabel!: string;
}

export class ConnectorAvailabilityDto {
  @ApiProperty({ enum: ['available', 'occupied', 'out_of_order', 'unknown'] }) status!: string;
  @ApiProperty({
    nullable: true,
    type: String,
    enum: ['available', 'charging', 'reserved', 'blocked', 'out_of_order', 'inoperative', 'unknown'],
  })
  providerStatus!: string | null;
  @ApiProperty({ enum: ['live', 'expired', 'none'] }) freshness!: string;
  @ApiProperty({ nullable: true, type: String }) source!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) observedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) expiresAt!: string | null;
}

export class ConnectorCompatibilityDto {
  @ApiProperty() compatible!: boolean;
  @ApiProperty({ nullable: true, type: Number }) maxUsablePowerKw!: number | null;
}

export class ConnectorDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) chargingPointId!: string | null;
  @ApiProperty({ type: ConnectorTypeRefDto }) connectorType!: ConnectorTypeRefDto;
  @ApiProperty({ enum: CURRENT_TYPES }) currentType!: string;
  @ApiProperty({ nullable: true, type: Number }) maxPowerKw!: number | null;
  @ApiProperty({ nullable: true, type: Number }) maxVoltage!: number | null;
  @ApiProperty({ nullable: true, type: Number }) maxAmperage!: number | null;
  @ApiProperty({ nullable: true, type: Number }) phases!: number | null;
  @ApiProperty({ nullable: true, type: String, enum: ['socket', 'cable'] }) format!: string | null;
  @ApiProperty() quantity!: number;
  @ApiProperty({ enum: OPERATIONAL_STATUS_VALUES }) operationalStatus!: string;
  @ApiProperty({ type: ConnectorAvailabilityDto }) availability!: ConnectorAvailabilityDto;
  @ApiProperty({ nullable: true, type: ConnectorCompatibilityDto })
  compatibility!: ConnectorCompatibilityDto | null;
}

export class ChargingPointDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ nullable: true, type: String }) label!: string | null;
  @ApiProperty({ nullable: true, type: String }) evseId!: string | null;
  @ApiProperty({ nullable: true, type: String }) floorLevel!: string | null;
  @ApiProperty({ nullable: true, type: String }) parkingRestrictions!: string | null;
  @ApiProperty({ enum: OPERATIONAL_STATUS_VALUES }) operationalStatus!: string;
  @ApiProperty({ type: [ConnectorDto] }) connectors!: ConnectorDto[];
}

export class MoneyDto {
  @ApiProperty({ example: '5.0000' }) amount!: string;
  @ApiProperty({ example: 'EGP' }) currency!: string;
}

export class TariffElementDto {
  @ApiProperty({ enum: ['energy', 'time', 'flat', 'parking_time', 'idle'] }) componentType!: string;
  @ApiProperty() componentLabel!: string;
  @ApiProperty({ type: MoneyDto }) price!: MoneyDto;
  @ApiProperty({ enum: ['per_kwh', 'per_minute', 'per_hour', 'per_session'] }) priceUnit!: string;
  @ApiProperty() unitLabel!: string;
  @ApiProperty({ nullable: true, type: Number }) stepSize!: number | null;
  @ApiProperty({ nullable: true, type: Number }) graceMinutes!: number | null;
  @ApiProperty({ nullable: true, type: Number }) minPowerKw!: number | null;
  @ApiProperty({ nullable: true, type: Number }) maxPowerKw!: number | null;
  @ApiProperty({ nullable: true, type: String, enum: CURRENT_TYPES }) currentType!: string | null;
  @ApiProperty({ nullable: true, type: String }) startTime!: string | null;
  @ApiProperty({ nullable: true, type: String }) endTime!: string | null;
  @ApiProperty({ type: [Number], description: 'ISO weekdays 1..7; empty = every day.' })
  daysOfWeek!: number[];
}

export class TariffSourceDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) publisher!: string | null;
  @ApiProperty({ nullable: true, type: String }) url!: string | null;
}

export class TariffDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ nullable: true, type: String }) name!: string | null;
  @ApiProperty({ nullable: true, type: String }) chargingPointId!: string | null;
  @ApiProperty({ nullable: true, type: String }) connectorId!: string | null;
  @ApiProperty() currency!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) validFrom!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) validTo!: string | null;
  @ApiProperty() isCurrent!: boolean;
  @ApiProperty({ nullable: true, type: Boolean }) taxIncluded!: boolean | null;
  @ApiProperty({ nullable: true, type: Number }) taxPercent!: number | null;
  @ApiProperty({ nullable: true, type: String }) notes!: string | null;
  @ApiProperty() reliability!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) verifiedAt!: string | null;
  @ApiProperty({ nullable: true, type: TariffSourceDto }) source!: TariffSourceDto | null;
  @ApiProperty() isDemo!: boolean;
  @ApiProperty({ type: [TariffElementDto] }) elements!: TariffElementDto[];
}

export class OpenNowDto {
  @ApiProperty({ enum: ['open', 'closed', 'unknown'] }) state!: string;
  @ApiProperty({ enum: ['always_open', 'schedule', 'unknown_schedule', 'unknown_day'] })
  reason!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) closesAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) opensAt!: string | null;
  @ApiProperty({ example: '21:30' }) localTime!: string;
  @ApiProperty({ format: 'date-time' }) evaluatedAt!: string;
}

export class HoursWindowDto {
  @ApiProperty({ example: '08:00' }) start!: string;
  @ApiProperty({ example: '22:00' }) end!: string;
}

export class WeeklyDayDto {
  @ApiProperty({ enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] }) day!: string;
  @ApiProperty({
    nullable: true,
    type: [HoursWindowDto],
    description: 'null = unknown, [] = closed.',
  })
  windows!: HoursWindowDto[] | null;
}

export class StationHoursDto {
  @ApiProperty({ example: 'Africa/Cairo' }) timezone!: string;
  @ApiProperty({ nullable: true, type: Boolean }) isAlwaysOpen!: boolean | null;
  @ApiProperty({ nullable: true, type: String }) openingHoursText!: string | null;
  @ApiProperty({ nullable: true, type: [WeeklyDayDto] }) weekly!: WeeklyDayDto[] | null;
  @ApiProperty({ type: OpenNowDto }) openNow!: OpenNowDto;
}

export class AvailabilityCountsDto {
  @ApiProperty() available!: number;
  @ApiProperty() occupied!: number;
  @ApiProperty() outOfOrder!: number;
  @ApiProperty() unknown!: number;
}

export class StationAvailabilityDto {
  @ApiProperty() liveProviderConfigured!: boolean;
  @ApiProperty({ nullable: true, type: String }) provider!: string | null;
  @ApiProperty({ description: 'At least one non-expired live observation.' }) isLive!: boolean;
  @ApiProperty({ enum: ['available', 'occupied', 'out_of_order', 'unknown'] }) status!: string;
  @ApiProperty({ type: AvailabilityCountsDto }) counts!: AvailabilityCountsDto;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) lastObservedAt!: string | null;
  @ApiProperty() disclaimer!: string;
}

export class StationAvailabilityResponseDto {
  @ApiProperty({ format: 'uuid' }) stationId!: string;
  @ApiProperty({ type: StationAvailabilityDto }) availability!: StationAvailabilityDto;
  @ApiProperty({ type: [ConnectorAvailabilityDto] }) connectors!: (ConnectorAvailabilityDto & {
    connectorId: string;
  })[];
}

export class StationOperatorDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) websiteUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ nullable: true, type: String }) email!: string | null;
}

export class StationAddressDto {
  @ApiProperty({ nullable: true, type: String }) line!: string | null;
  @ApiProperty({ nullable: true, type: String }) city!: string | null;
  @ApiProperty({ nullable: true, type: String }) region!: string | null;
  @ApiProperty({ nullable: true, type: String }) postalCode!: string | null;
  @ApiProperty() countryCode!: string;
  @ApiProperty({ nullable: true, type: String }) marketCode!: string | null;
}

export class StationContactDto {
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ nullable: true, type: String }) email!: string | null;
  @ApiProperty({ nullable: true, type: String }) websiteUrl!: string | null;
}

export class StationImageDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() url!: string;
  @ApiProperty({ nullable: true, type: Number }) width!: number | null;
  @ApiProperty({ nullable: true, type: Number }) height!: number | null;
  @ApiProperty({ nullable: true, type: String }) alt!: string | null;
  @ApiProperty({ nullable: true, type: String }) caption!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Credit line (licence).' })
  credit!: string | null;
  @ApiProperty({ nullable: true, type: String }) licenseType!: string | null;
  @ApiProperty() isDemo!: boolean;
}

export class ProviderSourceDto {
  @ApiProperty({ example: 'ocm' }) provider!: string;
  @ApiProperty({ example: 'Open Charge Map' }) displayName!: string;
  @ApiProperty({ nullable: true, type: String }) sourceUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) license!: string | null;
  @ApiProperty({ nullable: true, type: String }) licenseUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) attribution!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) lastSyncedAt!: string | null;
}

export class StationSourceInfoDto {
  @ApiProperty({ enum: DATA_SOURCE_VALUES }) dataSource!: string;
  @ApiProperty({ nullable: true, type: String }) license!: string | null;
  @ApiProperty({ nullable: true, type: String }) attribution!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) lastVerifiedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) sourceUpdatedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) lastUpdated!: string;
  @ApiProperty({ type: [ProviderSourceDto] }) providers!: ProviderSourceDto[];
}

export class VehicleRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
}

export class CommunityCheckinDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() outcome!: string;
  @ApiProperty() outcomeLabel!: string;
  @ApiProperty({ nullable: true, type: ConnectorTypeRefDto })
  connectorType!: ConnectorTypeRefDto | null;
  @ApiProperty({ nullable: true, type: String }) currentType!: string | null;
  @ApiProperty({ nullable: true, type: Number }) observedPowerKw!: number | null;
  @ApiProperty({ nullable: true, type: Number }) waitMinutes!: number | null;
  @ApiProperty({ nullable: true, type: String }) comment!: string | null;
  @ApiProperty({ nullable: true, type: VehicleRefDto }) vehicle!: VehicleRefDto | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class CommunityCheckinsDto {
  @ApiProperty() total!: number;
  @ApiProperty() last30Days!: number;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) lastAt!: string | null;
  @ApiProperty({ nullable: true, type: Number, description: '0..1, needs ≥ 3 check-ins in 30 days' })
  successRate30d!: number | null;
  @ApiProperty({ type: [CommunityCheckinDto] }) recent!: CommunityCheckinDto[];
}

export class CommunityReportDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() type!: string;
  @ApiProperty() typeLabel!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class CommunityReportsDto {
  @ApiProperty() openCount!: number;
  @ApiProperty({ type: [CommunityReportDto] }) recent!: CommunityReportDto[];
}

export class StationCommunityDto {
  @ApiProperty({ example: false }) isLive!: boolean;
  @ApiProperty() disclaimer!: string;
  @ApiProperty({ type: CommunityCheckinsDto }) checkins!: CommunityCheckinsDto;
  @ApiProperty({ type: CommunityReportsDto }) reports!: CommunityReportsDto;
}

export class InletViewDto {
  @ApiProperty({ type: ConnectorTypeRefDto }) connectorType!: ConnectorTypeRefDto;
  @ApiProperty({ enum: CURRENT_TYPES }) currentType!: string;
  @ApiProperty({ nullable: true, type: Number }) maxPowerKw!: number | null;
  @ApiProperty() reliability!: string;
}

export class VehicleCompatibilityDto {
  @ApiProperty({ format: 'uuid' }) variantId!: string;
  @ApiProperty() marketCode!: string;
  @ApiProperty() vehicleName!: string;
  @ApiProperty({ type: [InletViewDto] }) inlets!: InletViewDto[];
  @ApiProperty() ignoredInlets!: number;
  @ApiProperty({ type: [String] }) usableReliabilities!: string[];
  @ApiProperty() note!: string;
}

export class StationDetailDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ nullable: true, type: String }) slug!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) nameAr!: string | null;
  @ApiProperty({ nullable: true, type: String }) nameEn!: string | null;
  @ApiProperty() isDemo!: boolean;
  @ApiProperty({ nullable: true, type: StationOperatorDto }) operator!: StationOperatorDto | null;
  @ApiProperty() latitude!: number;
  @ApiProperty() longitude!: number;
  @ApiProperty({ nullable: true, type: Number }) distanceM!: number | null;
  @ApiProperty({ type: StationAddressDto }) address!: StationAddressDto;
  @ApiProperty({ nullable: true, type: String }) accessEntranceNote!: string | null;
  @ApiProperty({ enum: ACCESS_TYPE_VALUES }) accessType!: string;
  @ApiProperty() accessTypeLabel!: string;
  @ApiProperty({ nullable: true, type: String }) accessRestrictions!: string | null;
  @ApiProperty({ type: StationHoursDto }) hours!: StationHoursDto;
  @ApiProperty({ type: StationContactDto }) contact!: StationContactDto;
  @ApiProperty({ type: [StationImageDto] }) photos!: StationImageDto[];
  @ApiProperty({ type: [CodeLabelDto] }) amenities!: CodeLabelDto[];
  @ApiProperty({ type: [CodeLabelDto] }) paymentMethods!: CodeLabelDto[];
  @ApiProperty({ type: [CodeLabelDto] }) startMethods!: CodeLabelDto[];
  @ApiProperty({ enum: OPERATIONAL_STATUS_VALUES }) operationalStatus!: string;
  @ApiProperty() operationalStatusLabel!: string;
  @ApiProperty({ type: [ChargingPointDto] }) points!: ChargingPointDto[];
  @ApiProperty({ type: [ConnectorDto] }) unassignedConnectors!: ConnectorDto[];
  @ApiProperty({ nullable: true, type: Number }) pointCount!: number | null;
  @ApiProperty() connectorCount!: number;
  @ApiProperty({ type: [TariffDto] }) tariffs!: TariffDto[];
  @ApiProperty({ nullable: true, type: String, description: 'Free text as published by the source.' })
  usageCostText!: string | null;
  @ApiProperty({ type: StationAvailabilityDto }) availability!: StationAvailabilityDto;
  @ApiProperty({ type: StationSourceInfoDto }) source!: StationSourceInfoDto;
  @ApiProperty({ type: StationCommunityDto }) community!: StationCommunityDto;
  @ApiProperty({ nullable: true, type: VehicleCompatibilityDto })
  compatibility!: VehicleCompatibilityDto | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
