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
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ok,
  paginated,
  type DataResponse,
  type PaginatedResponse,
} from '../../../common/http/responses';
import {
  ApiDataResponse,
  ApiErrorResponses,
  ApiPaginatedResponse,
} from '../../../common/swagger/api-responses';
import { CurrentUser, type AuthUser } from '../../auth';
import { RequireAnyPermission, RequirePermissions } from '../../rbac';
import { UuidParamPipe } from '../../system';
import { actorOf } from '../common/data-point';
import {
  AdminBrandDto,
  AdminCatalogListQueryDto,
  AdminGenerationDto,
  AdminModelDetailDto,
  AdminModelDto,
  AdminModelListQueryDto,
  AdminModelYearDto,
  AdminVariantDto,
  AdminVariantListQueryDto,
  CreateBrandDto,
  CreateGenerationDto,
  CreateModelDto,
  CreateModelYearDto,
  CreateVariantDto,
  ReplaceCompetitorsDto,
  UpdateBrandDto,
  UpdateGenerationDto,
  UpdateModelDto,
  UpdateVariantDto,
} from '../dto/admin-catalog.dto';
import { AdminVariantDetailDto } from '../dto/admin-data.dto';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminDataService } from './admin-data.service';

const READ = ['vehicles.read', 'vehicles.write'] as const;

