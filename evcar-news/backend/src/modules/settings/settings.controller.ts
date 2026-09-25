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
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AppException } from '../../common/errors/app.exception';
import { ok, type DataResponse, listOf, type PaginatedResponse } from '../../common/http/responses';
import { RateLimit } from '../../common/throttle/rate-limit.decorator';
import {
  ApiDataResponse,
  ApiErrorResponses,
  ApiDataListResponse,
} from '../../common/swagger/api-responses';
import { Audit } from '../audit';
import { Public } from '../auth';
import { RequirePermissions } from '../rbac';
import { AppConfigService } from './app-config.service';
import {
  AppConfigDto,
  AppLinksSettingsDto,
  BrandingSettingsDto,
  DefaultsSettingsDto,
  FeaturesSettingsDto,
  HomeSectionsSettingsDto,
  LegalSettingsDto,
  LogoUploadDto,
  MapSettingsDto,
  SettingDto,
  ShareSettingsDto,
} from './settings.dto';
import { LOGO_MAX_BYTES, SettingsService, type UploadedFileLike } from './settings.service';
import { SETTING_ROUTE_KEYS, type SettingKey } from './settings.types';

function routeKey(raw: string): SettingKey {
  const key = SETTING_ROUTE_KEYS[raw];
  if (!key) throw AppException.notFound();
  return key;
}

@ApiTags('settings')
@Controller('app-config')
export class AppConfigController {
  constructor(private readonly appConfig: AppConfigService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary:
      'Public app configuration: branding, languages, markets, home sections, feature flags, map, share, legal',
    description:
      'Shape fixed by ARCHITECTURE §4.4.1. Cached; send If-None-Match with the ETag to get 304.',
  })
  @ApiDataResponse(AppConfigDto)
  async get(@Res({ passthrough: true }) res: Response): Promise<DataResponse<AppConfigDto>> {
    const { body, etag } = await this.appConfig.get();
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
    return ok(body);
  }
}

/**
 * Admin settings (settings.read / settings.write). Every write is validated
 * per key, audited (before/after) and invalidates /app-config.
 */
