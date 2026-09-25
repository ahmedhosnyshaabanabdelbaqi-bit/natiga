import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches } from 'class-validator';
import { buildPageMeta, PaginationQueryDto, type PageMeta } from '../../../common/http/pagination';
import { Market } from '../../../common/i18n/request-locale';
import { AppException } from '../../../common/errors/app.exception';
import {
  listOf,
  ok,
  paginated,
  type DataResponse,
  type PaginatedResponse,
} from '../../../common/http/responses';
import {
  ApiDataListResponse,
  ApiDataResponse,
  ApiErrorResponses,
  ApiPaginatedResponse,
} from '../../../common/swagger/api-responses';
import { CurrentUser, type AuthUser } from '../../auth';
import { RequireAnyPermission, RequirePermissions } from '../../rbac';
import { UuidParamPipe } from '../../system';
import { MARKET_CODE_RE } from '../common/catalog-constants';
import { actorOf } from '../common/data-point';
import {
  AdminSourceDto,
  AdminSpecValueDto,
  AdminVariantMarketDto,
  AdminVehicleMediaDto,
  CreateChargingCurveDto,
  CreateChargingTimeDto,
  CreateConsumptionDto,
  CreatePriceDto,
  CreateRangeDto,
  CreateSourceDto,
  CreateVehicleMediaDto,
  DeleteSpecQueryDto,
  PriceListQueryDto,
  RebuildResultDto,
  ReplaceInletsDto,
  SourceListQueryDto,
  SpecDefinitionDto,
  UpdateChargingCurveDto,
  UpdateChargingTimeDto,
  UpdateConsumptionDto,
  UpdatePriceDto,
  UpdateRangeDto,
  UpdateSourceDto,
  UpdateVehicleMediaDto,
  UpsertSpecsDto,
  UpsertVariantMarketDto,
  VehicleMediaQueryDto,
} from '../dto/admin-data.dto';
import {
  ChargingCurveDto,
  ChargingTimeDto,
  ConsumptionDto,
  PriceDto,
  RangeDto,
} from '../dto/shared.dto';
import { VehicleSearchIndexer } from '../search/vehicle-search-indexer';
import { AdminDataService } from './admin-data.service';
import { AdminPricesService } from './admin-prices.service';
import { AdminSourcesService } from './admin-sources.service';
import {
  DataQualityRowDto,
  DataQualityService,
  QUALITY_ISSUES,
  type DataQualitySummaryDto,
} from './data-quality.service';

const READ = ['vehicles.read', 'vehicles.write'] as const;

export function marketParam(raw: string): string {
  const code = raw.toUpperCase();
  if (!MARKET_CODE_RE.test(code)) throw AppException.notFound();
  return code;
}

/** Data attached to one variant: /admin/variants/:id/... */
@ApiTags('admin-vehicles')
@ApiErrorResponses(401, 403)
@Controller('admin/variants/:id')
export class AdminVariantDataController {
  constructor(
    private readonly data: AdminDataService,
    private readonly prices: AdminPricesService,
  ) {}

  // specs
  @Get('specs')
  @Header('Cache-Control', 'no-store')
  @RequireAnyPermission(...READ)
  @ApiDataListResponse(AdminSpecValueDto)
  async specs(
    @Param('id', UuidParamPipe) id: string,
  ): Promise<PaginatedResponse<AdminSpecValueDto>> {
    await this.data.assertVariantExists(id);
    return listOf(await this.data.listSpecs(id));
  }

  @Put('specs')
  @RequirePermissions('vehicles.write')
  @ApiOperation({
    summary:
      'Upserts spec values by (specKey, marketCode) in canonical units; returns all specs of the variant',
  })
  @ApiDataListResponse(AdminSpecValueDto)
  @ApiErrorResponses(403, 404, 409, 422)
  async upsertSpecs(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpsertSpecsDto,
    @CurrentUser() user: AuthUser,
  ): Promise<PaginatedResponse<AdminSpecValueDto>> {
    return listOf(await this.data.upsertSpecs(id, dto.items, actorOf(user)));
  }

  @Delete('specs/:specKey')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('vehicles.write')
  @ApiOperation({ summary: 'Deletes one spec value (?marketCode= for a market row)' })
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  async deleteSpec(
    @Param('id', UuidParamPipe) id: string,
    @Param('specKey') specKey: string,
    @Query() query: DeleteSpecQueryDto,
  ): Promise<void> {
    await this.data.deleteSpec(id, specKey, query.marketCode ?? null);
  }

