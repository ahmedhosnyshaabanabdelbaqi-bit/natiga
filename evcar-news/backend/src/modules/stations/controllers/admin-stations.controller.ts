import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { SupportedLanguage } from '../../../config/app-config';
import { ok, listOf } from '../../../common/http/responses';
import { Lang } from '../../../common/i18n/request-locale';
import { ApiErrorResponses } from '../../../common/swagger/api-responses';
import { Audit } from '../../audit';
import { CurrentUser, type AuthUser } from '../../auth';
import { RequireAnyPermission, RequirePermissions } from '../../rbac';
import { toImportJobView } from '../../system';
import { UuidParamPipe } from '../../system/uuid-param.pipe';
import { setNoStore } from '../common/values';
import {
  AddStationPhotoDto,
  AdminCheckinListQueryDto,
  AdminReportListQueryDto,
  AdminStationListQueryDto,
  AdminSuggestionListQueryDto,
  ApproveSuggestionDto,
  CreateConnectorDto,
  CreateDuplicateDto,
  CreateOperatorDto,
  CreatePointDto,
  CreateStationWithConnectorsDto,
  CreateTariffDto,
  DismissDuplicateDto,
  DuplicateListQueryDto,
  DuplicateSuggestionDto,
  IngestObservationsDto,
  MergeDuplicateDto,
  OcmSyncDto,
  OperatorListQueryDto,
  RefreshAvailabilityDto,
  RejectSuggestionDto,
  ScanDuplicatesDto,
  StationPublicationDto,
  SyncJobListQueryDto,
  SyncScheduleDto,
  UpdateCheckinDto,
  UpdateConnectorDto,
  UpdateOperatorDto,
  UpdatePointDto,
  UpdateReportDto,
  UpdateStationDto,
  UpdateTariffDto,
} from '../dto/admin.dto';
import { StationAdminService } from '../services/station-admin.service';
import { StationAvailabilityService } from '../services/station-availability.service';
import { StationDuplicatesService } from '../services/station-duplicates.service';
import { StationModerationService } from '../services/station-moderation.service';
import { StationSyncService } from '../services/station-sync.service';
import { StationTariffsService } from '../services/station-tariffs.service';

const OBJECT = { schema: { type: 'object', properties: { data: { type: 'object' } } } };

@ApiTags('admin-stations')
@ApiErrorResponses(401, 403)
@Controller('admin/stations')
export class AdminStationsController {
  constructor(
    private readonly admin: StationAdminService,
    private readonly tariffs: StationTariffsService,
  ) {}

  @Get()
  @RequirePermissions('stations.read')
  @ApiOperation({ summary: 'Stations incl. unpublished (filters, open reports)' })
  async list(@Query() q: AdminStationListQueryDto, @Res({ passthrough: true }) res: Response) {
    setNoStore(res);
    return this.admin.list(q);
  }

  @Post()
  @RequirePermissions('stations.write')
  @Audit({ entityType: 'station' })
  @ApiOperation({
    summary:
      'Adds a staff-verified station (source manual; draft unless publish + stations.publish)',
  })
  @ApiBody({ type: CreateStationWithConnectorsDto })
  @ApiOkResponse(OBJECT)
  @ApiErrorResponses(409, 422)
  async create(@Body() dto: CreateStationWithConnectorsDto, @CurrentUser() user: AuthUser) {
    return ok(await this.admin.create(dto, user));
  }

  @Get(':id')
  @RequirePermissions('stations.read')
  @ApiOperation({
    summary: 'Full admin view (points, connectors, provenance, possible duplicates)',
  })
  @ApiErrorResponses(404)
  async get(@Param('id', UuidParamPipe) id: string, @Res({ passthrough: true }) res: Response) {
    setNoStore(res);
    return ok(await this.admin.get(id));
  }

