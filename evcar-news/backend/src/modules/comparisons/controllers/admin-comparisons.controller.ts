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
import { buildPageMeta, type PageMeta } from '../../../common/http/pagination';
import {
  ok,
  paginated,
  type DataResponse,
  type PaginatedResponse,
} from '../../../common/http/responses';
import { Lang } from '../../../common/i18n/request-locale';
import {
  ApiDataResponse,
  ApiErrorResponses,
  ApiPaginatedResponse,
} from '../../../common/swagger/api-responses';
import { Audit } from '../../audit';
import { RequirePermissions } from '../../rbac';
import { UuidParamPipe } from '../../system/uuid-param.pipe';
import {
  AdminComparisonDto,
  AdminComparisonListQueryDto,
  CreateCuratedComparisonDto,
  MostComparedItemDto,
  MostComparedQueryDto,
  UpdateCuratedComparisonDto,
} from '../dto/admin.dto';
import { ComparisonAdminService } from '../services/comparison-admin.service';
import { ComparisonStatsService } from '../services/comparison-stats.service';

function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
}

@ApiTags('admin-comparisons')
@ApiErrorResponses(401, 403)
@Controller('admin/comparisons')
export class AdminComparisonsController {
  constructor(
    private readonly admin: ComparisonAdminService,
    private readonly stats: ComparisonStatsService,
  ) {}

  @Get()
  @RequirePermissions('comparisons.curate')
  @ApiOperation({ summary: 'Featured (curated) comparisons' })
  @ApiPaginatedResponse(AdminComparisonDto)
  async list(
    @Query() q: AdminComparisonListQueryDto,
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<AdminComparisonDto>> {
    noStore(res);
    const { items, total, page } = await this.admin.list(q, lang);
    return paginated(items, total, page);
  }

  // Declared before ":id" so "stats" is never taken for an id.
  @Get('stats/most-compared')
  @RequirePermissions('analytics.read')
  @ApiOperation({ summary: 'Most compared trims over the last N days (anonymous counters)' })
  @ApiPaginatedResponse(MostComparedItemDto)
  async mostCompared(
    @Query() q: MostComparedQueryDto,
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: MostComparedItemDto[]; meta: PageMeta & { from: string; to: string } }> {
    noStore(res);
    const r = await this.stats.mostCompared(q.days ?? 30, q.limit ?? 20, lang);
    return {
      data: r.items,
      meta: {
        ...buildPageMeta(r.items.length, 1, Math.max(r.items.length, 1)),
        from: r.from,
        to: r.to,
      },
    };
  }

  @Get(':id')
  @RequirePermissions('comparisons.curate')
  @ApiOperation({ summary: 'One featured comparison' })
  @ApiDataResponse(AdminComparisonDto)
  @ApiErrorResponses(404)
  async get(
    @Param('id', UuidParamPipe) id: string,
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<AdminComparisonDto>> {
    noStore(res);
    return ok(await this.admin.get(id, lang));
  }

  @Post()
  @RequirePermissions('comparisons.curate')
  @Audit({ action: 'comparisons.curated.create', entityType: 'comparison' })
  @ApiOperation({
    summary: 'Create a featured comparison (published needs titleAr + titleEn)',
  })
  @ApiDataResponse(AdminComparisonDto)
  @ApiErrorResponses(422)
  async create(
    @Body() dto: CreateCuratedComparisonDto,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<AdminComparisonDto>> {
    return ok(await this.admin.create(dto, lang));
  }

  @Patch(':id')
  @RequirePermissions('comparisons.curate')
  @Audit({ action: 'comparisons.curated.update', entityType: 'comparison' })
  @ApiOperation({ summary: 'Update a featured comparison (items are replaced when sent)' })
  @ApiDataResponse(AdminComparisonDto)
  @ApiErrorResponses(404, 422)
  async update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateCuratedComparisonDto,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<AdminComparisonDto>> {
    return ok(await this.admin.update(id, dto, lang));
  }

  @Delete(':id')
  @RequirePermissions('comparisons.curate')
  @Audit({ action: 'comparisons.curated.delete', entityType: 'comparison' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a featured comparison' })
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  async remove(@Param('id', UuidParamPipe) id: string): Promise<void> {
    await this.admin.remove(id);
  }
}
