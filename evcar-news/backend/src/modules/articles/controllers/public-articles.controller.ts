import {
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
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
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
import { Public } from '../../auth';
import { setNoStore, setPublicCache } from '../common/http-cache';
import {
  PublicArticleDetailDto,
  PublicArticleQueryDto,
  PublicArticleSummaryDto,
} from '../dto/public-article.dto';
import { ArticlesPublicService } from '../services/articles-public.service';

@ApiTags('news')
@Controller('articles')
export class PublicArticlesController {
  constructor(private readonly articles: ArticlesPublicService) {}

  @Get()
  @Public()
  @ApiLocale()
  @ApiOperation({
    summary: 'Published articles (newest first) with filters',
    description:
      'Only published articles visible in the request market (`allMarkets=true` to browse every market). Each item states the language served (`language`, `isFallback`). Unknown filter values give an empty page. ETag / 304 supported; cached 60 s.',
  })
  @ApiPaginatedResponse(PublicArticleSummaryDto)
  async list(
    @Query() query: PublicArticleQueryDto,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<PublicArticleSummaryDto>> {
    setPublicCache(res, 60);
    return this.articles.list(query, lang, market);
  }

  @Get('preview/:token')
  @Public()
  @ApiLocale()
  @ApiOperation({
    summary: 'Reads an unpublished article through a signed preview link (admin-issued)',
  })
  @ApiDataResponse(PublicArticleDetailDto)
  @ApiErrorResponses(401, 404)
  async preview(
    @Param('token') token: string,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<PublicArticleDetailDto>> {
    setNoStore(res);
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return ok(await this.articles.preview(token, lang, market));
  }

  @Get(':slug')
  @Public()
  @ApiLocale()
  @ApiOperation({
    summary: 'One published article by slug or id',
    description:
      'Full text in the request language (else the original language), related articles and cars, source attribution, public corrections. Served in every market (`marketMatch` says whether it targets the request market).',
  })
  @ApiDataResponse(PublicArticleDetailDto)
  @ApiErrorResponses(404)
  async detail(
    @Param('slug') slug: string,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<PublicArticleDetailDto>> {
    setPublicCache(res, 60);
    return ok(await this.articles.detail(slug, lang, market));
  }

  @Post(':slug/view')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit('write')
  @ApiOperation({
    summary: 'Counts an anonymous read (once per reader per 30 min; nothing stored about readers)',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 429)
  async view(@Param('slug') slug: string, @Req() req: Request): Promise<void> {
    await this.articles.recordView(slug, req.ip, req.headers['user-agent']);
  }
}
