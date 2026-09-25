import {
  Body,
  Controller,
  Delete,
  Get,
  Head,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
  ApiExtraModels,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AppException } from '../../../common/errors/app.exception';
import {
  ok,
  paginated,
  type DataResponse,
  type PaginatedResponse,
} from '../../../common/http/responses';
import {
  ApiDataListResponse,
  ApiDataResponse,
  ApiErrorResponses,
  ApiPaginatedResponse,
} from '../../../common/swagger/api-responses';
import { RateLimit } from '../../../common/throttle/rate-limit.decorator';
import { SkipAudit } from '../../audit';
import { CurrentUser, type AuthUser } from '../../auth';
import { RequireAnyPermission, RequirePermissions } from '../../rbac';
import { UuidParamPipe } from '../../system';
import {
  AdminMediaAssetDetailDto,
  AdminMediaAssetDto,
  AdminMediaListQueryDto,
  CreateLicenseDto,
  CreateUploadDto,
  EmbedVideoDto,
  LicenseDto,
  LicenseListQueryDto,
  MediaCompletionDto,
  ReprocessResultDto,
  UpdateLicenseDto,
  UpdateMediaAssetDto,
  UploadSessionDto,
  VisualCheckDto,
} from '../dto/media.dto';
import { MediaErrors } from '../media-errors';
import { LicensesService } from '../services/licenses.service';
import { MediaAssetsService } from '../services/media-assets.service';
import { UploadSessionsService } from '../services/upload-sessions.service';

const actorOf = (u: AuthUser) => ({ id: u.id, permissions: u.permissions });

function setOffsetHeaders(res: Response, s: UploadSessionDto): void {
  res.setHeader('Upload-Offset', String(s.receivedBytes));
  res.setHeader('Upload-Length', String(s.totalBytes));
  res.setHeader('Cache-Control', 'no-store');
}

@ApiTags('admin-media')
@ApiErrorResponses(401, 403)
@Controller('admin/media/uploads')
export class AdminMediaUploadsController {
  constructor(private readonly uploads: UploadSessionsService) {}

