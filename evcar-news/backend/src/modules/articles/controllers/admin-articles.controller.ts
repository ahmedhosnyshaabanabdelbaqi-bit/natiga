import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { SupportedLanguage } from '../../../config/app-config';
import {
  listOf,
  ok,
  type DataResponse,
  type PaginatedResponse,
} from '../../../common/http/responses';
import { Lang } from '../../../common/i18n/request-locale';
import {
  ApiDataListResponse,
  ApiDataResponse,
  ApiErrorResponses,
  ApiPaginatedResponse,
} from '../../../common/swagger/api-responses';
import { RateLimit } from '../../../common/throttle/rate-limit.decorator';
import { Audit } from '../../audit';
import { CurrentUser, type AuthUser } from '../../auth';
import { RequireAnyPermission, RequirePermissions } from '../../rbac';
import { UuidParamPipe } from '../../system';
import { contentError } from '../common/content-errors';
import { setNoStore } from '../common/http-cache';
import { isContentLocale } from '../common/localized';
import type { WorkflowAction } from '../domain/article-workflow';
import { ArticleImageViewDto } from '../dto/article-common.dto';
import {
  ArticleImageUploadDto,
  ArticleImageUploadSchemaDto,
  UploadedArticleImageDto,
} from '../dto/article-image.dto';
import {
  AdminArticleDto,
  AdminArticleQueryDto,
  AdminArticleSummaryDto,
  AuthorOptionDto,
  CorrectionDto,
  CreateArticleDto,
  CreateCorrectionDto,
  PreviewTokenDto,
  PreviewTokenRequestDto,
  RejectArticleDto,
  RestoreRevisionDto,
  RevisionDetailDto,
  RevisionDiffDto,
  RevisionDiffQueryDto,
  RevisionListQueryDto,
  RevisionSummaryDto,
  ScheduleArticleDto,
  UpdateArticleDto,
  UpdateCorrectionDto,
  WorkflowActionDto,
} from '../dto/admin-article.dto';
import { ArticleCorrectionsService } from '../services/article-corrections.service';
import {
  ARTICLE_IMAGE_MAX_BYTES,
  ArticleMediaService,
  type UploadedFileLike,
} from '../services/article-media.service';
import { ArticleRevisionsService } from '../services/article-revisions.service';
import { ArticlesAdminService } from '../services/articles-admin.service';

@ApiTags('admin-news')
@ApiErrorResponses(401, 403)
@Controller('admin/articles')
export class AdminArticlesController {
  constructor(
    private readonly articles: ArticlesAdminService,
    private readonly revisions: ArticleRevisionsService,
    private readonly corrections: ArticleCorrectionsService,
    private readonly media: ArticleMediaService,
  ) {}

  // --- static routes first (before :id) ------------------------------------------------

