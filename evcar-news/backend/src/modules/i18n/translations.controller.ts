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
import { toPageRequest } from '../../common/http/pagination';
import {
  ok,
  paginated,
  type DataResponse,
  type PaginatedResponse,
  listOf,
} from '../../common/http/responses';
import { ApiLocale, Lang } from '../../common/i18n/request-locale';
import {
  ApiDataResponse,
  ApiErrorResponses,
  ApiPaginatedResponse,
  ApiDataListResponse,
} from '../../common/swagger/api-responses';
import { Public } from '../auth';
import { RequireAnyPermission, RequirePermissions } from '../rbac';
import { UuidParamPipe } from '../system/uuid-param.pipe';
import {
  CatalogEntryDto,
  CatalogQueryDto,
  CreateTranslationDto,
  ListTranslationsQueryDto,
  PublicTranslationsDto,
  PublicTranslationsQueryDto,
  TranslationDto,
  UpdateTranslationDto,
} from './translations.dto';
import { TranslationsService } from './translations.service';

@ApiTags('i18n')
@Controller('translations')
export class PublicTranslationsController {
  constructor(private readonly translations: TranslationsService) {}

  @Get()
  @Public()
  @ApiLocale()
  @ApiOperation({
    summary:
      'Admin-edited UI string overrides for the request language (layer over bundled strings)',
  })
  @ApiDataResponse(PublicTranslationsDto)
  async bundle(
    @Lang() lang: SupportedLanguage,
    @Query() query: PublicTranslationsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<PublicTranslationsDto>> {
    const namespaces = query.namespaces?.split(',').filter(Boolean);
    const { body, etag } = await this.translations.publicBundle(lang, namespaces);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return ok(body);
  }
}

@ApiTags('admin-i18n')
@ApiErrorResponses(401, 403)
@Controller('admin/translations')
export class AdminTranslationsController {
  constructor(private readonly translations: TranslationsService) {}

  @Get()
  @RequireAnyPermission('translations.write', 'settings.read')
  @ApiOperation({ summary: 'Translation overrides (filter by namespace, locale, text)' })
  @ApiPaginatedResponse(TranslationDto)
  async list(
    @Query() query: ListTranslationsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<TranslationDto>> {
    res.setHeader('Cache-Control', 'no-store');
    const page = toPageRequest(query);
    const { items, total } = await this.translations.list({
      namespace: query.namespace,
      locale: query.locale,
      q: query.q,
      sort: query.sort,
      skip: page.skip,
      take: page.take,
    });
    return paginated(items, total, page);
  }

  @Get('catalog')
  @RequireAnyPermission('translations.write', 'settings.read')
  @ApiOperation({
    summary: 'Built-in server messages (errors, notifications, labels) with their overrides',
  })
  @ApiDataListResponse(CatalogEntryDto)
  async catalog(
    @Query() query: CatalogQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<CatalogEntryDto>> {
    res.setHeader('Cache-Control', 'no-store');
    return listOf(await this.translations.catalog(query.namespace));
  }

  @Get(':id')
  @RequireAnyPermission('translations.write', 'settings.read')
  @ApiDataResponse(TranslationDto)
  @ApiErrorResponses(404)
  async get(@Param('id', UuidParamPipe) id: string): Promise<DataResponse<TranslationDto>> {
    return ok(await this.translations.get(id));
  }

  @Post()
  @RequirePermissions('translations.write')
  @ApiOperation({ summary: 'Creates an override (server keys must keep their placeholders)' })
  @ApiDataResponse(TranslationDto)
  @ApiErrorResponses(409, 422)
  async create(@Body() dto: CreateTranslationDto): Promise<DataResponse<TranslationDto>> {
    return ok(await this.translations.create(dto));
  }

  @Patch(':id')
  @RequirePermissions('translations.write')
  @ApiDataResponse(TranslationDto)
  @ApiErrorResponses(404, 422)
  async update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateTranslationDto,
  ): Promise<DataResponse<TranslationDto>> {
    return ok(await this.translations.update(id, dto.value));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('translations.write')
  @ApiOperation({ summary: 'Deletes an override (the built-in text applies again)' })
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  async remove(@Param('id', UuidParamPipe) id: string): Promise<void> {
    await this.translations.remove(id);
  }
}
