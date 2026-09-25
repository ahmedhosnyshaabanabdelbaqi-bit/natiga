import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { SupportedLanguage } from '../../../config/app-config';
import { ok, type DataResponse, type PaginatedResponse } from '../../../common/http/responses';
import { ApiLocale, Lang, Market } from '../../../common/i18n/request-locale';
import {
  ApiDataResponse,
  ApiErrorResponses,
  ApiPaginatedResponse,
} from '../../../common/swagger/api-responses';
import { RateLimit } from '../../../common/throttle/rate-limit.decorator';
import { ApiAccessToken, CurrentUser, Public, type AuthUser } from '../../auth';
import { UuidParamPipe } from '../../system/uuid-param.pipe';
import { setNoStore, setPublicCache } from '../common/values';
import {
  CreateStationCheckinDto,
  CreateStationReportDto,
  CreateStationSuggestionDto,
  MyCheckinDto,
  MyListQueryDto,
  MyReportDto,
  MySuggestionDto,
  SuggestionCreatedDto,
} from '../dto/community.dto';
import {
  StationAvailabilityResponseDto,
  StationClusterDto,
  StationClusterQueryDto,
  StationDetailDto,
  StationDetailQueryDto,
  StationListItemDto,
  StationSearchQueryDto,
  StationsMetaDto,
  VehicleCompatibilityDto,
} from '../dto/public.dto';
import { StationCommunityService } from '../services/station-community.service';
import { StationDetailService } from '../services/station-detail.service';
import { StationMetaService } from '../services/station-meta.service';
import { type SearchResult, StationSearchService } from '../services/station-search.service';

@ApiTags('stations')
@Controller('stations')
export class PublicStationsController {
  constructor(
    private readonly search: StationSearchService,
    private readonly details: StationDetailService,
    private readonly meta: StationMetaService,
    private readonly community: StationCommunityService,
  ) {}

