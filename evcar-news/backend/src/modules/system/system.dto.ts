import { ApiProperty, ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../common/http/pagination';
import { LocaleQueryDto } from '../i18n/locale-query.dto';
import { ImportJobStatus, ImportRowStatus } from '../../generated/prisma/client';

const COUNT_MAP = { type: 'object', additionalProperties: { type: 'integer' } } as const;

export class IntegrationStatusDto {
  @ApiProperty({ example: 'stations.open_charge_map' }) id!: string;
  @ApiProperty({
    example: 'stations',
    description:
      'storage | mail | stations | availability | routing | geocoding | news | push | oauth | assistant',
  })
  type!: string;
  @ApiProperty({ example: 'open_charge_map' }) name!: string;
  @ApiProperty() configured!: boolean;
  @ApiProperty({
    description: 'false when configured but inactive (e.g. console mail in production).',
  })
  enabled!: boolean;
  @ApiProperty({ description: 'A live check can be run with POST .../integrations/{id}/check.' })
  checkable!: boolean;
  @ApiPropertyOptional({
    description: 'Why it is not configured (names missing variables, never values).',
  })
  reason?: string;
  @ApiPropertyOptional({ type: [String] }) notes?: string[];
  @ApiPropertyOptional({ description: 'Attribution / licence text to display.' })
  attribution?: string;
  @ApiPropertyOptional({ format: 'date-time' }) lastSuccessAt?: string;
  @ApiPropertyOptional() lastError?: string;
  @ApiPropertyOptional({ format: 'date-time' }) lastErrorAt?: string;
}

export class CapabilitiesDto {
  @ApiProperty() routing!: boolean;
  @ApiProperty() geocoding!: boolean;
  @ApiProperty() assistant!: boolean;
  @ApiProperty() push!: boolean;
  @ApiProperty() liveAvailability!: boolean;
  @ApiProperty() stationsSync!: boolean;
}

export class IntegrationsDto {
  @ApiProperty({ type: [IntegrationStatusDto] }) items!: IntegrationStatusDto[];
  @ApiProperty({ type: CapabilitiesDto }) capabilities!: CapabilitiesDto;
  @ApiProperty({
    description: 'Statuses are per API instance (last success/error are kept in memory).',
  })
  note!: string;
}

export class ProviderCheckDto {
  @ApiProperty() ok!: boolean;
  @ApiPropertyOptional() latencyMs?: number;
  @ApiPropertyOptional() error?: string;
  @ApiPropertyOptional() skipped?: boolean;
}

export class QueueSummaryDto {
  @ApiProperty({ example: 'imports' }) name!: string;
  @ApiProperty({ ...COUNT_MAP, nullable: true, description: 'null when Redis is unreachable.' })
  counts!: Record<string, number> | null;
  @ApiProperty({ nullable: true, type: Boolean }) isPaused!: boolean | null;
  @ApiProperty({ nullable: true, type: Number, description: 'Connected workers (any instance).' })
  workers!: number | null;
}

export class JobsOverviewDto {
  @ApiProperty({ enum: ['up', 'down'] }) redis!: 'up' | 'down';
  @ApiProperty({ description: 'Whether this API instance runs workers (JOBS_ENABLED).' })
  workersEnabledHere!: boolean;
  @ApiProperty({ type: [QueueSummaryDto] }) queues!: QueueSummaryDto[];
}

export class JobViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() queue!: string;
  @ApiProperty({ example: 'failed' }) state!: string;
  @ApiProperty() attemptsMade!: number;
  @ApiProperty() maxAttempts!: number;
  @ApiProperty({ description: 'Number 0..100 or an object set by the processor.' })
  progress!: unknown;
  @ApiProperty({ nullable: true, type: String }) failedReason!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) createdAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) processedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) finishedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) delayUntil!: string | null;
}

export class JobDetailDto extends JobViewDto {
  @ApiProperty({ type: [String] }) stacktrace!: string[];
  @ApiProperty({ type: [String], description: 'Top-level keys of the job data (values hidden).' })
  dataKeys!: string[];
}

export const JOB_STATES = [
  'waiting',
  'active',
  'completed',
  'failed',
  'delayed',
  'prioritized',
  'waiting-children',
] as const;

export class ListJobsQueryDto extends IntersectionType(PaginationQueryDto, LocaleQueryDto) {
  @ApiPropertyOptional({ enum: JOB_STATES, default: 'failed' })
  @IsOptional()
  @IsIn(JOB_STATES)
  state?: (typeof JOB_STATES)[number];
}

export class ImportProgressDto {
  @ApiProperty() total!: number;
  @ApiProperty() processed!: number;
  @ApiProperty() success!: number;
  @ApiProperty() errors!: number;
  @ApiProperty() skipped!: number;
  @ApiProperty({ nullable: true, type: Number, description: '0..100, null when total unknown' })
  percent!: number | null;
}

export class ImportJobDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'stations.csv' }) type!: string;
  @ApiProperty({ enum: ImportJobStatus }) status!: ImportJobStatus;
  @ApiProperty({ nullable: true, type: String }) source!: string | null;
  @ApiProperty() dryRun!: boolean;
  @ApiProperty({ type: ImportProgressDto }) progress!: ImportProgressDto;
  @ApiProperty({ nullable: true, type: String }) error!: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true }) options!: Record<string, unknown>;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) fileAssetId!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) createdById!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) startedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) finishedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class RowErrorDto {
  @ApiPropertyOptional() field?: string;
  @ApiProperty() code!: string;
  @ApiProperty() message!: string;
}

