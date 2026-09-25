import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { toPageRequest } from '../../common/http/pagination';
import {
  ok,
  paginated,
  type DataResponse,
  type PaginatedResponse,
} from '../../common/http/responses';
import {
  ApiDataResponse,
  ApiErrorResponses,
  ApiPaginatedResponse,
} from '../../common/swagger/api-responses';
import { Audit } from '../audit';
import { RequireAnyPermission } from '../rbac';
import { toImportJobRowView, toImportJobView } from './import-job.view';
import { ImportJobsService } from './import-jobs.service';
import {
  ImportJobDto,
  ImportJobRowDto,
  ListImportJobsQueryDto,
  ListImportRowsQueryDto,
} from './system.dto';
import { UuidParamPipe } from './uuid-param.pipe';

/**
 * Import jobs (CSV imports, provider syncs, RSS runs) with row-level
 * errors. Creating/running imports is done by the owning modules; this is
 * the shared status view.
 */
@ApiTags('admin-system')
@ApiErrorResponses(401, 403)
@Controller('admin/system/import-jobs')
export class AdminImportJobsController {
  constructor(private readonly importJobs: ImportJobsService) {}

  @Get()
  @RequireAnyPermission('imports.read', 'system.read')
  @ApiOperation({ summary: 'Import jobs, newest first (filter by type / status)' })
  @ApiPaginatedResponse(ImportJobDto)
  async list(
    @Query() query: ListImportJobsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<ImportJobDto>> {
    res.setHeader('Cache-Control', 'no-store');
    const page = toPageRequest(query);
    const { items, total } = await this.importJobs.list({
      type: query.type,
      status: query.status,
      skip: page.skip,
      take: page.take,
    });
    return paginated(items.map(toImportJobView), total, page);
  }

  @Get(':id')
  @RequireAnyPermission('imports.read', 'system.read')
  @ApiOperation({ summary: 'One import job with progress' })
  @ApiDataResponse(ImportJobDto)
  @ApiErrorResponses(404)
  async get(
    @Param('id', UuidParamPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<ImportJobDto>> {
    res.setHeader('Cache-Control', 'no-store');
    return ok(toImportJobView(await this.importJobs.get(id)));
  }

  @Get(':id/rows')
  @RequireAnyPermission('imports.read', 'system.read')
  @ApiOperation({ summary: 'Row results of an import job (e.g. ?status=invalid for row errors)' })
  @ApiPaginatedResponse(ImportJobRowDto)
  @ApiErrorResponses(404)
  async rows(
    @Param('id', UuidParamPipe) id: string,
    @Query() query: ListImportRowsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<ImportJobRowDto>> {
    res.setHeader('Cache-Control', 'no-store');
    const page = toPageRequest(query);
    const { items, total } = await this.importJobs.listRows(id, {
      status: query.status,
      skip: page.skip,
      take: page.take,
    });
    return paginated(items.map(toImportJobRowView), total, page);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequireAnyPermission('imports.run', 'system.jobs')
  @Audit({ action: 'import_jobs.cancel', entityType: 'import_job' })
  @ApiOperation({ summary: 'Cancels an unfinished import job' })
  @ApiDataResponse(ImportJobDto)
  @ApiErrorResponses(404, 409)
  async cancel(@Param('id', UuidParamPipe) id: string): Promise<DataResponse<ImportJobDto>> {
    return ok(toImportJobView(await this.importJobs.cancel(id)));
  }
}
