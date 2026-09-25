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
import { Lang } from '../../common/i18n/request-locale';
import {
  ApiDataResponse,
  ApiErrorResponses,
  ApiPaginatedResponse,
} from '../../common/swagger/api-responses';
import { Audit } from '../audit';
import { CurrentUser, type AuthUser } from '../auth';
import { RequirePermissions } from '../rbac';
import { UuidParamPipe } from '../system';
import { setNoStore } from '../articles/common/http-cache';
import { RssFeedsService } from './rss-feeds.service';
import { RssFetchService } from './rss-fetch.service';
import { RssItemsService } from './rss-items.service';
import {
  CreateDraftFromItemDto,
  CreateRssFeedDto,
  DraftFromItemResultDto,
  IgnoreRssItemDto,
  RssFeedDto,
  RssFeedQueryDto,
  RssFetchSummaryDto,
  RssItemDto,
  RssItemQueryDto,
  UpdateRssFeedDto,
} from './rss.dto';

@ApiTags('admin-news')
@ApiErrorResponses(401, 403)
@Controller('admin/rss-feeds')
export class AdminRssFeedsController {
  constructor(
    private readonly feeds: RssFeedsService,
    private readonly fetcher: RssFetchService,
  ) {}

  @Get()
  @RequirePermissions('rss.read')
  @ApiOperation({ summary: 'RSS/Atom sources with licence mode, fetch status and item counts' })
  @ApiPaginatedResponse(RssFeedDto)
  async list(
    @Query() query: RssFeedQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<RssFeedDto>> {
    setNoStore(res);
    return this.feeds.list(query);
  }

  @Get(':id')
  @RequirePermissions('rss.read')
  @ApiDataResponse(RssFeedDto)
  @ApiErrorResponses(404)
  async get(@Param('id', UuidParamPipe) id: string): Promise<DataResponse<RssFeedDto>> {
    return ok(await this.feeds.get(id));
  }

  @Post()
  @RequirePermissions('rss.manage')
  @Audit({ action: 'rss.feed_create', entityType: 'rss_feed' })
  @ApiOperation({
    summary:
      'Adds a feed (https, public host — checked after DNS). Licence mode other than link_only, or allowImages, needs permissionReference.',
  })
  @ApiDataResponse(RssFeedDto)
  @ApiErrorResponses(409, 422)
  async create(
    @Body() dto: CreateRssFeedDto,
    @CurrentUser('id') userId: string,
  ): Promise<DataResponse<RssFeedDto>> {
    return ok(await this.feeds.create(dto, userId));
  }

  @Patch(':id')
  @RequirePermissions('rss.manage')
  @Audit({ action: 'rss.feed_update', entityType: 'rss_feed' })
  @ApiDataResponse(RssFeedDto)
  @ApiErrorResponses(404, 409, 422)
  async update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateRssFeedDto,
    @CurrentUser('id') userId: string,
  ): Promise<DataResponse<RssFeedDto>> {
    return ok(await this.feeds.update(id, dto, userId));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('rss.manage')
  @Audit({ action: 'rss.feed_delete', entityType: 'rss_feed' })
  @ApiOperation({ summary: 'Deletes a feed and its items (409 RSS_FEED_IN_USE when drafts exist)' })
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 409)
  async remove(@Param('id', UuidParamPipe) id: string): Promise<void> {
    await this.feeds.remove(id);
  }

  @Post(':id/fetch')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('rss.manage')
  @Audit({ action: 'rss.feed_fetch', entityType: 'rss_feed' })
  @ApiOperation({
    summary:
      'Fetches the feed now (import job "rss.fetch"); new items wait in the review queue, nothing is published',
  })
  @ApiDataResponse(RssFetchSummaryDto)
  @ApiErrorResponses(404, 409, 422, 502)
  async fetchNow(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser('id') userId: string,
  ): Promise<DataResponse<RssFetchSummaryDto>> {
    return ok(await this.fetcher.fetchFeed(id, { trigger: 'manual', userId }));
  }
}

@ApiTags('admin-news')
@ApiErrorResponses(401, 403)
@Controller('admin/rss-items')
export class AdminRssItemsController {
  constructor(private readonly items: RssItemsService) {}

  @Get()
  @RequirePermissions('rss.read')
  @ApiOperation({ summary: 'Imported items (review queue), newest first' })
  @ApiPaginatedResponse(RssItemDto)
  async list(
    @Query() query: RssItemQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<RssItemDto>> {
    setNoStore(res);
    return this.items.list(query);
  }

  @Get(':id')
  @RequirePermissions('rss.read')
  @ApiDataResponse(RssItemDto)
  @ApiErrorResponses(404)
  async get(@Param('id', UuidParamPipe) id: string): Promise<DataResponse<RssItemDto>> {
    return ok(await this.items.get(id));
  }

  @Post(':id/ignore')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('rss.manage')
  @Audit({ action: 'rss.item_ignore', entityType: 'rss_item' })
  @ApiDataResponse(RssItemDto)
  @ApiErrorResponses(404, 409)
  async ignore(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: IgnoreRssItemDto,
    @CurrentUser('id') userId: string,
  ): Promise<DataResponse<RssItemDto>> {
    return ok(await this.items.ignore(id, dto.reason, userId));
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('rss.manage')
  @Audit({ action: 'rss.item_restore', entityType: 'rss_item' })
  @ApiOperation({ summary: 'Back to the queue (ignored / duplicate → new)' })
  @ApiDataResponse(RssItemDto)
  @ApiErrorResponses(404, 409)
  async restore(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser('id') userId: string,
  ): Promise<DataResponse<RssItemDto>> {
    return ok(await this.items.restore(id, userId));
  }

  @Post(':id/create-draft')
  @RequirePermissions('rss.read', 'articles.create')
  @Audit({ action: 'rss.item_drafted', entityType: 'rss_item' })
  @ApiOperation({
    summary:
      'Creates an article DRAFT from the item (licence-respecting: headline + source link by default). Never publishes.',
  })
  @ApiDataResponse(DraftFromItemResultDto)
  @ApiErrorResponses(404, 409, 422)
  async createDraft(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: CreateDraftFromItemDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<DraftFromItemResultDto>> {
    return ok(await this.items.createDraft(id, dto, user, lang));
  }
}