export class ImportJobRowDto {
  @ApiProperty() rowNumber!: number;
  @ApiProperty({ enum: ImportRowStatus }) status!: ImportRowStatus;
  @ApiProperty({ description: 'Raw row input.' }) data!: unknown;
  @ApiProperty({ type: [RowErrorDto] }) errors!: RowErrorDto[];
  @ApiProperty({ nullable: true, type: String }) entityType!: string | null;
  @ApiProperty({ nullable: true, type: String }) entityId!: string | null;
}

export class ListImportJobsQueryDto extends IntersectionType(PaginationQueryDto, LocaleQueryDto) {
  @ApiPropertyOptional({ example: 'stations.csv' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_.-]{2,64}$/)
  type?: string;

  @ApiPropertyOptional({ enum: ImportJobStatus })
  @IsOptional()
  @IsIn(Object.values(ImportJobStatus))
  status?: ImportJobStatus;
}

export class ListImportRowsQueryDto extends IntersectionType(PaginationQueryDto, LocaleQueryDto) {
  @ApiPropertyOptional({ enum: ImportRowStatus })
  @IsOptional()
  @IsIn(Object.values(ImportRowStatus))
  status?: ImportRowStatus;
}

export class OverviewCountsDto {
  @ApiProperty() users!: number;
  @ApiProperty({ ...COUNT_MAP, description: 'Articles by workflow status (non-deleted).' })
  articles!: Record<string, number>;
  @ApiProperty({
    type: 'object',
    additionalProperties: COUNT_MAP,
    description: 'brands / models / variants by status.',
  })
  vehicles!: Record<string, Record<string, number>>;
  @ApiProperty({ ...COUNT_MAP, description: 'Stations by publication status.' })
  stationsByPublication!: Record<string, number>;
  @ApiProperty({ ...COUNT_MAP, description: 'Stations by data source.' })
  stationsBySource!: Record<string, number>;
  @ApiProperty({ ...COUNT_MAP }) tours!: Record<string, number>;
  @ApiProperty({ ...COUNT_MAP, description: 'Media assets by processing status.' })
  media!: Record<string, number>;
  @ApiProperty() openStationReports!: number;
  @ApiProperty() pendingReviews!: number;
  @ApiProperty() pendingComments!: number;
  @ApiProperty({ ...COUNT_MAP, description: 'Rows flagged is_demo (must be 0 in production).' })
  demoRows!: Record<string, number>;
}

export class StaleDataDto {
  @ApiProperty({ ...COUNT_MAP, description: 'Thresholds used (days / hours).' })
  thresholds!: Record<string, number>;
  @ApiProperty({
    description: 'Published stations never verified or verified before the threshold.',
  })
  stationsNotRecentlyVerified!: number;
  @ApiProperty({ description: 'Current prices (no end date) older than the threshold.' })
  pricesOutdated!: number;
  @ApiProperty({ description: 'Specs still marked unverified.' }) specsUnverified!: number;
  @ApiProperty({ description: 'Active RSS feeds failing or not fetched successfully recently.' })
  rssFeedsFailing!: number;
  @ApiProperty({ description: 'Media stuck in uploading/processing for over an hour.' })
  mediaStuck!: number;
}

export class OverviewJobsDto {
  @ApiProperty({ enum: ['up', 'down'] }) redis!: 'up' | 'down';
  @ApiProperty({ nullable: true, type: Number, description: 'Failed BullMQ jobs over all queues.' })
  failedJobs!: number | null;
  @ApiProperty({ type: [QueueSummaryDto] }) queues!: QueueSummaryDto[];
}

export class OverviewImportsDto {
  @ApiProperty() running!: number;
  @ApiProperty() failedLast7Days!: number;
  @ApiProperty({ type: [ImportJobDto] }) recent!: ImportJobDto[];
}

export class OverviewIntegrationsDto {
  @ApiProperty() total!: number;
  @ApiProperty({ type: [String] }) notConfigured!: string[];
}

export class SystemOverviewDto {
  @ApiProperty({ format: 'date-time' }) generatedAt!: string;
  @ApiProperty() environment!: string;
  @ApiProperty({ type: OverviewCountsDto }) counts!: OverviewCountsDto;
  @ApiProperty({ type: StaleDataDto }) staleData!: StaleDataDto;
  @ApiProperty({ type: OverviewJobsDto }) jobs!: OverviewJobsDto;
  @ApiProperty({ type: OverviewImportsDto }) imports!: OverviewImportsDto;
  @ApiProperty({ type: OverviewIntegrationsDto }) integrations!: OverviewIntegrationsDto;
  @ApiProperty({ type: [String], description: 'Things an admin should look at.' })
  warnings!: string[];
}

export class IntegrationIdParam {
  @Matches(/^[a-z_]+\.[a-z0-9_]+$/)
  id!: string;
}

export class QueueParamDto {
  @Type(() => String)
  @Matches(/^[a-z-]{2,40}$/)
  queue!: string;
}
