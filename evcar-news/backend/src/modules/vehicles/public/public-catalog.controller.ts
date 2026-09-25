import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { SupportedLanguage } from '../../../config/app-config';
import { buildPageMeta, type PageMeta } from '../../../common/http/pagination';
import {
  listOf,
  ok,
  paginated,
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
  BrandDetailDto,
  BrandListQueryDto,
  BrandSummaryDto,
  CarCardDto,
  CarDetailDto,
  CarListQueryDto,
  PickerQueryDto,
  PickerResponseDto,
  VariantSheetDto,
} from '../dto/public.dto';
import { CarPagesService } from './car-pages.service';
import { PickersService } from './pickers.service';

const PUBLIC_CACHE = 'public, max-age=60, stale-while-revalidate=300';

/**
 * The share module excludes GET `cars/:slug` from the /api/v1 prefix (web
 * fallback pages at https://evcar.news/cars/<slug>). Nest applies such
 * exclusions to EVERY route whose literal path matches the pattern, so the
 * API routes below use an optional trailing slash (`{/}`, same URLs) to stay
 * under /api/v1. See docs/decisions/backend-vehicles.md.
 */
const UNDER_API_PREFIX = '{/}';

function cache(res: Response): void {
  res.setHeader('Cache-Control', PUBLIC_CACHE);
}

@ApiTags('cars')
@ApiLocale()
@Controller()
export class PublicCatalogController {
  constructor(
    private readonly pages: CarPagesService,
    private readonly pickers: PickersService,
  ) {}

  @Get('brands')
  @Public()
  @ApiOperation({ summary: 'Published brands with the number of cars listed in the market' })
  @ApiPaginatedResponse(BrandSummaryDto)
  async brands(
    @Query() query: BrandListQueryDto,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<BrandSummaryDto>> {
    cache(res);
    const { items, total, page } = await this.pages.listBrands(query, market, lang);
    return paginated(items, total, page);
  }

  @Get('brands/:slug')
  @Public()
  @ApiOperation({ summary: 'Brand page: cars listed in the market + models sold elsewhere' })
  @ApiDataResponse(BrandDetailDto)
  @ApiErrorResponses(404)
  async brand(
    @Param('slug') slug: string,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<BrandDetailDto>> {
    cache(res);
    return ok(await this.pages.brandDetail(slug, market, lang));
  }

  @Get('cars')
  @Public()
  @ApiOperation({
    summary:
      'Catalog: models listed in the market, filtered at trim level (brand, powertrain, body, local price, range per cycle, seats, drive)',
  })
  @ApiPaginatedResponse(CarCardDto)
  @ApiErrorResponses(422)
  async cars(
    @Query() query: CarListQueryDto,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{
    data: CarCardDto[];
    meta: PageMeta & { marketCode: string; currencyCode: string };
  }> {
    cache(res);
    const r = await this.pages.listCars(query, market, lang);
    return {
      data: r.items,
      meta: {
        ...buildPageMeta(r.total, r.page.page, r.page.pageSize),
        marketCode: r.market.code,
        currencyCode: r.market.currencyCode,
      },
    };
  }

  @Get(`cars/pickers${UNDER_API_PREFIX}`)
  @Public()
  @ApiOperation({
    summary:
      'Cascading picker brand → model → year → variant → market for comparisons and the garage',
  })
  @ApiDataResponse(PickerResponseDto)
  @ApiErrorResponses(404, 422)
  async pickerList(
    @Query() query: PickerQueryDto,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<PickerResponseDto>> {
    cache(res);
    return ok(await this.pickers.pick(query, market, lang));
  }

  @Get(`cars/:slug${UNDER_API_PREFIX}`)
  @Public()
  @ApiOperation({
    summary:
      'Model page: gallery, generations → years → trims of the market (price, key facts), tours, competitors, related articles',
  })
  @ApiDataResponse(CarDetailDto)
  @ApiErrorResponses(404)
  async car(
    @Param('slug') slug: string,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<CarDetailDto>> {
    cache(res);
    return ok(await this.pages.carDetail(slug, market, lang));
  }

  @Get('cars/:slug/competitors')
  @Public()
  @ApiOperation({ summary: 'Curated competitors listed in the market' })
  @ApiDataListResponse(CarCardDto)
  @ApiErrorResponses(404)
  async competitors(
    @Param('slug') slug: string,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<CarCardDto>> {
    cache(res);
    return listOf(await this.pages.competitors(slug, market, lang));
  }

  @Get('cars/:slug/variants/:variant')
  @Public()
  @ApiOperation({
    summary:
      'Full spec sheet of a trim in the market (every value with source / reliability / verification, or null)',
  })
  @ApiDataResponse(VariantSheetDto)
  @ApiErrorResponses(404)
  async variantOfCar(
    @Param('slug') slug: string,
    @Param('variant') variant: string,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<VariantSheetDto>> {
    cache(res);
    return ok(await this.pages.variantSheet(variant, market, lang, slug));
  }

  @Get('variants/:variant')
  @Public()
  @ApiOperation({ summary: 'Same spec sheet addressed by variant id or slug' })
  @ApiDataResponse(VariantSheetDto)
  @ApiErrorResponses(404)
  async variant(
    @Param('variant') variant: string,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<VariantSheetDto>> {
    cache(res);
    return ok(await this.pages.variantSheet(variant, market, lang));
  }
}
