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
  Req,
  Res,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { SupportedLanguage } from '../../../config/app-config';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
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
import { RateLimit } from '../../../common/throttle/rate-limit.decorator';
import { ApiAccessToken, CurrentUser, Public, type AuthUser } from '../../auth';
import { UuidParamPipe } from '../../system/uuid-param.pipe';
import {
  ComparisonDto,
  ComparisonResultDto,
  ComparisonViewQueryDto,
  ComputeComparisonDto,
  CreateComparisonDto,
  CreatedComparisonDto,
  FeaturedQueryDto,
  MyComparisonsQueryDto,
  SharedComparisonDto,
  UpdateMyComparisonDto,
} from '../dto/comparison.dto';
import { ComparisonComputeService } from '../services/comparison-compute.service';
import { ComparisonStatsService } from '../services/comparison-stats.service';
import { ComparisonsService } from '../services/comparisons.service';
import { comparisonSignature, ItemResolverService } from '../services/item-resolver.service';

const client = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
}

@ApiTags('comparisons')
@ApiLocale()
@Controller('comparisons')
export class PublicComparisonsController {
  constructor(
    private readonly resolver: ItemResolverService,
    private readonly computer: ComparisonComputeService,
    private readonly comparisons: ComparisonsService,
    private readonly stats: ComparisonStatsService,
  ) {}

  @Post('compute')
  @Public()
  @HttpCode(HttpStatus.OK)
  @RateLimit('search')
  @ApiOperation({
    summary: 'Compare 2–4 trims (variant + model year + market): grouped rows with comparability',
    description:
      'Every row carries per-car canonical values with the original value/unit, source and reliability, a comparability status (comparable | not_comparable_cycles | not_comparable_soc_window | not_comparable_conditions | missing_data | different_currency | not_applicable), the better direction (battery rows: none) and winners only when every value is present and comparable. Ranges are compared on the same test cycle only (never converted), charging times on the same SoC window only, prices in the same currency only. Missing values are null, never 0.',
  })
  @ApiDataResponse(ComparisonResultDto)
  @ApiErrorResponses(422, 429)
  async compute(
    @Body() dto: ComputeComparisonDto,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<ComparisonResultDto>> {
    noStore(res);
    const items = await this.resolver.resolve(dto.items);
    const result = await this.computer.compute(items, lang, market, {
      view: dto.view,
      differencesOnly: dto.differencesOnly,
    });
    await this.stats.countCompared(
      items.map((i) => i.variantId),
      comparisonSignature(items),
      client(req),
    );
    return ok(result);
  }

  @Post()
  @Public()
  @RateLimit('write')
  @ApiOperation({
    summary: 'Save (signed in) or share (guest) a comparison',
    description:
      'Guests (no Authorization header) get an anonymous share link (an identical earlier share is reused → 200). Signed-in users get the comparison saved in their account (identical saved comparison reused → 200; max 200 → 409 COMPARISON_LIMIT_REACHED). A bearer token that is no longer valid → 401 TOKEN_EXPIRED (refresh and retry) instead of silently creating a guest share. shareUrl = https://evcar.news/compare/<shareId> (from the share settings).',
  })
  @ApiAccessToken()
  @ApiDataResponse(CreatedComparisonDto)
  @ApiErrorResponses(401, 409, 422, 429)
  async create(
    @Body() dto: CreateComparisonDto,
    @CurrentUser() user: AuthUser | undefined,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<CreatedComparisonDto>> {
    noStore(res);
    // The global guard treats a bad token on a public route as "guest"; here that
    // would turn an intended save into an anonymous share, so ask for a refresh.
    if (!user && /^Bearer\s+\S+/i.test(req.headers.authorization ?? '')) {
      throw AppException.unauthorized(ErrorCode.TOKEN_EXPIRED);
    }
    const { data, created } = await this.comparisons.create(dto, user?.id ?? null, lang, market);
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return ok(data);
  }

  @Get('featured')
  @Public()
  @ApiOperation({ summary: 'Featured (curated, published) comparisons of the request market' })
  @ApiDataListResponse(ComparisonDto)
  async featured(
    @Query() q: FeaturedQueryDto,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<ComparisonDto>> {
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.setHeader('Vary', 'Accept-Language, X-Market');
    return listOf(await this.comparisons.featured(market, lang, q.limit ?? 10));
  }

  @Get('s/:shareId')
  @Public()
  @RateLimit('search')
  @ApiOperation({
    summary:
      'Open a shared / featured / saved comparison by its share id, with the computed result',
    description:
      'Never reveals the owner; the owner label is returned to the owner only. Unpublished featured comparisons → 404. Trims that are no longer published are listed in unavailableItems (result is null when fewer than 2 remain).',
  })
  @ApiDataResponse(SharedComparisonDto)
  @ApiErrorResponses(404, 429)
  async shared(
    @Param('shareId') shareId: string,
    @Query() q: ComparisonViewQueryDto,
    @CurrentUser() user: AuthUser | undefined,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<SharedComparisonDto>> {
    noStore(res);
    return ok(
      await this.comparisons.shared(shareId, user?.id ?? null, lang, market, q, client(req)),
    );
  }
}

@ApiTags('me')
@ApiLocale()
@ApiAccessToken()
@ApiErrorResponses(401)
@Controller('me/comparisons')
export class MeComparisonsController {
  constructor(private readonly comparisons: ComparisonsService) {}

  @Get()
  @ApiOperation({ summary: 'My saved comparisons (newest first)' })
  @ApiPaginatedResponse(ComparisonDto)
  async list(
    @Query() q: MyComparisonsQueryDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<ComparisonDto>> {
    noStore(res);
    const { items, total, page } = await this.comparisons.listMine(user.id, q, lang);
    return paginated(items, total, page);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of my saved comparisons with its computed result' })
  @ApiDataResponse(SharedComparisonDto)
  @ApiErrorResponses(404)
  async get(
    @Param('id', UuidParamPipe) id: string,
    @Query() q: ComparisonViewQueryDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<SharedComparisonDto>> {
    noStore(res);
    return ok(await this.comparisons.getMine(id, user.id, lang, market, q));
  }

  @Patch(':id')
  @RateLimit('write')
  @ApiOperation({ summary: 'Rename one of my saved comparisons' })
  @ApiDataResponse(ComparisonDto)
  @ApiErrorResponses(404, 422)
  async rename(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateMyComparisonDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<ComparisonDto>> {
    return ok(await this.comparisons.renameMine(id, user.id, dto.title, lang));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete one of my saved comparisons' })
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  async remove(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.comparisons.deleteMine(id, user.id);
  }
}