  @Patch(':id')
  @RequirePermissions('stations.write')
  @Audit({ entityType: 'station' })
  @ApiBody({ type: UpdateStationDto })
  @ApiErrorResponses(404, 409, 422)
  async update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateStationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return ok(await this.admin.update(id, dto, user));
  }

  @Post(':id/publication')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('stations.publish')
  @Audit({ entityType: 'station' })
  @ApiOperation({
    summary: 'Publishes / hides / rejects a station (merged duplicates never publish)',
  })
  @ApiErrorResponses(404, 409, 422)
  async publication(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: StationPublicationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return ok(await this.admin.setPublication(id, dto.status, user));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('stations.delete')
  @Audit({ entityType: 'station' })
  @ApiOperation({
    summary: 'Soft-deletes a station (hidden everywhere; a re-sync never restores it)',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  async remove(@Param('id', UuidParamPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.admin.remove(id, user);
  }

  // points
  @Post(':id/points')
  @RequirePermissions('stations.write')
  @Audit({ entityType: 'charging_point' })
  @ApiErrorResponses(404, 422)
  async createPoint(@Param('id', UuidParamPipe) id: string, @Body() dto: CreatePointDto) {
    return ok(await this.admin.createPoint(id, dto));
  }

  @Patch(':id/points/:pointId')
  @RequirePermissions('stations.write')
  @Audit({ entityType: 'charging_point', entityIdParam: 'pointId' })
  @ApiErrorResponses(404, 422)
  async updatePoint(
    @Param('id', UuidParamPipe) id: string,
    @Param('pointId', UuidParamPipe) pointId: string,
    @Body() dto: UpdatePointDto,
  ) {
    return ok(await this.admin.updatePoint(id, pointId, dto));
  }

  @Delete(':id/points/:pointId')
  @RequirePermissions('stations.write')
  @Audit({ entityType: 'charging_point', entityIdParam: 'pointId' })
  @ApiOperation({ summary: 'Deletes an empty charge point (409 IN_USE while it has connectors)' })
  @ApiErrorResponses(404, 409)
  async deletePoint(
    @Param('id', UuidParamPipe) id: string,
    @Param('pointId', UuidParamPipe) pointId: string,
  ) {
    return ok(await this.admin.deletePoint(id, pointId));
  }

  // connectors
  @Post(':id/connectors')
  @RequirePermissions('stations.write')
  @Audit({ entityType: 'connector' })
  @ApiErrorResponses(404, 422)
  async createConnector(@Param('id', UuidParamPipe) id: string, @Body() dto: CreateConnectorDto) {
    return ok(await this.admin.createConnector(id, dto));
  }

  @Patch(':id/connectors/:connectorId')
  @RequirePermissions('stations.write')
  @Audit({ entityType: 'connector', entityIdParam: 'connectorId' })
  @ApiErrorResponses(404, 422)
  async updateConnector(
    @Param('id', UuidParamPipe) id: string,
    @Param('connectorId', UuidParamPipe) connectorId: string,
    @Body() dto: UpdateConnectorDto,
  ) {
    return ok(await this.admin.updateConnector(id, connectorId, dto));
  }

  @Delete(':id/connectors/:connectorId')
  @RequirePermissions('stations.write')
  @Audit({ entityType: 'connector', entityIdParam: 'connectorId' })
  @ApiErrorResponses(404, 422)
  async deleteConnector(
    @Param('id', UuidParamPipe) id: string,
    @Param('connectorId', UuidParamPipe) connectorId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return ok(await this.admin.deleteConnector(id, connectorId, user));
  }

  // tariffs
  @Get(':id/tariffs')
  @RequireAnyPermission('stations.read', 'tariffs.write')
  @ApiErrorResponses(404)
  async listTariffs(@Param('id', UuidParamPipe) id: string, @Lang() lang: SupportedLanguage) {
    return listOf(await this.tariffs.list(id, lang));
  }

  @Post(':id/tariffs')
  @RequirePermissions('tariffs.write')
  @Audit({ entityType: 'tariff' })
  @ApiErrorResponses(404, 422)
  async createTariff(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: CreateTariffDto,
    @CurrentUser('id') userId: string,
    @Lang() lang: SupportedLanguage,
  ) {
    return ok(await this.tariffs.create(id, dto, userId, lang));
  }

  @Patch(':id/tariffs/:tariffId')
  @RequirePermissions('tariffs.write')
  @Audit({ entityType: 'tariff', entityIdParam: 'tariffId' })
  @ApiOperation({ summary: 'Edits a tariff; `elements` (when sent) replace all components' })
  @ApiErrorResponses(404, 422)
  async updateTariff(
    @Param('id', UuidParamPipe) id: string,
    @Param('tariffId', UuidParamPipe) tariffId: string,
    @Body() dto: UpdateTariffDto,
    @CurrentUser('id') userId: string,
    @Lang() lang: SupportedLanguage,
  ) {
    return ok(await this.tariffs.update(id, tariffId, dto, userId, lang));
  }

  @Delete(':id/tariffs/:tariffId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('tariffs.write')
  @Audit({ entityType: 'tariff', entityIdParam: 'tariffId' })
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  async deleteTariff(
    @Param('id', UuidParamPipe) id: string,
    @Param('tariffId', UuidParamPipe) tariffId: string,
  ) {
    await this.tariffs.remove(id, tariffId);
  }

  // photos
  @Post(':id/photos')
  @RequirePermissions('stations.write')
  @Audit({ entityType: 'station_media' })
  @ApiOperation({ summary: 'Attaches an uploaded image (shown once ready + licensed)' })
  @ApiErrorResponses(404, 422)
  async addPhoto(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: AddStationPhotoDto,
    @CurrentUser() user: AuthUser,
  ) {
    return ok(await this.admin.addPhoto(id, dto, user));
  }

  @Delete(':id/photos/:assetId')
  @RequirePermissions('stations.write')
  @Audit({ entityType: 'station_media', entityIdParam: 'assetId' })
  @ApiErrorResponses(404)
  async removePhoto(
    @Param('id', UuidParamPipe) id: string,
    @Param('assetId', UuidParamPipe) assetId: string,
  ) {
    return ok(await this.admin.removePhoto(id, assetId));
  }
}

@ApiTags('admin-stations')
@ApiErrorResponses(401, 403)
@Controller('admin/charging-operators')
export class AdminChargingOperatorsController {
  constructor(private readonly admin: StationAdminService) {}

  @Get()
  @RequirePermissions('stations.read')
  async list(@Query() q: OperatorListQueryDto) {
    return this.admin.listOperators(q);
  }

  @Get(':id')
  @RequirePermissions('stations.read')
  @ApiErrorResponses(404)
  async get(@Param('id', UuidParamPipe) id: string) {
    return ok(await this.admin.getOperator(id));
  }

  @Post()
  @RequirePermissions('stations.write')
  @Audit({ entityType: 'charging_operator' })
  @ApiErrorResponses(422)
  async create(@Body() dto: CreateOperatorDto) {
    return ok(await this.admin.createOperator(dto));
  }

  @Patch(':id')
  @RequirePermissions('stations.write')
  @Audit({ entityType: 'charging_operator' })
  @ApiErrorResponses(404, 422)
  async update(@Param('id', UuidParamPipe) id: string, @Body() dto: UpdateOperatorDto) {
    return ok(await this.admin.updateOperator(id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('stations.write')
  @Audit({ entityType: 'charging_operator' })
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 409)
  async remove(@Param('id', UuidParamPipe) id: string) {
    await this.admin.deleteOperator(id);
  }
}

@ApiTags('admin-stations')
@ApiErrorResponses(401, 403)
@Controller('admin/station-reports')
export class AdminStationReportsController {
  constructor(private readonly moderation: StationModerationService) {}

  @Get()
  @RequireAnyPermission('reports.read', 'reports.moderate')
  @ApiOperation({ summary: 'Station reports (moderation queue)' })
  async list(@Query() q: AdminReportListQueryDto, @Lang() lang: SupportedLanguage) {
    return this.moderation.listReports(q, lang);
  }

  @Get(':id')
  @RequireAnyPermission('reports.read', 'reports.moderate')
  @ApiErrorResponses(404)
  async get(@Param('id', UuidParamPipe) id: string, @Lang() lang: SupportedLanguage) {
    return ok(await this.moderation.getReport(id, lang));
  }

  @Patch(':id')
  @RequirePermissions('reports.moderate')
  @Audit({ entityType: 'station_report' })
  @ApiOperation({ summary: 'Moves a report to in_review / resolved / rejected (or reopens it)' })
  @ApiErrorResponses(404, 422)
  async update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateReportDto,
    @CurrentUser('id') userId: string,
    @Lang() lang: SupportedLanguage,
  ) {
    return ok(await this.moderation.updateReport(id, dto, userId, lang));
  }
}

@ApiTags('admin-stations')
@ApiErrorResponses(401, 403)
@Controller('admin/station-checkins')
export class AdminStationCheckinsController {
  constructor(private readonly moderation: StationModerationService) {}

  @Get()
  @RequireAnyPermission('reports.read', 'reports.moderate')
  async list(@Query() q: AdminCheckinListQueryDto) {
    return this.moderation.listCheckins(q);
  }

  @Patch(':id')
  @RequirePermissions('reports.moderate')
  @Audit({ entityType: 'station_checkin' })
  @ApiOperation({ summary: 'Approves / hides / rejects a check-in' })
  @ApiErrorResponses(404, 422)
  async update(@Param('id', UuidParamPipe) id: string, @Body() dto: UpdateCheckinDto) {
    return ok(await this.moderation.updateCheckin(id, dto));
  }
}

@ApiTags('admin-stations')
@ApiErrorResponses(401, 403)
@Controller('admin/station-suggestions')
export class AdminStationSuggestionsController {
  constructor(private readonly moderation: StationModerationService) {}

  @Get()
  @RequirePermissions('stations.write')
  @ApiOperation({ summary: 'User-suggested stations (review queue)' })
  async list(@Query() q: AdminSuggestionListQueryDto) {
    return this.moderation.listSuggestions(q);
  }

  @Get(':id')
  @RequirePermissions('stations.write')
  @ApiOperation({ summary: 'One suggestion with the stations within 150 m' })
  @ApiErrorResponses(404)
  async get(@Param('id', UuidParamPipe) id: string, @Lang() lang: SupportedLanguage) {
    return ok(await this.moderation.getSuggestion(id, lang));
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('stations.write')
  @Audit({ entityType: 'station_suggestion' })
  @ApiOperation({
    summary: 'Creates a station from the suggestion (+ reviewer corrections); draft unless publish',
  })
  @ApiErrorResponses(404, 409, 422)
  async approve(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: ApproveSuggestionDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
  ) {
    return ok(await this.moderation.approveSuggestion(id, dto, user, lang));
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('stations.write')
  @Audit({ entityType: 'station_suggestion' })
  @ApiErrorResponses(404, 409)
  async reject(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: RejectSuggestionDto,
    @CurrentUser('id') userId: string,
    @Lang() lang: SupportedLanguage,
  ) {
    return ok(await this.moderation.rejectSuggestion(id, dto, userId, lang));
  }

  @Post(':id/duplicate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('stations.write')
  @Audit({ entityType: 'station_suggestion' })
  @ApiOperation({ summary: 'Closes the suggestion as a duplicate of an existing station' })
  @ApiErrorResponses(404, 409, 422)
  async duplicate(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: DuplicateSuggestionDto,
    @CurrentUser('id') userId: string,
    @Lang() lang: SupportedLanguage,
  ) {
    return ok(await this.moderation.markSuggestionDuplicate(id, dto, userId, lang));
  }
}

@ApiTags('admin-stations')
@ApiErrorResponses(401, 403)
@Controller('admin/station-duplicates')
export class AdminStationDuplicatesController {
  constructor(private readonly duplicates: StationDuplicatesService) {}

  @Get()
  @RequirePermissions('stations.write')
  @ApiOperation({ summary: 'Possible duplicate pairs (distance + name / operator heuristics)' })
  async list(@Query() q: DuplicateListQueryDto) {
    return this.duplicates.list(q);
  }

  @Post()
  @RequirePermissions('stations.write')
  @Audit({ entityType: 'station_duplicate' })
  @ApiOperation({ summary: 'Flags a pair by hand' })
  @ApiErrorResponses(404, 409, 422)
  async create(@Body() dto: CreateDuplicateDto) {
    return ok(await this.duplicates.create(dto));
  }

  @Post('scan')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('stations.write')
  @Audit({ entityType: 'station_duplicate', action: 'station-duplicates.scan' })
  @ApiOperation({ summary: 'Looks for duplicates of one station or of the stations of a country' })
  async scan(@Body() dto: ScanDuplicatesDto) {
    return ok(await this.duplicates.scan(dto));
  }

  @Get(':id')
  @RequirePermissions('stations.write')
  @ApiErrorResponses(404)
  async get(@Param('id', UuidParamPipe) id: string) {
    return ok(await this.duplicates.get(id));
  }

  @Post(':id/merge')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('stations.write')
  @Audit({ entityType: 'station_duplicate' })
  @ApiOperation({
    summary:
      'Merges the pair: the other station gets duplicate_of_id = keepStationId and is hidden',
  })
  @ApiErrorResponses(404, 409, 422)
  async merge(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: MergeDuplicateDto,
    @CurrentUser('id') userId: string,
  ) {
    return ok(await this.duplicates.merge(id, dto.keepStationId, dto.note, userId));
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('stations.write')
  @Audit({ entityType: 'station_duplicate' })
  @ApiErrorResponses(404, 409)
  async dismiss(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: DismissDuplicateDto,
    @CurrentUser('id') userId: string,
  ) {
    return ok(await this.duplicates.dismiss(id, dto.note, userId));
  }
}

@ApiTags('admin-stations')
@ApiErrorResponses(401, 403)
@Controller('admin/station-sync')
export class AdminStationSyncController {
  constructor(private readonly sync: StationSyncService) {}

  @Get('sources')
  @RequirePermissions('stations.import')
  @ApiOperation({ summary: 'Station sources with status, licence and last sync job' })
  async sources(@Res({ passthrough: true }) res: Response) {
    setNoStore(res);
    return listOf(await this.sync.sources());
  }

  @Post('ocm')
  @RequirePermissions('stations.import')
  @Audit({ entityType: 'import_job', action: 'station-sync.ocm.run' })
  @ApiOperation({
    summary:
      'Runs an Open Charge Map import (needs OCM_API_KEY → else 503 INTEGRATION_NOT_CONFIGURED)',
    description:
      'Idempotent upsert by (provider, external_id); unchanged records are skipped; new stations wait for review (pending_review) unless autoPublish and no possible duplicate. `wait: true` returns the finished job; otherwise poll GET /admin/station-sync/jobs/:id.',
  })
  @ApiErrorResponses(409, 422, 503)
  async runOcm(@Body() dto: OcmSyncDto, @CurrentUser('id') userId: string) {
    return ok(toImportJobView(await this.sync.startOcm(dto, userId)));
  }

  @Get('jobs')
  @RequirePermissions('stations.import')
  async jobs(@Query() q: SyncJobListQueryDto, @Res({ passthrough: true }) res: Response) {
    setNoStore(res);
    return this.sync.jobs(q);
  }

  @Get('jobs/:id')
  @RequirePermissions('stations.import')
  @ApiOperation({ summary: 'One sync job with its row results (page / pageSize apply to rows)' })
  @ApiErrorResponses(404)
  async job(
    @Param('id', UuidParamPipe) id: string,
    @Query() q: SyncJobListQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    setNoStore(res);
    return ok(await this.sync.job(id, q));
  }

  @Get('schedule')
  @RequirePermissions('stations.import')
  async getSchedule() {
    return ok(await this.sync.getSchedule());
  }

  @Put('schedule')
  @RequirePermissions('stations.import')
  @Audit({ entityType: 'integration_setting', action: 'station-sync.schedule.update' })
  @ApiOperation({ summary: 'Scheduled incremental OCM syncs per country (JOBS_ENABLED instances)' })
  @ApiErrorResponses(422)
  async putSchedule(@Body() dto: SyncScheduleDto, @CurrentUser('id') userId: string) {
    return ok(await this.sync.putSchedule(dto, userId));
  }
}

@ApiTags('admin-stations')
@ApiErrorResponses(401, 403)
@Controller('admin/station-availability')
export class AdminStationAvailabilityController {
  constructor(private readonly availability: StationAvailabilityService) {}

  @Post('observations')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('stations.import')
  @Audit({
    entityType: 'availability_observation',
    action: 'station-availability.observations.ingest',
  })
  @ApiOperation({
    summary:
      'Ingests live observations from a partner feed (expire after 10 min by default, max 24 h)',
  })
  @ApiErrorResponses(422)
  async ingest(@Body() dto: IngestObservationsDto) {
    return ok(await this.availability.ingest(dto.provider, dto.observations));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('stations.import')
  @Audit({ entityType: 'availability_observation', action: 'station-availability.refresh' })
  @ApiOperation({ summary: 'Pulls readings from the configured live provider (none by default)' })
  async refresh(@Body() dto: RefreshAvailabilityDto) {
    return ok(await this.availability.refreshFromProvider(dto.stationIds));
  }
}
