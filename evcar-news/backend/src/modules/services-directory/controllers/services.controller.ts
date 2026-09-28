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
import { listOf, ok } from '../../../common/http/responses';
import { ApiLocale, Lang, Market } from '../../../common/i18n/request-locale';
import {
  ApiDataListResponse,
  ApiDataResponse,
  ApiErrorResponses,
  ApiPaginatedResponse,
} from '../../../common/swagger/api-responses';
import { Audit } from '../../audit';
import { CurrentUser, Public, type AuthUser } from '../../auth';
import { RequireAnyPermission, RequirePermissions } from '../../rbac';
import { UuidParamPipe } from '../../system';
import { QueryNumber } from '../../stations/dto/validators';
import { setNoStore, setPublicCache } from '../../search/common/discovery-http';
import {
  AdminProviderQueryDto,
  AdminProviderViewDto,
  CreateProviderDto,
  ServiceListQueryDto,
  ServiceProviderDetailDto,
  ServiceProviderViewDto,
  ServiceTypeCountDto,
  UpdateProviderDto,
  VerifyContactDto,
} from '../dto/services.dto';
import { ServicesAdminService } from '../services/services-admin.service';
import { ServicesPublicService, type ServiceListResult } from '../services/services-public.service';

class ServiceDetailQueryDto {
  @QueryNumber(-90, 90) lat?: number;
  @QueryNumber(-180, 180) lng?: number;
}

@ApiTags('services')
@Controller('services')
export class PublicServicesController {
  constructor(private readonly svc: ServicesPublicService) {}

  @Get()
  @Public()
  @ApiLocale()
  @ApiOperation({
    summary: 'Services directory of the market (editorial order; sponsored only labelled)',
    description:
      'Order: distance (with lat/lng) else verified contacts first, then name. Sponsorship never changes the order; up to 3 currently sponsored entries are ALSO returned in meta.sponsored (each isSponsored=true with sponsorLabel).',
  })
  @ApiPaginatedResponse(ServiceProviderViewDto)
  @ApiErrorResponses(422)
  async list(
    @Query() q: ServiceListQueryDto,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ServiceListResult> {
    const result = await this.svc.list(q, lang, market);
    setPublicCache(res, 60);
    return result;
  }

  @Get('types')
  @Public()
  @ApiLocale()
  @ApiDataListResponse(ServiceTypeCountDto)
  async types(
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    setPublicCache(res, 300);
    return listOf(await this.svc.types(lang, market));
  }

  @Get(':slug')
  @Public()
  @ApiLocale()
  @ApiDataResponse(ServiceProviderDetailDto)
  @ApiErrorResponses(404)
  async detail(
    @Param('slug') slug: string,
    @Query() q: ServiceDetailQueryDto,
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ) {
    const point =
      q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : undefined;
    const data = await this.svc.detail(slug, lang, point);
    setPublicCache(res, 60);
    return ok(data);
  }
}

@ApiTags('admin-services')
@ApiErrorResponses(401, 403)
@Controller('admin/services')
export class AdminServicesController {
  constructor(private readonly svc: ServicesAdminService) {}

  @Get()
  @RequireAnyPermission('directory.write', 'directory.verify', 'ads.manage')
  @ApiPaginatedResponse(AdminProviderViewDto)
  async list(@Query() q: AdminProviderQueryDto, @Res({ passthrough: true }) res: Response) {
    setNoStore(res);
    return this.svc.list(q);
  }

  @Get(':id')
  @RequireAnyPermission('directory.write', 'directory.verify', 'ads.manage')
  @ApiDataResponse(AdminProviderViewDto)
  @ApiErrorResponses(404)
  async get(@Param('id', UuidParamPipe) id: string, @Res({ passthrough: true }) res: Response) {
    setNoStore(res);
    return ok(await this.svc.get(id));
  }

  @Post()
  @RequirePermissions('directory.write')
  @Audit({ action: 'services.create', entityType: 'service_provider' })
  @ApiOperation({ summary: 'Create (draft). Sponsorship fields need ads.manage.' })
  @ApiDataResponse(AdminProviderViewDto)
  @ApiErrorResponses(403, 409, 422)
  async create(@Body() dto: CreateProviderDto, @CurrentUser() user: AuthUser) {
    return ok(await this.svc.create(dto, user));
  }

  @Patch(':id')
  @RequireAnyPermission('directory.write', 'ads.manage')
  @Audit({ action: 'services.update', entityType: 'service_provider' })
  @ApiOperation({ summary: 'Update. Changing contact data clears the verification.' })
  @ApiDataResponse(AdminProviderViewDto)
  @ApiErrorResponses(403, 404, 409, 422)
  async update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateProviderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return ok(await this.svc.update(id, dto, user));
  }

  @Delete(':id')
  @RequirePermissions('directory.write')
  @Audit({ action: 'services.delete', entityType: 'service_provider' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  async remove(@Param('id', UuidParamPipe) id: string): Promise<void> {
    await this.svc.remove(id);
  }

  @Post(':id/publish')
  @RequirePermissions('directory.write')
  @Audit({ action: 'services.publish', entityType: 'service_provider' })
  @HttpCode(HttpStatus.OK)
  @ApiDataResponse(AdminProviderViewDto)
  @ApiErrorResponses(404, 409, 422)
  async publish(@Param('id', UuidParamPipe) id: string) {
    return ok(await this.svc.setStatus(id, 'publish'));
  }

  @Post(':id/unpublish')
  @RequirePermissions('directory.write')
  @Audit({ action: 'services.unpublish', entityType: 'service_provider' })
  @HttpCode(HttpStatus.OK)
  @ApiDataResponse(AdminProviderViewDto)
  @ApiErrorResponses(404, 409)
  async unpublish(@Param('id', UuidParamPipe) id: string) {
    return ok(await this.svc.setStatus(id, 'unpublish'));
  }

  @Post(':id/archive')
  @RequirePermissions('directory.write')
  @Audit({ action: 'services.archive', entityType: 'service_provider' })
  @HttpCode(HttpStatus.OK)
  @ApiDataResponse(AdminProviderViewDto)
  @ApiErrorResponses(404, 409)
  async archive(@Param('id', UuidParamPipe) id: string) {
    return ok(await this.svc.setStatus(id, 'archive'));
  }

  @Post(':id/verify-contact')
  @RequirePermissions('directory.verify')
  @Audit({ action: 'services.verify_contact', entityType: 'service_provider' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record that the contact data was verified now (note: how)' })
  @ApiDataResponse(AdminProviderViewDto)
  @ApiErrorResponses(404, 422)
  async verify(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: VerifyContactDto,
    @CurrentUser() user: AuthUser,
  ) {
    return ok(await this.svc.verify(id, dto, user));
  }

  @Delete(':id/verify-contact')
  @RequirePermissions('directory.verify')
  @Audit({ action: 'services.unverify_contact', entityType: 'service_provider' })
  @HttpCode(HttpStatus.OK)
  @ApiDataResponse(AdminProviderViewDto)
  @ApiErrorResponses(404)
  async unverify(@Param('id', UuidParamPipe) id: string) {
    return ok(await this.svc.unverify(id));
  }
}
