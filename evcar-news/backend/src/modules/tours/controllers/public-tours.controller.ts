import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { SupportedLanguage } from '../../../config/app-config';
import {
  ok,
  listOf,
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
import { Public } from '../../auth';
import {
  FeaturedToursQueryDto,
  PublicTourCardDto,
  PublicTourDetailDto,
  PublicTourListQueryDto,
  TourDetailQueryDto,
} from '../dto/public-tour.dto';
import { ToursPublicService } from '../services/tours-public.service';

function setPublicCache(res: Response, maxAgeSeconds: number): void {
  res.setHeader(
    'Cache-Control',
    `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds * 5}`,
  );
  res.setHeader('Vary', 'Accept-Language, X-Market');
}

@ApiTags('tours')
@Controller('tours')
export class PublicToursController {
  constructor(private readonly tours: ToursPublicService) {}

  @Get()
  @Public()
  @ApiLocale()
  @ApiOperation({
    summary: 'Published 360° interior tours in the request market (filter variantId / modelYearId)',
    description:
      'Exact tours first, then editor-approved reference tours of a similar trim (show differenceNote). Only tours whose files are processed and licensed are listed. ETag / 304; cached 60 s.',
  })
  @ApiPaginatedResponse(PublicTourCardDto)
  async list(
    @Query() query: PublicTourListQueryDto,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<PublicTourCardDto>> {
    setPublicCache(res, 60);
    return this.tours.list(query, market, lang);
  }

  @Get('featured')
  @Public()
  @ApiLocale()
  @ApiOperation({
    summary: 'Tours for the home strip (request market; real tours before demo tours)',
  })
  @ApiDataListResponse(PublicTourCardDto)
  async featured(
    @Query() query: FeaturedToursQueryDto,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<PublicTourCardDto>> {
    setPublicCache(res, 60);
    return listOf(await this.tours.featured(query.limit ?? 10, market, lang));
  }

  @Get(':idOrSlug')
  @Public()
  @ApiLocale()
  @ApiOperation({
    summary: 'Viewer configuration of one published tour',
    description:
      'Scenes with the fast preview, device renditions ≤ maxWidth (+ recommendedRendition), Pannellum multires tiles, localized plain-text hotspots, attribution, demo and reference labels, mediaOrigin for the viewer allow-list.',
  })
  @ApiDataResponse(PublicTourDetailDto)
  @ApiErrorResponses(404)
  async detail(
    @Param('idOrSlug') ref: string,
    @Query() query: TourDetailQueryDto,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<PublicTourDetailDto>> {
    setPublicCache(res, 60);
    return ok(await this.tours.detail(ref, market, lang, query.maxWidth));
  }
}