  @Get()
  @RequirePermissions('articles.read')
  @ApiOperation({ summary: 'All articles (any status) with editorial filters' })
  @ApiPaginatedResponse(AdminArticleSummaryDto)
  async list(
    @Query() query: AdminArticleQueryDto,
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<AdminArticleSummaryDto>> {
    setNoStore(res);
    return this.articles.list(query, lang);
  }

  @Get('authors')
  @RequirePermissions('articles.read')
  @ApiOperation({ summary: 'Staff who can be named as author' })
  @ApiDataListResponse(AuthorOptionDto)
  async authors(): Promise<PaginatedResponse<AuthorOptionDto>> {
    return listOf(await this.articles.authors());
  }

  @Get('images')
  @RequireAnyPermission('articles.read', 'media.read')
  @ApiOperation({ summary: 'Latest licensed images of the library (cover picker)' })
  @ApiDataListResponse(ArticleImageViewDto)
  async images(@Lang() lang: SupportedLanguage): Promise<PaginatedResponse<ArticleImageViewDto>> {
    return listOf(await this.articles.recentImages(lang));
  }

  @Post('images')
  @RequirePermissions('media.upload', 'licenses.write')
  @RateLimit('uploads')
  @Audit({ action: 'articles.image_upload', entityType: 'media_asset' })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: ARTICLE_IMAGE_MAX_BYTES, files: 1 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ArticleImageUploadSchemaDto })
  @ApiOperation({
    summary:
      'Uploads an article image with its licence (cover or inline figure). Returns the URL and a <figure> snippet.',
  })
  @ApiDataResponse(UploadedArticleImageDto)
  @ApiErrorResponses(413, 422)
  async uploadImage(
    @UploadedFile() file: UploadedFileLike | undefined,
    @Body() dto: ArticleImageUploadDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<UploadedArticleImageDto>> {
    return ok(await this.media.upload(file, dto, user.id, lang));
  }

  @Post()
  @RequirePermissions('articles.create')
  @Audit({ action: 'articles.create', entityType: 'article' })
  @ApiOperation({ summary: 'Creates a DRAFT article (version 1)' })
  @ApiDataResponse(AdminArticleDto)
  @ApiErrorResponses(409, 422)
  async create(
    @Body() dto: CreateArticleDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<AdminArticleDto>> {
    return ok(await this.articles.create(dto, user, lang));
  }

  // --- one article -----------------------------------------------------------------------

  @Get(':id')
  @RequirePermissions('articles.read')
  @ApiOperation({
    summary: 'Editor view (all languages, allowedActions, publishIssues, deleted too)',
  })
  @ApiDataResponse(AdminArticleDto)
  @ApiErrorResponses(404)
  async get(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<AdminArticleDto>> {
    setNoStore(res);
    return ok(await this.articles.get(id, user, lang));
  }

  @Patch(':id')
  @RequireAnyPermission('articles.update', 'articles.update_any')
  @Audit({ action: 'articles.update', entityType: 'article' })
  @ApiOperation({
    summary:
      'Edits content (new version). expectedVersion required; scheduled/published need articles.publish; archived → 409',
  })
  @ApiDataResponse(AdminArticleDto)
  @ApiErrorResponses(404, 409, 422)
  async update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateArticleDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<AdminArticleDto>> {
    return ok(await this.articles.update(id, dto, user, lang));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('articles.delete')
  @Audit({ action: 'articles.delete', entityType: 'article' })
  @ApiOperation({ summary: 'Soft-deletes a draft / in-review / archived article' })
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 409)
  async remove(@Param('id', UuidParamPipe) id: string): Promise<void> {
    await this.articles.remove(id);
  }

  @Post(':id/undelete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('articles.delete')
  @Audit({ action: 'articles.undelete', entityType: 'article' })
  @ApiDataResponse(AdminArticleDto)
  @ApiErrorResponses(404, 409)
  async undelete(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<AdminArticleDto>> {
    return ok(await this.articles.undelete(id, user, lang));
  }

  // --- workflow --------------------------------------------------------------------------

  private act(
    id: string,
    action: WorkflowAction,
    dto: { note?: string; expectedVersion?: number; scheduledAt?: string },
    user: AuthUser,
    lang: SupportedLanguage,
  ) {
    return this.articles.transition(id, action, dto, user, lang).then(ok);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('articles.submit')
  @Audit({ action: 'articles.submit', entityType: 'article' })
  @ApiOperation({ summary: 'draft → in_review' })
  @ApiDataResponse(AdminArticleDto)
  @ApiErrorResponses(404, 409, 422)
  submit(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: WorkflowActionDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
  ) {
    return this.act(id, 'submit', dto, user, lang);
  }

  @Post(':id/withdraw')
  @HttpCode(HttpStatus.OK)
  @RequireAnyPermission('articles.submit', 'articles.review')
  @Audit({ action: 'articles.withdraw', entityType: 'article' })
  @ApiOperation({ summary: 'in_review → draft (author takes it back)' })
  @ApiDataResponse(AdminArticleDto)
  @ApiErrorResponses(404, 409)
  withdraw(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: WorkflowActionDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
  ) {
    return this.act(id, 'withdraw', dto, user, lang);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('articles.review')
  @Audit({ action: 'articles.approve', entityType: 'article' })
  @ApiOperation({ summary: 'Records the content review (in_review, approved)' })
  @ApiDataResponse(AdminArticleDto)
  @ApiErrorResponses(404, 409)
  approve(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: WorkflowActionDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
  ) {
    return this.act(id, 'approve', dto, user, lang);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('articles.review')
  @Audit({ action: 'articles.reject', entityType: 'article' })
  @ApiOperation({ summary: 'in_review → draft with a reviewer note' })
  @ApiDataResponse(AdminArticleDto)
  @ApiErrorResponses(404, 409, 422)
  reject(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: RejectArticleDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
  ) {
    return this.act(id, 'reject', dto, user, lang);
  }

  @Post(':id/schedule')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('articles.publish')
  @Audit({ action: 'articles.schedule', entityType: 'article' })
  @ApiOperation({
    summary: 'Approved in_review / scheduled → scheduled (published automatically when due)',
  })
  @ApiDataResponse(AdminArticleDto)
  @ApiErrorResponses(404, 409, 422)
  schedule(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: ScheduleArticleDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
  ) {
    return this.act(id, 'schedule', dto, user, lang);
  }

  @Post(':id/unschedule')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('articles.publish')
  @Audit({ action: 'articles.unschedule', entityType: 'article' })
  @ApiOperation({ summary: 'scheduled → in_review (approval kept)' })
  @ApiDataResponse(AdminArticleDto)
  @ApiErrorResponses(404, 409)
  unschedule(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: WorkflowActionDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
  ) {
    return this.act(id, 'unschedule', dto, user, lang);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('articles.publish')
  @Audit({ action: 'articles.publish', entityType: 'article' })
  @ApiOperation({ summary: 'Approved in_review / scheduled → published now' })
  @ApiDataResponse(AdminArticleDto)
  @ApiErrorResponses(404, 409, 422)
  publish(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: WorkflowActionDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
  ) {
    return this.act(id, 'publish', dto, user, lang);
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('articles.publish')
  @Audit({ action: 'articles.unpublish', entityType: 'article' })
  @ApiOperation({ summary: 'published / archived → draft (hidden from readers)' })
  @ApiDataResponse(AdminArticleDto)
  @ApiErrorResponses(404, 409)
  unpublish(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: WorkflowActionDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
  ) {
    return this.act(id, 'unpublish', dto, user, lang);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('articles.archive')
  @Audit({ action: 'articles.archive', entityType: 'article' })
  @ApiOperation({ summary: 'published → archived (hidden from lists and detail)' })
  @ApiDataResponse(AdminArticleDto)
  @ApiErrorResponses(404, 409)
  archive(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: WorkflowActionDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
  ) {
    return this.act(id, 'archive', dto, user, lang);
  }

  @Post(':id/unarchive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('articles.publish')
  @Audit({ action: 'articles.unarchive', entityType: 'article' })
  @ApiOperation({ summary: 'archived → published' })
  @ApiDataResponse(AdminArticleDto)
  @ApiErrorResponses(404, 409, 422)
  unarchive(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: WorkflowActionDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
  ) {
    return this.act(id, 'unarchive', dto, user, lang);
  }

  // --- translations / preview ------------------------------------------------------------

  @Post(':id/translations/:locale/mark-reviewed')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('articles.review')
  @Audit({ action: 'articles.translation_reviewed', entityType: 'article' })
  @ApiOperation({
    summary: 'A person reviewed this machine translation: it may now be served (new version)',
  })
  @ApiDataResponse(AdminArticleDto)
  @ApiErrorResponses(404, 409)
  async markReviewed(
    @Param('id', UuidParamPipe) id: string,
    @Param('locale') locale: string,
    @Body() dto: RestoreRevisionDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<AdminArticleDto>> {
    if (!isContentLocale(locale)) throw contentError('ARTICLE_TRANSLATION_NOT_FOUND', { locale });
    return ok(
      await this.articles.markTranslationReviewed(id, locale, dto.expectedVersion, user, lang),
    );
  }

  @Post(':id/preview-token')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('articles.read')
  @ApiOperation({ summary: 'Signed link to read the article before publication' })
  @ApiDataResponse(PreviewTokenDto)
  @ApiErrorResponses(404)
  async previewToken(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: PreviewTokenRequestDto,
  ): Promise<DataResponse<PreviewTokenDto>> {
    return ok(await this.articles.previewToken(id, dto.ttlMinutes));
  }

  // --- revisions -------------------------------------------------------------------------

  @Get(':id/revisions')
  @RequirePermissions('articles.read')
  @ApiOperation({ summary: 'Saved versions, newest first' })
  @ApiPaginatedResponse(RevisionSummaryDto)
  revisionsList(@Param('id', UuidParamPipe) id: string, @Query() query: RevisionListQueryDto) {
    return this.revisions.list(id, query);
  }

  @Get(':id/revisions/:version')
  @RequirePermissions('articles.read')
  @ApiDataResponse(RevisionDetailDto)
  @ApiErrorResponses(404)
  async revision(
    @Param('id', UuidParamPipe) id: string,
    @Param('version', ParseIntPipe) version: number,
  ): Promise<DataResponse<RevisionDetailDto>> {
    return ok(await this.revisions.get(id, version));
  }

  @Get(':id/revisions/:version/diff')
  @RequirePermissions('articles.read')
  @ApiOperation({
    summary: 'Field changes + body word diff (default: against the previous version)',
  })
  @ApiDataResponse(RevisionDiffDto)
  @ApiErrorResponses(404)
  async diff(
    @Param('id', UuidParamPipe) id: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() query: RevisionDiffQueryDto,
  ): Promise<DataResponse<RevisionDiffDto>> {
    return ok(await this.revisions.diff(id, version, query.against));
  }

  @Post(':id/revisions/:version/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('articles.restore_revision')
  @Audit({ action: 'articles.restore_revision', entityType: 'article' })
  @ApiOperation({ summary: 'Restores a previous version as a NEW version' })
  @ApiDataResponse(AdminArticleDto)
  @ApiErrorResponses(404, 409, 422)
  async restore(
    @Param('id', UuidParamPipe) id: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() dto: RestoreRevisionDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<AdminArticleDto>> {
    return ok(await this.revisions.restore(id, version, dto.expectedVersion, user, lang));
  }

  // --- corrections -----------------------------------------------------------------------

  @Get(':id/corrections')
  @RequirePermissions('articles.read')
  @ApiDataListResponse(CorrectionDto)
  async correctionsList(
    @Param('id', UuidParamPipe) id: string,
  ): Promise<PaginatedResponse<CorrectionDto>> {
    return listOf(await this.corrections.list(id));
  }

  @Post(':id/corrections')
  @RequirePermissions('articles.publish')
  @Audit({ action: 'articles.correction_create', entityType: 'article' })
  @ApiOperation({ summary: 'Adds a public correction / clarification / update note' })
  @ApiDataResponse(CorrectionDto)
  @ApiErrorResponses(404, 422)
  async correctionCreate(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: CreateCorrectionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<CorrectionDto>> {
    return ok(await this.corrections.create(id, dto, user.id));
  }

  @Patch(':id/corrections/:correctionId')
  @RequirePermissions('articles.publish')
  @Audit({ action: 'articles.correction_update', entityType: 'article' })
  @ApiDataResponse(CorrectionDto)
  @ApiErrorResponses(404, 422)
  async correctionUpdate(
    @Param('id', UuidParamPipe) id: string,
    @Param('correctionId', UuidParamPipe) correctionId: string,
    @Body() dto: UpdateCorrectionDto,
  ): Promise<DataResponse<CorrectionDto>> {
    return ok(await this.corrections.update(id, correctionId, dto));
  }

  @Delete(':id/corrections/:correctionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('articles.publish')
  @Audit({ action: 'articles.correction_delete', entityType: 'article' })
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  async correctionDelete(
    @Param('id', UuidParamPipe) id: string,
    @Param('correctionId', UuidParamPipe) correctionId: string,
  ): Promise<void> {
    await this.corrections.remove(id, correctionId);
  }
}
