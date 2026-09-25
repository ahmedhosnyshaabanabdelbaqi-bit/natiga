import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { SupportedLanguage } from '../../../config/app-config';
import { AppException } from '../../../common/errors/app.exception';
import {
  listOf,
  ok,
  type DataResponse,
  type PaginatedResponse,
} from '../../../common/http/responses';
import { Lang } from '../../../common/i18n/request-locale';
import { RateLimit } from '../../../common/throttle/rate-limit.decorator';
import {
  ApiDataListResponse,
  ApiDataResponse,
  ApiErrorResponses,
} from '../../../common/swagger/api-responses';
import { Audit } from '../../audit';
import { CurrentUser, type AuthUser } from '../../auth';
import { RequireAnyPermission, RequirePermissions } from '../../rbac';
import { UuidParamPipe } from '../../system';
import { actorOf } from '../common/data-point';
import {
  ExportQueryDto,
  ImportFileDto,
  ImportQueryDto,
  ImportResultDto,
  ImportTemplateDto,
} from '../dto/import.dto';
import { CSV_MAX_BYTES } from './csv-codec';
import { isImportType, type ImportType } from './templates';
import { VehicleExportService } from './vehicle-export.service';
import { VehicleImportService } from './vehicle-import.service';

function typeParam(raw: string): ImportType {
  const t = raw
    .replace(/\.csv$/i, '')
    .toLowerCase()
    .replace(/-/g, '_');
  if (!isImportType(t)) throw AppException.notFound();
  return t;
}

interface UploadedCsv {
  buffer: Buffer;
  originalname?: string;
  size: number;
}

/**
 * CSV import / export of the catalog (REQUIREMENTS §17): templates with
 * column definitions, dry run (default) with row errors and duplicates,
 * idempotent commit, and a restricted export (data.export).
 */
@ApiTags('admin-vehicles-import')
@ApiErrorResponses(401, 403)
@Controller('admin/vehicles')
export class VehicleImportController {
  constructor(
    private readonly imports: VehicleImportService,
    private readonly exports: VehicleExportService,
  ) {}

  @Get('import/templates')
  @Header('Cache-Control', 'no-store')
  @RequireAnyPermission('imports.run', 'vehicles.write', 'data.export')
  @ApiOperation({ summary: 'CSV templates with column definitions, keys and permissions' })
  @ApiDataListResponse(ImportTemplateDto)
  templates(@Lang() lang: SupportedLanguage): PaginatedResponse<ImportTemplateDto> {
    return listOf(this.imports.templates(lang));
  }

  @Get('import/templates/:type')
  @RequireAnyPermission('imports.run', 'vehicles.write', 'data.export')
  @ApiOperation({ summary: 'Empty CSV template (header line) of one type' })
  @ApiProduces('text/csv')
  @ApiErrorResponses(404)
  template(@Param('type') raw: string, @Res({ passthrough: true }) res: Response): string {
    const type = typeParam(raw);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="evcar-${type}-template.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    return this.imports.templateCsv(type);
  }

  @Post('import/:type')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('imports.run', 'vehicles.write')
  @RateLimit('uploads')
  @Audit({ action: 'vehicles.import', entityType: 'import_job' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: CSV_MAX_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ImportFileDto })
  @ApiOperation({
    summary:
      'Uploads a CSV: dry run by default (row errors, duplicates, planned create/update/unchanged); ?dryRun=false imports',
  })
  @ApiDataResponse(ImportResultDto)
  @ApiErrorResponses(404, 413, 422)
  async upload(
    @Param('type') raw: string,
    @Query() query: ImportQueryDto,
    @UploadedFile() file: UploadedCsv | undefined,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<ImportResultDto>> {
    const result = await this.imports.upload(
      typeParam(raw),
      file?.buffer,
      file?.originalname,
      query.dryRun ?? true,
      actorOf(user),
      lang,
    );
    return ok(result);
  }

  @Post('import/jobs/:jobId/commit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('imports.run', 'vehicles.write')
  @Audit({ action: 'vehicles.import.commit', entityType: 'import_job', entityIdParam: 'jobId' })
  @ApiOperation({
    summary:
      'Applies a dry-run preview (re-validated against current data). Idempotent: repeating returns the first commit.',
  })
  @ApiDataResponse(ImportResultDto)
  @ApiErrorResponses(404, 409)
  async commit(
    @Param('jobId', UuidParamPipe) jobId: string,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<ImportResultDto>> {
    return ok(await this.imports.commit(jobId, actorOf(user), lang));
  }

  @Get('import/jobs/:jobId')
  @Header('Cache-Control', 'no-store')
  @RequireAnyPermission('imports.read', 'imports.run')
  @ApiOperation({ summary: 'Result of a catalog import job (summary + rows)' })
  @ApiDataResponse(ImportResultDto)
  @ApiErrorResponses(404)
  async job(@Param('jobId', UuidParamPipe) jobId: string): Promise<DataResponse<ImportResultDto>> {
    return ok(await this.imports.get(jobId));
  }

  @Get('export/:type')
  @RequirePermissions('data.export', 'vehicles.read')
  @RateLimit('uploads')
  @ApiOperation({
    summary: 'Restricted CSV export in the import template columns (audited)',
  })
  @ApiProduces('text/csv')
  @ApiErrorResponses(404, 422)
  async export(
    @Param('type') raw: string,
    @Query() query: ExportQueryDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const { filename, csv, rows } = await this.exports.export(typeParam(raw), query, user.id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Row-Count', String(rows));
    return csv;
  }
}