@ApiTags('admin-settings')
@ApiErrorResponses(401, 403)
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermissions('settings.read')
  @ApiOperation({ summary: 'All typed settings with values, defaults flag and admin warnings' })
  @ApiDataListResponse(SettingDto)
  async list(@Res({ passthrough: true }) res: Response): Promise<PaginatedResponse<SettingDto>> {
    res.setHeader('Cache-Control', 'no-store');
    return listOf(await this.settings.list());
  }

  @Get(':key')
  @RequirePermissions('settings.read')
  @ApiOperation({
    summary:
      'One setting: branding | defaults | home-sections | features | map | share | legal | app-links',
  })
  @ApiDataResponse(SettingDto)
  @ApiErrorResponses(404)
  async get(
    @Param('key') key: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<SettingDto>> {
    res.setHeader('Cache-Control', 'no-store');
    return ok(await this.settings.getOne(routeKey(key)));
  }

  @Put('branding')
  @RequirePermissions('settings.write')
  @Audit({ action: 'settings.branding.update', entityType: 'setting' })
  @ApiOperation({ summary: 'App name, logo URL and brand colors' })
  @ApiDataResponse(SettingDto)
  @ApiErrorResponses(422)
  async branding(@Body() dto: BrandingSettingsDto): Promise<DataResponse<SettingDto>> {
    return ok(await this.settings.set('branding', { ...dto }));
  }

  @Post('branding/logo')
  @RequirePermissions('settings.write')
  @RateLimit('uploads')
  @Audit({ action: 'settings.branding.logo_upload', entityType: 'setting' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: LOGO_MAX_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: LogoUploadDto })
  @ApiOperation({
    summary: 'Uploads the logo (PNG/JPEG/WebP ≥ 64 px, max 1 MB); stored as a public PNG',
  })
  @ApiDataResponse(SettingDto)
  @ApiErrorResponses(413, 422)
  async uploadLogo(
    @UploadedFile() file: UploadedFileLike | undefined,
  ): Promise<DataResponse<SettingDto>> {
    return ok(await this.settings.uploadLogo(file));
  }

  @Delete('branding/logo')
  @RequirePermissions('settings.write')
  @Audit({ action: 'settings.branding.logo_remove', entityType: 'setting' })
  @ApiOperation({ summary: 'Removes the logo (apps fall back to the app name)' })
  @ApiDataResponse(SettingDto)
  async removeLogo(): Promise<DataResponse<SettingDto>> {
    return ok(await this.settings.removeLogo());
  }

  @Put('defaults')
  @RequirePermissions('settings.write')
  @Audit({ action: 'settings.defaults.update', entityType: 'setting' })
  @ApiOperation({ summary: 'Default language, supported languages and default market' })
  @ApiDataResponse(SettingDto)
  @ApiErrorResponses(422)
  async defaults(@Body() dto: DefaultsSettingsDto): Promise<DataResponse<SettingDto>> {
    return ok(await this.settings.set('defaults', { ...dto }));
  }

  @Put('home-sections')
  @RequirePermissions('settings.write')
  @Audit({ action: 'settings.home_sections.update', entityType: 'setting' })
  @ApiOperation({ summary: 'Order and visibility of home sections' })
  @ApiDataResponse(SettingDto)
  @ApiErrorResponses(422)
  async homeSections(@Body() dto: HomeSectionsSettingsDto): Promise<DataResponse<SettingDto>> {
    return ok(
      await this.settings.set(
        'home.sections',
        dto.sections.map((s) => ({ ...s })),
      ),
    );
  }

  @Patch('features')
  @RequirePermissions('settings.write')
  @Audit({ action: 'settings.features.update', entityType: 'setting' })
  @ApiOperation({
    summary: 'Feature flags (partial update); trip planner / assistant stay off until configured',
  })
  @ApiDataResponse(SettingDto)
  @ApiErrorResponses(422)
  async features(@Body() dto: FeaturesSettingsDto): Promise<DataResponse<SettingDto>> {
    return ok(await this.settings.set('features', { ...dto }));
  }

  @Put('map')
  @RequirePermissions('settings.write')
  @Audit({ action: 'settings.map.update', entityType: 'setting' })
  @ApiOperation({ summary: 'Map tile provider (URL template, attribution, max zoom)' })
  @ApiDataResponse(SettingDto)
  @ApiErrorResponses(422)
  async map(@Body() dto: MapSettingsDto): Promise<DataResponse<SettingDto>> {
    return ok(await this.settings.set('map', { ...dto }));
  }

  @Put('share')
  @RequirePermissions('settings.write')
  @Audit({ action: 'settings.share.update', entityType: 'setting' })
  @ApiOperation({ summary: 'Share link base URL, path templates, default image and language' })
  @ApiDataResponse(SettingDto)
  @ApiErrorResponses(422)
  async share(@Body() dto: ShareSettingsDto): Promise<DataResponse<SettingDto>> {
    return ok(await this.settings.set('share', { ...dto, paths: { ...dto.paths } }));
  }

  @Put('legal')
  @RequirePermissions('settings.write')
  @Audit({ action: 'settings.legal.update', entityType: 'setting' })
  @ApiOperation({ summary: 'Privacy policy and terms URLs' })
  @ApiDataResponse(SettingDto)
  @ApiErrorResponses(422)
  async legal(@Body() dto: LegalSettingsDto): Promise<DataResponse<SettingDto>> {
    return ok(await this.settings.set('legal', { ...dto }));
  }

  @Put('app-links')
  @RequirePermissions('settings.write')
  @Audit({ action: 'settings.app_links.update', entityType: 'setting' })
  @ApiOperation({
    summary: 'Inputs of assetlinks.json / apple-app-site-association (package, fingerprints, team)',
  })
  @ApiDataResponse(SettingDto)
  @ApiErrorResponses(422)
  async appLinks(@Body() dto: AppLinksSettingsDto): Promise<DataResponse<SettingDto>> {
    return ok(await this.settings.set('app_links', { ...dto }));
  }

  @Post(':key/reset')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('settings.write')
  @Audit({ action: 'settings.reset', entityType: 'setting', entityIdParam: 'key' })
  @ApiOperation({ summary: 'Restores the built-in default of a setting' })
  @ApiDataResponse(SettingDto)
  @ApiErrorResponses(404)
  async reset(@Param('key') key: string): Promise<DataResponse<SettingDto>> {
    return ok(await this.settings.reset(routeKey(key)));
  }
}
