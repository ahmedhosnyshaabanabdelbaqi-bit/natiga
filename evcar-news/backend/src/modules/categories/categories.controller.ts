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
import type { SupportedLanguage } from '../../config/app-config';
import { ok, listOf, type DataResponse, type PaginatedResponse } from '../../common/http/responses';
import { ApiLocale, Lang, Market } from '../../common/i18n/request-locale';
import {
  ApiDataListResponse,
  ApiDataResponse,
  ApiErrorResponses,
} from '../../common/swagger/api-responses';
import { Audit } from '../audit';
import { Public } from '../auth';
import { RequireAnyPermission, RequirePermissions } from '../rbac';
import { UuidParamPipe } from '../system';
import { setNoStore, setPublicCache } from '../articles/common/http-cache';
import {
  AdminCategoryDto,
  AdminCategoryQueryDto,
  CreateCategoryDto,
  PublicCategoryDto,
  UpdateCategoryDto,
} from './categories.dto';
import { CategoriesService } from './categories.service';

@ApiTags('news')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @Public()
  @ApiLocale()
  @ApiOperation({
    summary: 'Active news categories (flat list; build the tree with parentId)',
    description:
      'Names in the request language (+ nameAr/nameEn). articleCount = published articles visible in the request market. ETag / 304 supported.',
  })
  @ApiDataListResponse(PublicCategoryDto)
  async list(
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<PublicCategoryDto>> {
    setPublicCache(res, 300);
    return listOf(await this.categories.listPublic(lang, market));
  }

  @Get(':slug')
  @Public()
  @ApiLocale()
  @ApiOperation({ summary: 'One active category by slug or id' })
  @ApiDataResponse(PublicCategoryDto)
  @ApiErrorResponses(404)
  async get(
    @Param('slug') slug: string,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<PublicCategoryDto>> {
    setPublicCache(res, 300);
    return ok(await this.categories.getPublic(slug, lang, market));
  }
}

@ApiTags('admin-news')
@ApiErrorResponses(401, 403)
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @RequireAnyPermission('categories.write', 'articles.read')
  @ApiOperation({ summary: 'All categories incl. inactive ones, with usage counts' })
  @ApiDataListResponse(AdminCategoryDto)
  async list(
    @Query() query: AdminCategoryQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<AdminCategoryDto>> {
    setNoStore(res);
    return listOf(await this.categories.listAdmin(query));
  }

  @Get(':id')
  @RequireAnyPermission('categories.write', 'articles.read')
  @ApiDataResponse(AdminCategoryDto)
  @ApiErrorResponses(404)
  async get(@Param('id', UuidParamPipe) id: string): Promise<DataResponse<AdminCategoryDto>> {
    return ok(await this.categories.getAdmin(id));
  }

  @Post()
  @RequirePermissions('categories.write')
  @Audit({ action: 'categories.create', entityType: 'category' })
  @ApiOperation({ summary: 'Creates a category (ar + en names required)' })
  @ApiDataResponse(AdminCategoryDto)
  @ApiErrorResponses(409, 422)
  async create(@Body() dto: CreateCategoryDto): Promise<DataResponse<AdminCategoryDto>> {
    return ok(await this.categories.create(dto));
  }

  @Patch(':id')
  @RequirePermissions('categories.write')
  @Audit({ action: 'categories.update', entityType: 'category' })
  @ApiOperation({ summary: 'Edits / deactivates a category' })
  @ApiDataResponse(AdminCategoryDto)
  @ApiErrorResponses(404, 409, 422)
  async update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<DataResponse<AdminCategoryDto>> {
    return ok(await this.categories.update(id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('categories.write')
  @Audit({ action: 'categories.delete', entityType: 'category' })
  @ApiOperation({
    summary:
      'Deletes an unused, non-system category (409 CATEGORY_IS_SYSTEM / CATEGORY_IN_USE: deactivate it instead)',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 409)
  async remove(@Param('id', UuidParamPipe) id: string): Promise<void> {
    await this.categories.remove(id);
  }
}