  @Post()
  @RequirePermissions('media.upload')
  @RateLimit('uploads')
  @ApiOperation({
    summary: 'Starts a resumable upload (declared size / type / optional SHA-256)',
    description:
      'Returns the session; send the bytes with PATCH at `Upload-Offset` (tus-like). Headers: Location, Upload-Offset, Upload-Length.',
  })
  @ApiExtraModels(UploadSessionDto)
  @ApiCreatedResponse({
    schema: { type: 'object', properties: { data: { $ref: getSchemaPath(UploadSessionDto) } } },
  })
  @ApiErrorResponses(413, 415, 422)
  async create(
    @Body() dto: CreateUploadDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<UploadSessionDto>> {
    const session = await this.uploads.create(dto, actorOf(user));
    res.setHeader('Location', `/api/v1/admin/media/uploads/${session.id}`);
    setOffsetHeaders(res, session);
    return ok(session);
  }

  @Get(':id')
  @RequirePermissions('media.upload')
  @ApiOperation({ summary: 'Upload session state (receivedBytes = offset to resume from)' })
  @ApiDataResponse(UploadSessionDto)
  @ApiErrorResponses(404)
  async get(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<UploadSessionDto>> {
    const session = await this.uploads.get(id, actorOf(user));
    setOffsetHeaders(res, session);
    return ok(session);
  }

  @Head(':id')
  @RequirePermissions('media.upload')
  @ApiOperation({ summary: 'tus-style offset check: Upload-Offset / Upload-Length headers' })
  async head(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    const session = await this.uploads.get(id, actorOf(user));
    setOffsetHeaders(res, session);
    res.status(200).end();
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SkipAudit()
  @RequirePermissions('media.upload')
  @ApiOperation({
    summary: 'Appends one chunk at Upload-Offset (application/offset+octet-stream)',
    description:
      '409 UPLOAD_OFFSET_MISMATCH (details.expectedOffset) when the offset differs from what the server has: resume from there. Responds with the new Upload-Offset.',
  })
  @ApiConsumes('application/offset+octet-stream', 'application/octet-stream')
  @ApiHeader({ name: 'Upload-Offset', required: true, description: 'Byte offset of this chunk.' })
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  @ApiNoContentResponse({ description: 'Chunk stored; header Upload-Offset = new offset.' })
  @ApiErrorResponses(400, 404, 409, 410, 413, 415, 422)
  async chunk(
    @Param('id', UuidParamPipe) id: string,
    @Headers('upload-offset') rawOffset: string | undefined,
    @Req() req: Request,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    if (rawOffset === undefined || !/^\d{1,15}$/.test(rawOffset.trim())) {
      throw MediaErrors.offsetHeaderMissing();
    }
    const body: unknown = req.body;
    if (!Buffer.isBuffer(body)) {
      throw new AppException({
        status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: {
          ar: 'أرسل الجزء بنوع application/offset+octet-stream.',
          en: 'Send the chunk as application/offset+octet-stream.',
        },
      });
    }
    const next = await this.uploads.appendChunk(id, Number(rawOffset.trim()), body, actorOf(user));
    res.setHeader('Upload-Offset', String(next));
    res.setHeader('Cache-Control', 'no-store');
  }

  @Post(':id/complete')
  @RequirePermissions('media.upload')
  @ApiOperation({
    summary: 'Assembles + validates the file, creates the media asset and queues processing',
    description:
      'Validation: size, SHA-256, type sniffed from the bytes, full decode, dimensions, 2:1 for panoramas (+ warnings the editor must acknowledge). A refused file answers 422 MEDIA_REJECTED (details.assetId, details.problems) and is kept only as a `rejected` record. Idempotent after success.',
  })
  @ApiExtraModels(MediaCompletionDto)
  @ApiCreatedResponse({
    schema: { type: 'object', properties: { data: { $ref: getSchemaPath(MediaCompletionDto) } } },
  })
  @ApiErrorResponses(404, 409, 410, 422)
  async complete(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<MediaCompletionDto>> {
    return ok(await this.uploads.complete(id, actorOf(user)));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('media.upload')
  @ApiOperation({ summary: 'Cancels an upload and frees its stored parts' })
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  async abort(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.uploads.abort(id, actorOf(user));
  }
}

@ApiTags('admin-media')
@ApiErrorResponses(401, 403)
@Controller('admin/media/assets')
export class AdminMediaAssetsController {
  constructor(private readonly assets: MediaAssetsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('media.read')
  @ApiOperation({
    summary: 'Media library (filters kind, status, q, licensed, licenseId, purpose, isDemo)',
  })
  @ApiPaginatedResponse(AdminMediaAssetDto)
  async list(
    @Query() query: AdminMediaListQueryDto,
  ): Promise<PaginatedResponse<AdminMediaAssetDto>> {
    const { items, total, page } = await this.assets.list(query);
    return paginated(items, total, page);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('media.read')
  @ApiOperation({
    summary:
      'One asset: validation report, processing progress / error, generated files, licence, usage, signed original URL',
  })
  @ApiDataResponse(AdminMediaAssetDetailDto)
  @ApiErrorResponses(404)
  async get(
    @Param('id', UuidParamPipe) id: string,
  ): Promise<DataResponse<AdminMediaAssetDetailDto>> {
    return ok(await this.assets.detail(id));
  }

  @Get(':id/versions')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('media.read')
  @ApiOperation({ summary: 'Version chain of the file (oldest first)' })
  @ApiDataListResponse(AdminMediaAssetDto)
  @ApiErrorResponses(404)
  async versions(
    @Param('id', UuidParamPipe) id: string,
  ): Promise<PaginatedResponse<AdminMediaAssetDto>> {
    const items = await this.assets.versions(id);
    return paginated(items, items.length, { page: 1, pageSize: Math.max(1, items.length) });
  }

  @Patch(':id')
  @RequirePermissions('media.upload')
  @ApiOperation({
    summary: 'Edits alt texts / captions / credit; licenseId needs licenses.write',
  })
  @ApiDataResponse(AdminMediaAssetDto)
  @ApiErrorResponses(404, 422)
  async update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateMediaAssetDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminMediaAssetDto>> {
    return ok(await this.assets.update(id, dto, actorOf(user)));
  }

  @Post(':id/visual-check')
  @HttpCode(HttpStatus.OK)
  @RequireAnyPermission('tours.write', 'tours.publish')
  @ApiOperation({
    summary:
      'Editor confirms the panorama after looking at it (orientation, distortions, right trim)',
    description:
      'Required before a tour using the panorama can be published. Every validation warning (severity "warning") must be listed in acknowledgedWarnings.',
  })
  @ApiDataResponse(AdminMediaAssetDto)
  @ApiErrorResponses(404, 409, 422)
  async confirm(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: VisualCheckDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminMediaAssetDto>> {
    return ok(await this.assets.confirmVisualCheck(id, dto, user.id));
  }

  @Delete(':id/visual-check')
  @RequireAnyPermission('tours.write', 'tours.publish')
  @ApiOperation({ summary: 'Withdraws the visual check' })
  @ApiDataResponse(AdminMediaAssetDto)
  @ApiErrorResponses(404, 422)
  async revoke(@Param('id', UuidParamPipe) id: string): Promise<DataResponse<AdminMediaAssetDto>> {
    return ok(await this.assets.revokeVisualCheck(id));
  }

  @Post(':id/reprocess')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions('media.manage')
  @ApiOperation({ summary: 'Queues processing again (idempotent; deduplicated per asset)' })
  @ApiAcceptedResponse({ type: ReprocessResultDto })
  @ApiErrorResponses(404, 409, 503)
  async reprocess(
    @Param('id', UuidParamPipe) id: string,
  ): Promise<DataResponse<ReprocessResultDto>> {
    return ok(await this.assets.reprocess(id));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('media.manage')
  @ApiOperation({
    summary: 'Soft-deletes a file that nothing uses (409 IN_USE otherwise); stored files are kept',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 409)
  async remove(@Param('id', UuidParamPipe) id: string): Promise<void> {
    await this.assets.remove(id);
  }
}

@ApiTags('admin-media')
@ApiErrorResponses(401, 403)
@Controller('admin/media/videos')
export class AdminMediaVideosController {
  constructor(private readonly assets: MediaAssetsService) {}

  @Post('embed')
  @RequirePermissions('media.upload')
  @ApiOperation({
    summary: 'Registers a licensed YouTube / Vimeo video (allow-list) for video hotspots',
  })
  @ApiExtraModels(AdminMediaAssetDto)
  @ApiCreatedResponse({
    schema: { type: 'object', properties: { data: { $ref: getSchemaPath(AdminMediaAssetDto) } } },
  })
  @ApiErrorResponses(422)
  async embed(
    @Body() dto: EmbedVideoDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<AdminMediaAssetDto>> {
    return ok(await this.assets.registerEmbed(dto, actorOf(user)));
  }
}

@ApiTags('admin-media')
@ApiErrorResponses(401, 403)
@Controller('admin/media/licenses')
export class AdminLicensesController {
  constructor(private readonly licenses: LicensesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequireAnyPermission('media.read', 'licenses.write')
  @ApiOperation({ summary: 'Licences (q, licenseType, expiringWithinDays incl. expired ones)' })
  @ApiPaginatedResponse(LicenseDto)
  async list(@Query() query: LicenseListQueryDto): Promise<PaginatedResponse<LicenseDto>> {
    const { items, total, page } = await this.licenses.list(query);
    return paginated(items, total, page);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @RequireAnyPermission('media.read', 'licenses.write')
  @ApiDataResponse(LicenseDto)
  @ApiErrorResponses(404)
  async get(@Param('id', UuidParamPipe) id: string): Promise<DataResponse<LicenseDto>> {
    return ok(await this.licenses.get(id));
  }

  @Post()
  @RequirePermissions('licenses.write')
  @ApiOperation({ summary: 'Records a licence (rights holder, attribution, validity, proof)' })
  @ApiExtraModels(LicenseDto)
  @ApiCreatedResponse({
    schema: { type: 'object', properties: { data: { $ref: getSchemaPath(LicenseDto) } } },
  })
  @ApiErrorResponses(422)
  async create(
    @Body() dto: CreateLicenseDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DataResponse<LicenseDto>> {
    return ok(await this.licenses.create(dto, user.id));
  }

  @Patch(':id')
  @RequirePermissions('licenses.write')
  @ApiDataResponse(LicenseDto)
  @ApiErrorResponses(404, 422)
  async update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateLicenseDto,
  ): Promise<DataResponse<LicenseDto>> {
    return ok(await this.licenses.update(id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('licenses.write')
  @ApiOperation({ summary: 'Deletes a licence no file uses (409 IN_USE otherwise)' })
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 409)
  async remove(@Param('id', UuidParamPipe) id: string): Promise<void> {
    await this.licenses.remove(id);
  }
}
