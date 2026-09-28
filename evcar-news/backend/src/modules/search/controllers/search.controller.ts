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
import { ApiLocale, Lang, Market } from '../../../common/i18n/request-locale';
import {
  ApiDataListResponse,
  ApiDataResponse,
  ApiErrorResponses,
  ApiPaginatedResponse,
} from '../../../common/swagger/api-responses';
import { RateLimit } from '../../../common/throttle/rate-limit.decorator';
import { Audit } from '../../audit';
import { Public } from '../../auth';
import { RequirePermissions } from '../../rbac';
import { UuidParamPipe } from '../../system';
import { setNoStore, setPublicCache } from '../common/discovery-http';
import {
  AliasListQueryDto,
  AliasViewDto,
  CreateAliasDto,
  IndexStatusDto,
  ReindexResultDto,
  SearchQueryDto,
  SearchResultDto,
  SuggestQueryDto,
  SuggestionDto,
  UpdateAliasDto,
} from '../dto/search.dto';
import { SearchAdminService } from '../services/search-admin.service';
import {
  SearchService,
  type SearchResponseData,
  type Suggestion,
} from '../services/search.service';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @Public()
  @ApiLocale()
  @RateLimit('search')
  @ApiOperation({
    summary:
      'Unified search (articles, brands, models, variants, stations, encyclopedia, services)',
    description:
      'Arabic-normalized (أ/إ/آ→ا, ى→ي, ة→ه, no diacritics/tatweel), alternative spellings from search aliases (بي واي دي ↔ BYD), typo tolerance (pg_trgm). Groups in fixed order; `highlights` are UTF-16 ranges. Sponsored directory entries get no ranking boost.',
  })
  @ApiDataResponse(SearchResultDto)
  @ApiErrorResponses(422, 429)
  async find(
    @Query() q: SearchQueryDto,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<SearchResponseData>> {
    const data = await this.search.search(q, lang, market);
    setPublicCache(res, 60);
    return ok(data);
  }

  @Get('suggest')
  @Public()
  @ApiLocale()
  @RateLimit('search')
  @ApiOperation({
    summary: 'Search-box suggestions',
    description:
      'kind=query: a spelling to search for (run /search?q=text); kind=entity: open the item directly (type + id/slug).',
  })
  @ApiDataListResponse(SuggestionDto)
  @ApiErrorResponses(422, 429)
  async suggest(
    @Query() q: SuggestQueryDto,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<Suggestion>> {
    const data = await this.search.suggest(q.q, q.limit ?? 8, lang, market);
    setPublicCache(res, 60);
    return listOf(data);
  }
}

@ApiTags('admin-search')
@ApiErrorResponses(401, 403)
@Controller('admin')
export class AdminSearchController {
  constructor(private readonly admin: SearchAdminService) {}

  @Get('search-aliases')
  @RequirePermissions('search.manage')
  @ApiOperation({ summary: 'Search aliases (alternative spellings / transliterations)' })
  @ApiPaginatedResponse(AliasViewDto)
  async list(
    @Query() q: AliasListQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<AliasViewDto>> {
    setNoStore(res);
    return this.admin.list(q);
  }

  @Get('search-aliases/:id')
  @RequirePermissions('search.manage')
  @ApiDataResponse(AliasViewDto)
  @ApiErrorResponses(404)
  async get(
    @Param('id', UuidParamPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<AliasViewDto>> {
    setNoStore(res);
    return ok(await this.admin.get(id));
  }

  @Post('search-aliases')
  @RequirePermissions('search.manage')
  @Audit({ action: 'search_aliases.create', entityType: 'search_alias' })
  @ApiOperation({ summary: 'Create an alias (409 SEARCH_ALIAS_EXISTS for a duplicate pair)' })
  @ApiDataResponse(AliasViewDto)
  @ApiErrorResponses(409, 422)
  async create(@Body() dto: CreateAliasDto): Promise<DataResponse<AliasViewDto>> {
    return ok(await this.admin.create(dto));
  }

  @Patch('search-aliases/:id')
  @RequirePermissions('search.manage')
  @Audit({ action: 'search_aliases.update', entityType: 'search_alias' })
  @ApiOperation({ summary: 'Update an alias (system aliases: only isActive)' })
  @ApiDataResponse(AliasViewDto)
  @ApiErrorResponses(404, 409, 422)
  async update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateAliasDto,
  ): Promise<DataResponse<AliasViewDto>> {
    return ok(await this.admin.update(id, dto));
  }

  @Delete('search-aliases/:id')
  @RequirePermissions('search.manage')
  @Audit({ action: 'search_aliases.delete', entityType: 'search_alias' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 409)
  async remove(@Param('id', UuidParamPipe) id: string): Promise<void> {
    await this.admin.remove(id);
  }

  @Get('search/status')
  @RequirePermissions('search.manage')
  @ApiOperation({ summary: 'Search index drift per entity type' })
  @ApiDataListResponse(IndexStatusDto)
  async status(@Res({ passthrough: true }) res: Response) {
    setNoStore(res);
    return listOf(await this.admin.status());
  }

  @Post('search/reindex')
  @RequirePermissions('search.manage')
  @RateLimit('write')
  @Audit({ action: 'search.reindex', entityType: 'search_document' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rebuild article + catalog index documents (owning modules’ indexers)' })
  @ApiDataResponse(ReindexResultDto)
  async reindex(): Promise<DataResponse<ReindexResultDto>> {
    return ok(await this.admin.reindex());
  }
}