  @Get()
  @Public()
  @ApiLocale()
  @RateLimit('search')
  @ApiOperation({
    summary: 'Map + list search (bbox or point + radius) with filters',
    description:
      'Needs `bbox` or `lat`+`lng`. Connector filters (types, current, minPowerKw, vehicle) must be met by one connector. Vehicle compatibility uses verified inlet data only (422 VEHICLE_COMPATIBILITY_UNKNOWN otherwise). `openNow` uses opening hours in the station time zone. Cursor pagination; `meta.truncated` = more than 2000 matches (zoom in or use /stations/clusters).',
  })
  @ApiExtraModels(StationListItemDto, VehicleCompatibilityDto)
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: getSchemaPath(StationListItemDto) } },
        meta: {
          type: 'object',
          properties: {
            nextCursor: { type: 'string', nullable: true },
            pageSize: { type: 'number' },
            total: { type: 'number' },
            truncated: { type: 'boolean' },
            center: {
              type: 'object',
              nullable: true,
              properties: { lat: { type: 'number' }, lng: { type: 'number' } },
            },
            compatibility: {
              allOf: [{ $ref: getSchemaPath(VehicleCompatibilityDto) }],
              nullable: true,
            },
            liveAvailability: {
              type: 'object',
              properties: {
                configured: { type: 'boolean' },
                provider: { type: 'string', nullable: true },
              },
            },
          },
        },
      },
    },
  })
  @ApiErrorResponses(401, 422, 429)
  async list(
    @Query() query: StationSearchQueryDto,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @CurrentUser() user: AuthUser | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SearchResult> {
    if (query.userVehicleId) setNoStore(res);
    else setPublicCache(res, 30);
    return this.search.search(query, lang, market, user?.id);
  }

  @Get('clusters')
  @Public()
  @ApiLocale()
  @RateLimit('search')
  @ApiOperation({
    summary: 'Grid clusters for low zoom levels (same filters as the list, no openNow)',
  })
  @ApiExtraModels(StationClusterDto)
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: getSchemaPath(StationClusterDto) } },
        meta: {
          type: 'object',
          properties: {
            cellSizeDeg: { type: 'number' },
            total: { type: 'number' },
            zoom: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiErrorResponses(401, 422, 429)
  async clusters(
    @Query() query: StationClusterQueryDto,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @CurrentUser() user: AuthUser | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (query.userVehicleId) setNoStore(res);
    else setPublicCache(res, 60);
    return this.search.clusters(query, lang, market, user?.id);
  }

  @Get('meta')
  @Public()
  @ApiLocale()
  @ApiOperation({
    summary: 'Reference data for filters / reports / check-ins (connector types, amenities…)',
  })
  @ApiDataResponse(StationsMetaDto)
  async stationsMeta(
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<StationsMetaDto>> {
    setPublicCache(res, 300);
    return ok(await this.meta.meta(lang));
  }

  @Post('suggestions')
  @RateLimit('reports')
  @ApiAccessToken()
  @ApiOperation({
    summary: 'Suggests a missing station (review queue; never shown before approval)',
  })
  @ApiBody({ type: CreateStationSuggestionDto })
  @ApiExtraModels(SuggestionCreatedDto)
  @ApiCreatedResponse({
    schema: {
      type: 'object',
      properties: { data: { $ref: getSchemaPath(SuggestionCreatedDto) } },
    },
  })
  @ApiErrorResponses(401, 422, 429)
  async suggest(
    @Body() dto: CreateStationSuggestionDto,
    @CurrentUser('id') userId: string,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<SuggestionCreatedDto>> {
    return ok(await this.community.createSuggestion(dto, userId, lang));
  }

  @Get(':idOrSlug')
  @Public()
  @ApiLocale()
  @ApiOperation({
    summary: 'Station page: hours + open now, connectors, tariffs, live availability, community',
    description:
      'Published stations only (id or slug). A station merged into another answers 404 STATION_MERGED with details.mergedIntoId. Three separate statuses: operationalStatus, hours.openNow, availability (live only; expired → unknown).',
  })
  @ApiDataResponse(StationDetailDto)
  @ApiErrorResponses(401, 404, 422)
  async detail(
    @Param('idOrSlug') idOrSlug: string,
    @Query() query: StationDetailQueryDto,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @CurrentUser() user: AuthUser | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<StationDetailDto>> {
    if (query.userVehicleId) setNoStore(res);
    else setPublicCache(res, 30);
    return ok(await this.details.detail(idOrSlug, query, lang, market, user?.id));
  }

  @Get(':idOrSlug/availability')
  @Public()
  @ApiLocale()
  @ApiOperation({ summary: 'Live availability of the connectors (expired → unknown)' })
  @ApiDataResponse(StationAvailabilityResponseDto)
  @ApiErrorResponses(404)
  async availability(
    @Param('idOrSlug') idOrSlug: string,
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<StationAvailabilityResponseDto>> {
    res.setHeader('Cache-Control', 'public, max-age=15');
    return ok(await this.details.availabilityOf(idOrSlug, lang));
  }

  @Post(':idOrSlug/reports')
  @RateLimit('reports')
  @ApiAccessToken()
  @ApiOperation({
    summary: 'Reports a problem (moderated; community data, not live status)',
    description:
      '409 STATION_REPORT_DUPLICATE when the user already has an open report of the same type; 429 STATION_REPORT_LIMIT after 20 reports in 24 h.',
  })
  @ApiBody({ type: CreateStationReportDto })
  @ApiDataResponse(MyReportDto)
  @ApiErrorResponses(401, 404, 409, 422, 429)
  async report(
    @Param('idOrSlug') idOrSlug: string,
    @Body() dto: CreateStationReportDto,
    @CurrentUser('id') userId: string,
    @Lang() lang: SupportedLanguage,
    @Req() req: Request,
  ): Promise<DataResponse<MyReportDto>> {
    return ok(await this.community.createReport(idOrSlug, dto, userId, req.ip, lang));
  }

  @Post(':idOrSlug/checkins')
  @RateLimit('write')
  @ApiAccessToken()
  @ApiOperation({
    summary: 'Checks in at a station (dated community data, never live availability)',
    description: '429 STATION_CHECKIN_TOO_SOON: one check-in per station per 10 minutes.',
  })
  @ApiBody({ type: CreateStationCheckinDto })
  @ApiDataResponse(MyCheckinDto)
  @ApiErrorResponses(401, 404, 422, 429)
  async checkin(
    @Param('idOrSlug') idOrSlug: string,
    @Body() dto: CreateStationCheckinDto,
    @CurrentUser('id') userId: string,
  ): Promise<DataResponse<MyCheckinDto>> {
    return ok(await this.community.createCheckin(idOrSlug, dto, userId));
  }
}

@ApiTags('me')
@ApiAccessToken()
@ApiErrorResponses(401)
@Controller('me')
export class MeStationsController {
  constructor(private readonly community: StationCommunityService) {}

  @Get('station-suggestions')
  @ApiOperation({ summary: 'My suggested stations and their review status' })
  @ApiPaginatedResponse(MySuggestionDto)
  async suggestions(
    @Query() query: MyListQueryDto,
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<MySuggestionDto>> {
    setNoStore(res);
    return this.community.mySuggestions(userId, query);
  }

  @Post('station-suggestions/:id/withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Withdraws one of my pending suggestions' })
  @ApiDataResponse(MySuggestionDto)
  @ApiErrorResponses(404, 409)
  async withdraw(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser('id') userId: string,
  ): Promise<DataResponse<MySuggestionDto>> {
    return ok(await this.community.withdrawSuggestion(id, userId));
  }

  @Get('station-reports')
  @ApiOperation({ summary: 'My station reports and their moderation status' })
  @ApiPaginatedResponse(MyReportDto)
  async reports(
    @Query() query: MyListQueryDto,
    @CurrentUser('id') userId: string,
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<MyReportDto>> {
    setNoStore(res);
    return this.community.myReports(userId, query, lang);
  }
}
