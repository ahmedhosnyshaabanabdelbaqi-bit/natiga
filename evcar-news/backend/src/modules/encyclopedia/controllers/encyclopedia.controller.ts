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
  Query,
  Res,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { SupportedLanguage } from '../../../config/app-config';
import {
  listOf,
  ok,
  type DataResponse,
  type PaginatedResponse,
} from '../../../common/http/responses';
import { ApiLocale, Lang } from '../../../common/i18n/request-locale';
import {
  ApiDataListResponse,
  ApiDataResponse,
  ApiErrorResponses,
  ApiPaginatedResponse,
} from '../../../common/swagger/api-responses';
import { Audit } from '../../audit';
import { CurrentUser, Public, type AuthUser } from '../../auth';
import { RequireAnyPermission, RequirePermissions } from '../../rbac';
import { UuidParamPipe } from '../../system';
import { setNoStore, setPublicCache } from '../../search/common/discovery-http';
import { ATTESTATION_TEXT, REVIEW_CHECKLIST } from '../common/encyclopedia-rules';
import {
  AdminCategoryViewDto,
  AdminEntryQueryDto,
  AdminEntryViewDto,
  CreateCategoryDto,
  CreateEntryDto,
  EncyclopediaCategoryViewDto,
  EncyclopediaEntryDetailDto,
  EncyclopediaEntrySummaryDto,
  EncyclopediaListQueryDto,
  RejectEntryDto,
  ReviewChecklistInfoDto,
  TechnicalReviewDto,
  UpdateCategoryDto,
  UpdateEntryDto,
} from '../dto/encyclopedia.dto';
import { EncyclopediaAdminService } from '../services/encyclopedia-admin.service';
import { EncyclopediaPublicService } from '../services/encyclopedia-public.service';

@ApiTags('encyclopedia')
@Controller('encyclopedia')
export class PublicEncyclopediaController {
  constructor(private readonly svc: EncyclopediaPublicService) {}

