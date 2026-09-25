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
import { ok, type DataResponse, type PaginatedResponse } from '../../common/http/responses';
import { ApiLocale, Lang, Market } from '../../common/i18n/request-locale';
import {
  ApiDataResponse,
  ApiErrorResponses,
  ApiPaginatedResponse,
} from '../../common/swagger/api-responses';
import { Audit } from '../audit';
import { Public } from '../auth';
import { RequireAnyPermission, RequirePermissions } from '../rbac';
import { UuidParamPipe } from '../system';
import { setNoStore, setPublicCache } from '../articles/common/http-cache';
import {
  AdminTagDto,
  AdminTagQueryDto,
  CreateTagDto,
  DeleteTagQueryDto,
  MergeTagDto,
  PublicTagDto,
  PublicTagQueryDto,
  UpdateTagDto,
} from './tags.dto';
import { TagsService } from './tags.service';

@ApiTags('news')
@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  @Public()
  @ApiLocale()
  @ApiOperation({
    summary: 'Tags used by articles visible in the request market (most used first)',
  })
  @ApiPaginatedResponse(PublicTagDto)
  async list(
    @Query() query: PublicTagQueryDto,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<PublicTagDto>> {
    setPublicCache(res, 300);
    return this.tags.listPublic(query, lang, market);
  }

  @Get(':slug')
  @Public()
  @ApiLocale()
  @ApiOperation({ summary: 'One tag by slug or id' })
  @ApiDataResponse(PublicTagDto)
  @ApiErrorResponses(404)
  async get(
    @Param('slug') slug: string,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<PublicTagDto>> {
    setPublicCache(res, 300);
    return ok(await this.tags.getPublic(slug, lang, market));
  }
}

@ApiTags('admin-news')
@ApiErrorResponses(401, 403)
@Controller('admin/tags')
export class AdminTagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  @RequireAnyPermission('tags.write', 'articles.read')
  @ApiOperation({ summary: 'All tags with usage counts' })
  @ApiPaginatedResponse(AdminTagDto)
  async list(
    @Query() query: AdminTagQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<AdminTagDto>> {
    setNoStore(res);
    return this.tags.listAdmin(query);
  }

  @Get(':id')
  @RequireAnyPermission('tags.write', 'articles.read')
  @ApiDataResponse(AdminTagDto)
  @ApiErrorResponses(404)
  async get(@Param('id', UuidParamPipe) id: string): Promise<DataResponse<AdminTagDto>> {
    return ok(await this.tags.getAdmin(id));
  }

  @Post()
  @RequirePermissions('tags.write')
  @Audit({ action: 'tags.create', entityType: 'tag' })
  @ApiOperation({ summary: 'Creates a tag (Arabic and/or English name)' })
  @ApiDataResponse(AdminTagDto)
  @ApiErrorResponses(409, 422)
  async create(@Body() dto: CreateTagDto): Promise<DataResponse<AdminTagDto>> {
    return ok(await this.tags.create(dto));
  }

  @Patch(':id')
  @RequirePermissions('tags.write')
  @Audit({ action: 'tags.update', entityType: 'tag' })
  @ApiDataResponse(AdminTagDto)
  @ApiErrorResponses(404, 409, 422)
  async update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateTagDto,
  ): Promise<DataResponse<AdminTagDto>> {
    return ok(await this.tags.update(id, dto));
  }

  @Post(':id/merge')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('tags.write')
  @Audit({ action: 'tags.merge', entityType: 'tag' })
  @ApiOperation({ summary: 'Merges this tag into targetId (articles move, this tag is deleted)' })
  @ApiDataResponse(AdminTagDto)
  @ApiErrorResponses(404, 422)
  async merge(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: MergeTagDto,
  ): Promise<DataResponse<AdminTagDto>> {
    return ok(await this.tags.merge(id, dto.targetId));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('tags.write')
  @Audit({ action: 'tags.delete', entityType: 'tag' })
  @ApiOperation({ summary: 'Deletes a tag (409 TAG_IN_USE unless ?force=true)' })
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 409)
  async remove(
    @Param('id', UuidParamPipe) id: string,
    @Query() query: DeleteTagQueryDto,
  ): Promise<void> {
    await this.tags.remove(id, query.force === 'true');
  }
}
