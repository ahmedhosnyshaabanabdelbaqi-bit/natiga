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
import {
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
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
import { Audit } from '../../audit';
import { CurrentUser, type AuthUser } from '../../auth';
import { RequirePermissions } from '../../rbac';
import { UuidParamPipe } from '../../system';
import {
  AdminTourDetailDto,
  AdminTourDto,
  AdminTourListQueryDto,
  CreateHotspotDto,
  CreateSceneDto,
  CreateTourDto,
  ReorderDto,
  ReturnTourDto,
  TourReadinessDto,
  UpdateHotspotDto,
  UpdateSceneDto,
  UpdateTourDto,
} from '../dto/admin-tour.dto';
import { ToursAdminService } from '../services/tours-admin.service';

const created = () =>
  ApiCreatedResponse({
    schema: { type: 'object', properties: { data: { $ref: getSchemaPath(AdminTourDetailDto) } } },
  });

@ApiTags('admin-tours')
@ApiErrorResponses(401, 403)
@ApiExtraModels(AdminTourDetailDto)
@Audit({ entityType: 'tour' })
@Controller('admin/tours')
export class AdminToursController {
  constructor(private readonly tours: ToursAdminService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('tours.read')
  @ApiOperation({
    summary:
      'Tours incl. drafts (variantId, modelYearId, marketCode, status, matchType, q, isDemo)',
  })
  @ApiPaginatedResponse(AdminTourDto)
  async list(@Query() query: AdminTourListQueryDto): Promise<PaginatedResponse<AdminTourDto>> {
    const { items, total, page } = await this.tours.list(query);
    return paginated(items, total, page);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('tours.read')
  @ApiOperation({ summary: 'Tour editor data: scenes, files, hotspots, readiness to publish' })
  @ApiDataResponse(AdminTourDetailDto)
  @ApiErrorResponses(404)
  async get(@Param('id', UuidParamPipe) id: string): Promise<DataResponse<AdminTourDetailDto>> {
    return ok(await this.tours.detail(id));
  }

  @Get(':id/readiness')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('tours.read')
  @ApiOperation({ summary: 'What still blocks publication (files, licences, checks, approval)' })
  @ApiDataResponse(TourReadinessDto)
  @ApiErrorResponses(404)
  async readiness(@Param('id', UuidParamPipe) id: string): Promise<DataResponse<TourReadinessDto>> {
    return ok(await this.tours.readinessOf(id));
  }

  @Post()
  @RequirePermissions('tours.write')
  @ApiOperation({
    summary: 'Creates a draft tour bound to trim + market + drive side + interior colour',
  })
  @created()
  @ApiErrorResponses(409, 422)
  async create(
    @Body() dto: CreateTourDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminTourDetailDto>> {
    return ok(await this.tours.create(dto, user.id));
  }

  @Patch(':id')
  @RequirePermissions('tours.write')
  @ApiOperation({
    summary: 'Edits a tour (binding fields locked while published; reference edits reset approval)',
  })
  @ApiDataResponse(AdminTourDetailDto)
  @ApiErrorResponses(404, 409, 422)
  async update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateTourDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminTourDetailDto>> {
    return ok(await this.tours.update(id, dto, user.id));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('tours.write')
  @ApiOperation({ summary: 'Soft-deletes an unpublished tour' })
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 409)
  async remove(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.tours.remove(id, user.id);
  }

  // --- workflow ---------------------------------------------------------------------

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('tours.write')
  @ApiOperation({ summary: 'draft → in_review' })
  @ApiDataResponse(AdminTourDetailDto)
  @ApiErrorResponses(404, 409)
  async submit(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminTourDetailDto>> {
    return ok(await this.tours.submit(id, user.id));
  }

  @Post(':id/return')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('tours.publish')
  @ApiOperation({ summary: 'in_review → draft with a review note' })
  @ApiDataResponse(AdminTourDetailDto)
  @ApiErrorResponses(404, 409, 422)
  async returnToDraft(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: ReturnTourDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminTourDetailDto>> {
    return ok(await this.tours.returnToDraft(id, dto.note, user.id));
  }

  @Post(':id/approve-reference')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('tours.approve_reference')
  @ApiOperation({
    summary: 'Approves a reference tour of a similar trim (difference notes required)',
  })
  @ApiDataResponse(AdminTourDetailDto)
  @ApiErrorResponses(404, 409, 422)
  async approve(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminTourDetailDto>> {
    return ok(await this.tours.approveReference(id, user.id));
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('tours.publish')
  @ApiOperation({
    summary:
      'Publishes when every file is ready + licensed + visually confirmed (409 TOUR_NOT_PUBLISHABLE)',
  })
  @ApiDataResponse(AdminTourDetailDto)
  @ApiErrorResponses(404, 409, 422)
  async publish(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminTourDetailDto>> {
    return ok(await this.tours.publish(id, user.id));
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('tours.publish')
  @ApiOperation({ summary: 'published → draft' })
  @ApiDataResponse(AdminTourDetailDto)
  @ApiErrorResponses(404, 409)
  async unpublish(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminTourDetailDto>> {
    return ok(await this.tours.unpublish(id, user.id));
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('tours.publish')
  @ApiOperation({ summary: 'Archives the tour (hidden from the apps)' })
  @ApiDataResponse(AdminTourDetailDto)
  @ApiErrorResponses(404, 409)
  async archive(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminTourDetailDto>> {
    return ok(await this.tours.archive(id, user.id));
  }

  // --- scenes -----------------------------------------------------------------------

  @Post(':id/scenes')
  @RequirePermissions('tours.write')
  @ApiOperation({
    summary:
      'Adds a scene (one panorama per seat position; the first scene becomes the initial one)',
  })
  @created()
  @ApiErrorResponses(404, 409, 422)
  async createScene(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: CreateSceneDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminTourDetailDto>> {
    return ok(await this.tours.createScene(id, dto, user.id));
  }

  @Put(':id/scenes/order')
  @RequirePermissions('tours.write')
  @ApiOperation({ summary: 'Reorders the scenes (every scene id once)' })
  @ApiDataResponse(AdminTourDetailDto)
  @ApiErrorResponses(404, 422)
  async reorderScenes(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: ReorderDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminTourDetailDto>> {
    return ok(await this.tours.reorderScenes(id, dto.ids, user.id));
  }

  @Patch(':id/scenes/:sceneId')
  @RequirePermissions('tours.write')
  @ApiOperation({ summary: 'Edits a scene (default yaw / pitch / hfov, limits, file swap)' })
  @ApiDataResponse(AdminTourDetailDto)
  @ApiErrorResponses(404, 409, 422)
  async updateScene(
    @Param('id', UuidParamPipe) id: string,
    @Param('sceneId', UuidParamPipe) sceneId: string,
    @Body() dto: UpdateSceneDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminTourDetailDto>> {
    return ok(await this.tours.updateScene(id, sceneId, dto, user.id));
  }

  @Delete(':id/scenes/:sceneId')
  @RequirePermissions('tours.write')
  @ApiOperation({ summary: 'Removes a scene (its hotspots and links to it too)' })
  @ApiDataResponse(AdminTourDetailDto)
  @ApiErrorResponses(404, 409)
  async deleteScene(
    @Param('id', UuidParamPipe) id: string,
    @Param('sceneId', UuidParamPipe) sceneId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminTourDetailDto>> {
    return ok(await this.tours.deleteScene(id, sceneId, user.id));
  }

  // --- hotspots ---------------------------------------------------------------------

  @Post(':id/scenes/:sceneId/hotspots')
  @RequirePermissions('tours.write')
  @ApiOperation({
    summary:
      'Adds a hotspot (info / detail_image / video / spec_link / scene_link; plain ar/en texts)',
  })
  @created()
  @ApiErrorResponses(404, 409, 422)
  async createHotspot(
    @Param('id', UuidParamPipe) id: string,
    @Param('sceneId', UuidParamPipe) sceneId: string,
    @Body() dto: CreateHotspotDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminTourDetailDto>> {
    return ok(await this.tours.createHotspot(id, sceneId, dto, user.id));
  }

  @Put(':id/scenes/:sceneId/hotspots/order')
  @RequirePermissions('tours.write')
  @ApiOperation({ summary: 'Reorders the hotspots of a scene' })
  @ApiDataResponse(AdminTourDetailDto)
  @ApiErrorResponses(404, 422)
  async reorderHotspots(
    @Param('id', UuidParamPipe) id: string,
    @Param('sceneId', UuidParamPipe) sceneId: string,
    @Body() dto: ReorderDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminTourDetailDto>> {
    return ok(await this.tours.reorderHotspots(id, sceneId, dto.ids, user.id));
  }

  @Patch(':id/hotspots/:hotspotId')
  @RequirePermissions('tours.write')
  @ApiOperation({ summary: 'Edits a hotspot (texts per locale: object replaces, null removes)' })
  @ApiDataResponse(AdminTourDetailDto)
  @ApiErrorResponses(404, 409, 422)
  async updateHotspot(
    @Param('id', UuidParamPipe) id: string,
    @Param('hotspotId', UuidParamPipe) hotspotId: string,
    @Body() dto: UpdateHotspotDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminTourDetailDto>> {
    return ok(await this.tours.updateHotspot(id, hotspotId, dto, user.id));
  }

  @Delete(':id/hotspots/:hotspotId')
  @RequirePermissions('tours.write')
  @ApiDataResponse(AdminTourDetailDto)
  @ApiErrorResponses(404)
  async deleteHotspot(
    @Param('id', UuidParamPipe) id: string,
    @Param('hotspotId', UuidParamPipe) hotspotId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminTourDetailDto>> {
    return ok(await this.tours.deleteHotspot(id, hotspotId, user.id));
  }
}