  @Get('categories')
  @Public()
  @ApiLocale()
  @ApiOperation({ summary: 'Active categories with the number of published entries' })
  @ApiDataListResponse(EncyclopediaCategoryViewDto)
  async categories(
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<EncyclopediaCategoryViewDto>> {
    setPublicCache(res, 300);
    return listOf(await this.svc.categories(lang));
  }

  @Get()
  @Public()
  @ApiLocale()
  @ApiOperation({ summary: 'Published, technically reviewed entries' })
  @ApiPaginatedResponse(EncyclopediaEntrySummaryDto)
  @ApiErrorResponses(422)
  async list(
    @Query() q: EncyclopediaListQueryDto,
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<EncyclopediaEntrySummaryDto>> {
    setPublicCache(res, 120);
    return this.svc.list(q, lang);
  }

  @Get(':slug')
  @Public()
  @ApiLocale()
  @ApiOperation({ summary: 'Entry by slug or id (with safety notice on electrical topics)' })
  @ApiDataResponse(EncyclopediaEntryDetailDto)
  @ApiErrorResponses(404)
  async detail(
    @Param('slug') slug: string,
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<EncyclopediaEntryDetailDto>> {
    const data = await this.svc.detail(slug, lang);
    setPublicCache(res, 120);
    return ok(data);
  }
}

@ApiTags('admin-encyclopedia')
@ApiErrorResponses(401, 403)
@Controller('admin/encyclopedia')
export class AdminEncyclopediaController {
  constructor(private readonly svc: EncyclopediaAdminService) {}

  @Get('review-checklist')
  @RequireAnyPermission('encyclopedia.write', 'encyclopedia.review')
  @ApiOperation({ summary: 'Technical review checklist items + attestation text' })
  @ApiDataResponse(ReviewChecklistInfoDto)
  checklist(@Lang() lang: SupportedLanguage): DataResponse<ReviewChecklistInfoDto> {
    return ok({ items: [...REVIEW_CHECKLIST], attestationText: ATTESTATION_TEXT[lang] });
  }

  // --- categories -------------------------------------------------------------------------

  @Get('categories')
  @RequireAnyPermission('encyclopedia.write', 'encyclopedia.review')
  @ApiDataListResponse(AdminCategoryViewDto)
  async categories(@Res({ passthrough: true }) res: Response) {
    setNoStore(res);
    return listOf(await this.svc.categories());
  }

  @Post('categories')
  @RequirePermissions('encyclopedia.publish')
  @Audit({ action: 'encyclopedia_categories.create', entityType: 'encyclopedia_category' })
  @ApiDataResponse(AdminCategoryViewDto)
  @ApiErrorResponses(409, 422)
  async createCategory(@Body() dto: CreateCategoryDto) {
    return ok(await this.svc.createCategory(dto));
  }

  @Patch('categories/:key')
  @RequirePermissions('encyclopedia.publish')
  @Audit({
    action: 'encyclopedia_categories.update',
    entityType: 'encyclopedia_category',
    entityIdParam: 'key',
  })
  @ApiDataResponse(AdminCategoryViewDto)
  @ApiErrorResponses(404, 422)
  async updateCategory(@Param('key') key: string, @Body() dto: UpdateCategoryDto) {
    return ok(await this.svc.updateCategory(key, dto));
  }

  @Delete('categories/:key')
  @RequirePermissions('encyclopedia.publish')
  @Audit({
    action: 'encyclopedia_categories.delete',
    entityType: 'encyclopedia_category',
    entityIdParam: 'key',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 409)
  async removeCategory(@Param('key') key: string): Promise<void> {
    await this.svc.removeCategory(key);
  }

  // --- entries ----------------------------------------------------------------------------

  @Get('entries')
  @RequireAnyPermission('encyclopedia.write', 'encyclopedia.review', 'encyclopedia.publish')
  @ApiPaginatedResponse(AdminEntryViewDto)
  async list(@Query() q: AdminEntryQueryDto, @Res({ passthrough: true }) res: Response) {
    setNoStore(res);
    return this.svc.list(q);
  }

  @Get('entries/:id')
  @RequireAnyPermission('encyclopedia.write', 'encyclopedia.review', 'encyclopedia.publish')
  @ApiDataResponse(AdminEntryViewDto)
  @ApiErrorResponses(404)
  async get(@Param('id', UuidParamPipe) id: string, @Res({ passthrough: true }) res: Response) {
    setNoStore(res);
    return ok(await this.svc.get(id));
  }

  @Post('entries')
  @RequirePermissions('encyclopedia.write')
  @Audit({ action: 'encyclopedia.create', entityType: 'encyclopedia_entry' })
  @ApiOperation({ summary: 'Create a draft entry (HTML is sanitized)' })
  @ApiDataResponse(AdminEntryViewDto)
  @ApiErrorResponses(409, 422)
  async create(
    @Body() dto: CreateEntryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminEntryViewDto>> {
    return ok(await this.svc.create(dto, user));
  }

  @Patch('entries/:id')
  @RequirePermissions('encyclopedia.write')
  @Audit({ action: 'encyclopedia.update', entityType: 'encyclopedia_entry' })
  @ApiOperation({
    summary: 'Edit (content only in draft: 409 ENCYCLOPEDIA_ENTRY_LOCKED otherwise)',
  })
  @ApiDataResponse(AdminEntryViewDto)
  @ApiErrorResponses(404, 409, 422)
  async update(@Param('id', UuidParamPipe) id: string, @Body() dto: UpdateEntryDto) {
    return ok(await this.svc.update(id, dto));
  }

  @Delete('entries/:id')
  @RequirePermissions('encyclopedia.write')
  @Audit({ action: 'encyclopedia.delete', entityType: 'encyclopedia_entry' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 409)
  async remove(@Param('id', UuidParamPipe) id: string): Promise<void> {
    await this.svc.remove(id);
  }

  @Post('entries/:id/submit')
  @RequirePermissions('encyclopedia.write')
  @Audit({ action: 'encyclopedia.submit', entityType: 'encyclopedia_entry' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'draft → in_review (blocks obviously unsafe electrical instructions)' })
  @ApiDataResponse(AdminEntryViewDto)
  @ApiErrorResponses(404, 409, 422)
  async submit(@Param('id', UuidParamPipe) id: string) {
    return ok(await this.svc.submit(id));
  }

  @Post('entries/:id/review')
  @RequirePermissions('encyclopedia.review')
  @Audit({ action: 'encyclopedia.technical_review', entityType: 'encyclopedia_entry' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Technical approval: every checklist item + attestation must be true; not by the author',
  })
  @ApiDataResponse(AdminEntryViewDto)
  @ApiErrorResponses(404, 409, 422)
  async review(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: TechnicalReviewDto,
    @CurrentUser() user: AuthUser,
  ) {
    return ok(await this.svc.review(id, dto, user));
  }

  @Post('entries/:id/reject')
  @RequirePermissions('encyclopedia.review')
  @Audit({ action: 'encyclopedia.reject', entityType: 'encyclopedia_entry' })
  @HttpCode(HttpStatus.OK)
  @ApiDataResponse(AdminEntryViewDto)
  @ApiErrorResponses(404, 409, 422)
  async reject(@Param('id', UuidParamPipe) id: string, @Body() dto: RejectEntryDto) {
    return ok(await this.svc.reject(id, dto));
  }

  @Post('entries/:id/publish')
  @RequirePermissions('encyclopedia.publish')
  @Audit({ action: 'encyclopedia.publish', entityType: 'encyclopedia_entry' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'in_review (approved) → published; 409 ENCYCLOPEDIA_REVIEW_REQUIRED' })
  @ApiDataResponse(AdminEntryViewDto)
  @ApiErrorResponses(404, 409, 422)
  async publish(@Param('id', UuidParamPipe) id: string) {
    return ok(await this.svc.publish(id));
  }

  @Post('entries/:id/unpublish')
  @RequirePermissions('encyclopedia.publish')
  @Audit({ action: 'encyclopedia.unpublish', entityType: 'encyclopedia_entry' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'published / archived → draft (review must be redone)' })
  @ApiDataResponse(AdminEntryViewDto)
  @ApiErrorResponses(404, 409)
  async unpublish(@Param('id', UuidParamPipe) id: string) {
    return ok(await this.svc.unpublish(id));
  }

  @Post('entries/:id/archive')
  @RequirePermissions('encyclopedia.publish')
  @Audit({ action: 'encyclopedia.archive', entityType: 'encyclopedia_entry' })
  @HttpCode(HttpStatus.OK)
  @ApiDataResponse(AdminEntryViewDto)
  @ApiErrorResponses(404, 409)
  async archive(@Param('id', UuidParamPipe) id: string) {
    return ok(await this.svc.archive(id));
  }
}