  // measurements
  @Post('ranges')
  @RequirePermissions('vehicles.write')
  @ApiOperation({ summary: 'Adds a range with its test cycle (never converted between cycles)' })
  @ApiDataResponse(RangeDto)
  @ApiErrorResponses(403, 404, 409, 422)
  async createRange(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: CreateRangeDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<RangeDto>> {
    return ok(await this.data.createRange(id, dto, actorOf(user)));
  }

  @Post('consumption')
  @RequirePermissions('vehicles.write')
  @ApiDataResponse(ConsumptionDto)
  @ApiErrorResponses(403, 404, 422)
  async createConsumption(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: CreateConsumptionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<ConsumptionDto>> {
    return ok(await this.data.createConsumption(id, dto, actorOf(user)));
  }

  @Post('charging-curves')
  @RequirePermissions('vehicles.write')
  @ApiDataResponse(ChargingCurveDto)
  @ApiErrorResponses(403, 404, 422)
  async createCurve(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: CreateChargingCurveDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<ChargingCurveDto>> {
    return ok(await this.data.createCurve(id, dto, actorOf(user)));
  }

  @Post('charging-times')
  @RequirePermissions('vehicles.write')
  @ApiOperation({ summary: 'Adds a charging time for a SoC window under a charger condition' })
  @ApiDataResponse(ChargingTimeDto)
  @ApiErrorResponses(403, 404, 422)
  async createTime(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: CreateChargingTimeDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<ChargingTimeDto>> {
    return ok(await this.data.createTime(id, dto, actorOf(user)));
  }

  // markets
  @Get('markets')
  @Header('Cache-Control', 'no-store')
  @RequireAnyPermission(...READ)
  @ApiDataListResponse(AdminVariantMarketDto)
  async markets(
    @Param('id', UuidParamPipe) id: string,
  ): Promise<PaginatedResponse<AdminVariantMarketDto>> {
    await this.data.assertVariantExists(id);
    return listOf(await this.data.listMarkets(id));
  }

  @Put('markets/:marketCode')
  @RequirePermissions('vehicles.write')
  @ApiOperation({
    summary: 'Sets availability, local name, dates and source of the variant in a market',
  })
  @ApiDataListResponse(AdminVariantMarketDto)
  @ApiErrorResponses(403, 404, 422)
  async upsertMarket(
    @Param('id', UuidParamPipe) id: string,
    @Param('marketCode') marketCode: string,
    @Body() dto: UpsertVariantMarketDto,
    @CurrentUser() user: AuthUser,
  ): Promise<PaginatedResponse<AdminVariantMarketDto>> {
    return listOf(await this.data.upsertMarket(id, marketParam(marketCode), dto, actorOf(user)));
  }

  @Delete('markets/:marketCode')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('vehicles.write')
  @ApiOperation({
    summary:
      'Removes the market row (409 when comparisons or published tours use it — set availability instead)',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 409)
  async deleteMarket(
    @Param('id', UuidParamPipe) id: string,
    @Param('marketCode') marketCode: string,
  ): Promise<void> {
    await this.data.deleteMarket(id, marketParam(marketCode));
  }

  @Put('markets/:marketCode/inlets')
  @RequirePermissions('vehicles.write')
  @ApiOperation({ summary: 'Replaces the charging inlets (AC/DC, max power) in a market' })
  @ApiDataListResponse(AdminVariantMarketDto)
  @ApiErrorResponses(403, 404, 422)
  async inlets(
    @Param('id', UuidParamPipe) id: string,
    @Param('marketCode') marketCode: string,
    @Body() dto: ReplaceInletsDto,
    @CurrentUser() user: AuthUser,
  ): Promise<PaginatedResponse<AdminVariantMarketDto>> {
    return listOf(await this.data.replaceInlets(id, marketParam(marketCode), dto, actorOf(user)));
  }

  // prices
  @Get('prices')
  @Header('Cache-Control', 'no-store')
  @RequireAnyPermission('vehicles.read', 'prices.write')
  @ApiOperation({ summary: 'Price history, newest effective date first (?marketCode=)' })
  @ApiDataListResponse(PriceDto)
  @ApiErrorResponses(404)
  async listPrices(
    @Param('id', UuidParamPipe) id: string,
    @Query() query: PriceListQueryDto,
  ): Promise<PaginatedResponse<PriceDto>> {
    return listOf(await this.prices.list(id, query.marketCode));
  }

  @Post('prices')
  @RequirePermissions('prices.write')
  @ApiOperation({
    summary:
      'Adds a price point (type, currency, effective dates, source). Never converted between currencies.',
  })
  @ApiDataResponse(PriceDto)
  @ApiErrorResponses(403, 404, 409, 422)
  async createPrice(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: CreatePriceDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<PriceDto>> {
    return ok(await this.prices.create(id, dto, actorOf(user)));
  }
}

/** Standalone rows: /admin/ranges/:id, /admin/consumption/:id, ... */
@ApiTags('admin-vehicles')
@ApiErrorResponses(401, 403)
@Controller('admin')
export class AdminMeasurementsController {
  constructor(
    private readonly data: AdminDataService,
    private readonly prices: AdminPricesService,
  ) {}

  @Get('spec-definitions')
  @Header('Cache-Control', 'no-store')
  @RequireAnyPermission(...READ)
  @ApiOperation({ summary: 'Spec keys with canonical unit, data type and comparison direction' })
  @ApiDataListResponse(SpecDefinitionDto)
  async definitions(): Promise<PaginatedResponse<SpecDefinitionDto>> {
    return listOf(await this.data.listSpecDefinitions());
  }

  @Patch('ranges/:id')
  @RequirePermissions('vehicles.write')
  @ApiDataResponse(RangeDto)
  @ApiErrorResponses(403, 404, 409, 422)
  async updateRange(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateRangeDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<RangeDto>> {
    return ok(await this.data.updateRange(id, dto, actorOf(user)));
  }

  @Delete('ranges/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('vehicles.write')
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  async deleteRange(@Param('id', UuidParamPipe) id: string): Promise<void> {
    await this.data.deleteRange(id);
  }

  @Patch('consumption/:id')
  @RequirePermissions('vehicles.write')
  @ApiDataResponse(ConsumptionDto)
  @ApiErrorResponses(403, 404, 422)
  async updateConsumption(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateConsumptionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<ConsumptionDto>> {
    return ok(await this.data.updateConsumption(id, dto, actorOf(user)));
  }

  @Delete('consumption/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('vehicles.write')
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  async deleteConsumption(@Param('id', UuidParamPipe) id: string): Promise<void> {
    await this.data.deleteConsumption(id);
  }

  @Patch('charging-curves/:id')
  @RequirePermissions('vehicles.write')
  @ApiDataResponse(ChargingCurveDto)
  @ApiErrorResponses(403, 404, 422)
  async updateCurve(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateChargingCurveDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<ChargingCurveDto>> {
    return ok(await this.data.updateCurve(id, dto, actorOf(user)));
  }

  @Delete('charging-curves/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('vehicles.write')
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  async deleteCurve(@Param('id', UuidParamPipe) id: string): Promise<void> {
    await this.data.deleteCurve(id);
  }

  @Patch('charging-times/:id')
  @RequirePermissions('vehicles.write')
  @ApiDataResponse(ChargingTimeDto)
  @ApiErrorResponses(403, 404, 422)
  async updateTime(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateChargingTimeDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<ChargingTimeDto>> {
    return ok(await this.data.updateTime(id, dto, actorOf(user)));
  }

  @Delete('charging-times/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('vehicles.write')
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  async deleteTime(@Param('id', UuidParamPipe) id: string): Promise<void> {
    await this.data.deleteTime(id);
  }

  @Patch('prices/:id')
  @RequirePermissions('prices.write')
  @ApiDataResponse(PriceDto)
  @ApiErrorResponses(403, 404, 409, 422)
  async updatePrice(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdatePriceDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<PriceDto>> {
    return ok(await this.prices.update(id, dto, actorOf(user)));
  }

  @Delete('prices/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('prices.write')
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  async deletePrice(@Param('id', UuidParamPipe) id: string): Promise<void> {
    await this.prices.remove(id);
  }

  // gallery
  @Get('vehicle-media')
  @Header('Cache-Control', 'no-store')
  @RequireAnyPermission(...READ)
  @ApiOperation({ summary: 'Gallery of one model, generation or variant' })
  @ApiDataListResponse(AdminVehicleMediaDto)
  @ApiErrorResponses(422)
  async listMedia(
    @Query() query: VehicleMediaQueryDto,
  ): Promise<PaginatedResponse<AdminVehicleMediaDto>> {
    return listOf(await this.data.listMedia(query));
  }

  @Post('vehicle-media')
  @RequirePermissions('vehicles.write')
  @ApiOperation({ summary: 'Adds a licensed, ready image to a gallery (never a panorama)' })
  @ApiDataResponse(AdminVehicleMediaDto)
  @ApiErrorResponses(404, 422)
  async createMedia(
    @Body() dto: CreateVehicleMediaDto,
  ): Promise<DataResponse<AdminVehicleMediaDto>> {
    return ok(await this.data.createMedia(dto));
  }

  @Patch('vehicle-media/:id')
  @RequirePermissions('vehicles.write')
  @ApiDataResponse(AdminVehicleMediaDto)
  @ApiErrorResponses(404, 422)
  async updateMedia(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateVehicleMediaDto,
  ): Promise<DataResponse<AdminVehicleMediaDto>> {
    return ok(await this.data.updateMedia(id, dto));
  }

  @Delete('vehicle-media/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('vehicles.write')
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  async deleteMedia(@Param('id', UuidParamPipe) id: string): Promise<void> {
    await this.data.deleteMedia(id);
  }
}

@ApiTags('admin-vehicles')
@ApiErrorResponses(401, 403)
@Controller('admin/spec-sources')
export class AdminSourcesController {
  constructor(private readonly sources: AdminSourcesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequireAnyPermission('vehicles.read', 'sources.write', 'stations.read')
  @ApiOperation({ summary: 'Data sources (spec sheets, homologation, press, tests, dealers…)' })
  @ApiPaginatedResponse(AdminSourceDto)
  async list(@Query() query: SourceListQueryDto): Promise<PaginatedResponse<AdminSourceDto>> {
    const { items, total, page } = await this.sources.list(query);
    return paginated(items, total, page);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @RequireAnyPermission('vehicles.read', 'sources.write', 'stations.read')
  @ApiOperation({ summary: 'One source with the number of rows citing it' })
  @ApiDataResponse(AdminSourceDto)
  @ApiErrorResponses(404)
  async get(@Param('id', UuidParamPipe) id: string): Promise<DataResponse<AdminSourceDto>> {
    return ok(await this.sources.get(id));
  }

  @Post()
  @RequirePermissions('sources.write')
  @ApiDataResponse(AdminSourceDto)
  @ApiErrorResponses(422)
  async create(
    @Body() dto: CreateSourceDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminSourceDto>> {
    return ok(await this.sources.create(dto, actorOf(user)));
  }

  @Patch(':id')
  @RequirePermissions('sources.write')
  @ApiDataResponse(AdminSourceDto)
  @ApiErrorResponses(404, 422)
  async update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateSourceDto,
  ): Promise<DataResponse<AdminSourceDto>> {
    return ok(await this.sources.update(id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('sources.write')
  @ApiOperation({ summary: 'Deletes an unused source (409 IN_USE with counts otherwise)' })
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 409)
  async remove(@Param('id', UuidParamPipe) id: string): Promise<void> {
    await this.sources.remove(id);
  }
}

export class DataQualityQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'EG', description: 'Default: the request market.' })
  @IsOptional()
  @Matches(MARKET_CODE_RE)
  marketCode?: string;

  @ApiPropertyOptional({ enum: QUALITY_ISSUES, description: 'Only trims with this issue.' })
  @IsOptional()
  @IsIn(QUALITY_ISSUES)
  issue?: string;
}

@ApiTags('admin-vehicles')
@ApiErrorResponses(401, 403)
@Controller('admin/vehicles/data-quality')
export class AdminDataQualityController {
  constructor(private readonly quality: DataQualityService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequireAnyPermission('vehicles.read', 'analytics.read')
  @ApiOperation({
    summary:
      'Stale / incomplete catalog data of a market: missing or unsourced key specs, no range, no or stale local price, no images, no inlets (summary in meta)',
  })
  @ApiPaginatedResponse(DataQualityRowDto)
  async report(
    @Query() query: DataQualityQueryDto,
    @Market() market: string,
  ): Promise<{
    data: DataQualityRowDto[];
    meta: PageMeta & { summary: DataQualitySummaryDto };
  }> {
    const r = await this.quality.report(query.marketCode ?? market, query.issue, query);
    return {
      data: r.items,
      meta: { ...buildPageMeta(r.total, r.page.page, r.page.pageSize), summary: r.summary },
    };
  }
}

@ApiTags('admin-vehicles')
@ApiErrorResponses(401, 403)
@Controller('admin/vehicles/search-index')
export class AdminVehicleSearchController {
  constructor(private readonly search: VehicleSearchIndexer) {}

  @Post('rebuild')
  @HttpCode(HttpStatus.OK)
  @RequireAnyPermission('search.manage', 'vehicles.publish')
  @ApiOperation({ summary: 'Rebuilds the search documents of brands, models and variants' })
  @ApiDataResponse(RebuildResultDto)
  async rebuild(): Promise<DataResponse<RebuildResultDto>> {
    return ok({ models: await this.search.rebuildAll() });
  }
}