@ApiTags('admin-vehicles')
@ApiErrorResponses(401, 403)
@Controller('admin/brands')
export class AdminBrandsController {
  constructor(private readonly catalog: AdminCatalogService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequireAnyPermission(...READ)
  @ApiOperation({ summary: 'Brands incl. drafts (search q, status, includeDeleted)' })
  @ApiPaginatedResponse(AdminBrandDto)
  async list(@Query() query: AdminCatalogListQueryDto): Promise<PaginatedResponse<AdminBrandDto>> {
    const { items, total, page } = await this.catalog.listBrands(query);
    return paginated(items, total, page);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @RequireAnyPermission(...READ)
  @ApiDataResponse(AdminBrandDto)
  @ApiErrorResponses(404)
  async get(@Param('id', UuidParamPipe) id: string): Promise<DataResponse<AdminBrandDto>> {
    return ok(await this.catalog.getBrand(id));
  }

  @Post()
  @RequirePermissions('vehicles.write')
  @ApiOperation({ summary: 'Creates a brand (draft unless the caller may publish)' })
  @ApiDataResponse(AdminBrandDto)
  @ApiErrorResponses(409, 422)
  async create(
    @Body() dto: CreateBrandDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminBrandDto>> {
    return ok(await this.catalog.createBrand(dto, actorOf(user)));
  }

  @Patch(':id')
  @RequirePermissions('vehicles.write')
  @ApiOperation({ summary: 'Edits a brand; status changes need vehicles.publish' })
  @ApiDataResponse(AdminBrandDto)
  @ApiErrorResponses(404, 409, 422)
  async update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateBrandDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminBrandDto>> {
    return ok(await this.catalog.updateBrand(id, dto, actorOf(user)));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('vehicles.delete')
  @ApiOperation({ summary: 'Soft-deletes a brand without live models (409 IN_USE otherwise)' })
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 409)
  async remove(@Param('id', UuidParamPipe) id: string): Promise<void> {
    await this.catalog.deleteBrand(id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('vehicles.delete')
  @ApiDataResponse(AdminBrandDto)
  @ApiErrorResponses(404)
  async restore(@Param('id', UuidParamPipe) id: string): Promise<DataResponse<AdminBrandDto>> {
    return ok(await this.catalog.restoreBrand(id));
  }
}

@ApiTags('admin-vehicles')
@ApiErrorResponses(401, 403)
@Controller('admin/models')
export class AdminModelsController {
  constructor(private readonly catalog: AdminCatalogService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequireAnyPermission(...READ)
  @ApiOperation({ summary: 'Models incl. drafts (filter brandId, q, status)' })
  @ApiPaginatedResponse(AdminModelDto)
  async list(@Query() query: AdminModelListQueryDto): Promise<PaginatedResponse<AdminModelDto>> {
    const { items, total, page } = await this.catalog.listModels(query);
    return paginated(items, total, page);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @RequireAnyPermission(...READ)
  @ApiOperation({ summary: 'Model with its generation → year → variant tree and competitors' })
  @ApiDataResponse(AdminModelDetailDto)
  @ApiErrorResponses(404)
  async get(@Param('id', UuidParamPipe) id: string): Promise<DataResponse<AdminModelDetailDto>> {
    return ok(await this.catalog.getModel(id));
  }

  @Post()
  @RequirePermissions('vehicles.write')
  @ApiDataResponse(AdminModelDto)
  @ApiErrorResponses(409, 422)
  async create(
    @Body() dto: CreateModelDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminModelDto>> {
    return ok(await this.catalog.createModel(dto, actorOf(user)));
  }

  @Patch(':id')
  @RequirePermissions('vehicles.write')
  @ApiDataResponse(AdminModelDto)
  @ApiErrorResponses(404, 409, 422)
  async update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateModelDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminModelDto>> {
    return ok(await this.catalog.updateModel(id, dto, actorOf(user)));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('vehicles.delete')
  @ApiOperation({ summary: 'Soft-deletes a model without live variants (409 IN_USE otherwise)' })
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 409)
  async remove(@Param('id', UuidParamPipe) id: string): Promise<void> {
    await this.catalog.deleteModel(id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('vehicles.delete')
  @ApiDataResponse(AdminModelDto)
  @ApiErrorResponses(404, 409)
  async restore(@Param('id', UuidParamPipe) id: string): Promise<DataResponse<AdminModelDto>> {
    return ok(await this.catalog.restoreModel(id));
  }

  @Put(':id/competitors')
  @RequirePermissions('vehicles.write')
  @ApiOperation({ summary: 'Replaces the curated competitor list (ordered)' })
  @ApiDataResponse(ReplaceCompetitorsDto)
  @ApiErrorResponses(404, 422)
  async competitors(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: ReplaceCompetitorsDto,
  ): Promise<DataResponse<ReplaceCompetitorsDto>> {
    return ok({
      competitorModelIds: await this.catalog.replaceCompetitors(id, dto.competitorModelIds),
    });
  }
}

@ApiTags('admin-vehicles')
@ApiErrorResponses(401, 403)
@Controller('admin/generations')
export class AdminGenerationsController {
  constructor(private readonly catalog: AdminCatalogService) {}

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @RequireAnyPermission(...READ)
  @ApiDataResponse(AdminGenerationDto)
  @ApiErrorResponses(404)
  async get(@Param('id', UuidParamPipe) id: string): Promise<DataResponse<AdminGenerationDto>> {
    return ok(await this.catalog.getGeneration(id));
  }

  @Post()
  @RequirePermissions('vehicles.write')
  @ApiDataResponse(AdminGenerationDto)
  @ApiErrorResponses(409, 422)
  async create(@Body() dto: CreateGenerationDto): Promise<DataResponse<AdminGenerationDto>> {
    return ok(await this.catalog.createGeneration(dto));
  }

  @Patch(':id')
  @RequirePermissions('vehicles.write')
  @ApiDataResponse(AdminGenerationDto)
  @ApiErrorResponses(404, 409, 422)
  async update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateGenerationDto,
  ): Promise<DataResponse<AdminGenerationDto>> {
    return ok(await this.catalog.updateGeneration(id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('vehicles.delete')
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 409)
  async remove(@Param('id', UuidParamPipe) id: string): Promise<void> {
    await this.catalog.deleteGeneration(id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('vehicles.delete')
  @ApiDataResponse(AdminGenerationDto)
  @ApiErrorResponses(404, 409)
  async restore(@Param('id', UuidParamPipe) id: string): Promise<DataResponse<AdminGenerationDto>> {
    return ok(await this.catalog.restoreGeneration(id));
  }
}

@ApiTags('admin-vehicles')
@ApiErrorResponses(401, 403)
@Controller('admin/model-years')
export class AdminModelYearsController {
  constructor(private readonly catalog: AdminCatalogService) {}

  @Post()
  @RequirePermissions('vehicles.write')
  @ApiDataResponse(AdminModelYearDto)
  @ApiErrorResponses(409, 422)
  async create(@Body() dto: CreateModelYearDto): Promise<DataResponse<AdminModelYearDto>> {
    return ok(await this.catalog.createModelYear(dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('vehicles.delete')
  @ApiOperation({ summary: 'Deletes a model year that has no variants (409 IN_USE otherwise)' })
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 409)
  async remove(@Param('id', UuidParamPipe) id: string): Promise<void> {
    await this.catalog.deleteModelYear(id);
  }
}

@ApiTags('admin-vehicles')
@ApiErrorResponses(401, 403)
@Controller('admin/variants')
export class AdminVariantsController {
  constructor(
    private readonly catalog: AdminCatalogService,
    private readonly data: AdminDataService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequireAnyPermission(...READ)
  @ApiOperation({
    summary: 'Variants (trims) incl. drafts — filter brand/model/generation/year/powertrain/market',
  })
  @ApiPaginatedResponse(AdminVariantDto)
  async list(
    @Query() query: AdminVariantListQueryDto,
  ): Promise<PaginatedResponse<AdminVariantDto>> {
    const { items, total, page } = await this.catalog.listVariants(query);
    return paginated(items, total, page);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @RequireAnyPermission(...READ)
  @ApiOperation({
    summary:
      'Everything about a variant: markets + inlets, specs, ranges, consumption, charging, prices, gallery',
  })
  @ApiDataResponse(AdminVariantDetailDto)
  @ApiErrorResponses(404)
  async get(@Param('id', UuidParamPipe) id: string): Promise<DataResponse<AdminVariantDetailDto>> {
    return ok(await this.data.getVariantDetail(id));
  }

  @Post()
  @RequirePermissions('vehicles.write')
  @ApiOperation({
    summary: 'Creates a variant with ONE powertrain type (BEV / PHEV / EREV / HEV)',
  })
  @ApiDataResponse(AdminVariantDto)
  @ApiErrorResponses(409, 422)
  async create(
    @Body() dto: CreateVariantDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminVariantDto>> {
    return ok(await this.catalog.createVariant(dto, actorOf(user)));
  }

  @Patch(':id')
  @RequirePermissions('vehicles.write')
  @ApiOperation({
    summary:
      'Edits a variant; status changes need vehicles.publish; powertrain changes that would mix BEV and hybrid data are refused',
  })
  @ApiDataResponse(AdminVariantDto)
  @ApiErrorResponses(404, 409, 422)
  async update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateVariantDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminVariantDto>> {
    return ok(await this.catalog.updateVariant(id, dto, actorOf(user)));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('vehicles.delete')
  @ApiOperation({ summary: 'Soft-deletes a variant (data kept; hidden everywhere)' })
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  async remove(@Param('id', UuidParamPipe) id: string): Promise<void> {
    await this.catalog.deleteVariant(id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('vehicles.delete')
  @ApiDataResponse(AdminVariantDto)
  @ApiErrorResponses(404, 409)
  async restore(@Param('id', UuidParamPipe) id: string): Promise<DataResponse<AdminVariantDto>> {
    return ok(await this.catalog.restoreVariant(id));
  }
}
