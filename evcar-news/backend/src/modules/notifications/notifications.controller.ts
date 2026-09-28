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
import { listOf, ok, type DataResponse, type PaginatedResponse } from '../../common/http/responses';
import { ApiLocale, Lang } from '../../common/i18n/request-locale';
import {
  ApiDataListResponse,
  ApiDataResponse,
  ApiErrorResponses,
  ApiPaginatedResponse,
} from '../../common/swagger/api-responses';
import { RateLimit } from '../../common/throttle/rate-limit.decorator';
import { NoStore } from '../auth/auth-http';
import { ApiAccessToken, CurrentUser, type AuthUser } from '../auth';
import { UuidParamPipe } from '../system/uuid-param.pipe';
import { NotificationCenterService, type NotificationView } from './notification-center.service';
import {
  CreateSubscriptionDto,
  DeviceDto,
  ListNotificationsQueryDto,
  NotificationDto,
  PreferencesDto,
  RegisterDeviceDto,
  SubscriptionDto,
  UnregisterDeviceDto,
  UpdatePreferencesDto,
} from './notifications.dto';

@ApiTags('me: notifications')
@ApiAccessToken()
@ApiErrorResponses(401)
@Controller('me')
export class NotificationsController {
  constructor(private readonly center: NotificationCenterService) {}

  // ---- center -----------------------------------------------------------------------------

  @Get('notifications')
  @NoStore()
  @ApiOperation({ summary: 'In-app notification center (newest first)' })
  @ApiPaginatedResponse(NotificationDto)
  list(
    @CurrentUser() user: AuthUser,
    @Query() q: ListNotificationsQueryDto,
  ): Promise<PaginatedResponse<NotificationView>> {
    return this.center.list(user.id, q);
  }

  @Get('notifications/unread-count')
  @NoStore()
  async unreadCount(@CurrentUser() user: AuthUser): Promise<DataResponse<{ count: number }>> {
    return ok({ count: await this.center.unreadCount(user.id) });
  }

  @Post('notifications/read-all')
  @HttpCode(HttpStatus.OK)
  async readAll(@CurrentUser() user: AuthUser): Promise<DataResponse<{ updated: number }>> {
    return ok({ updated: await this.center.readAll(user.id) });
  }

  @Post('notifications/:id/read')
  @HttpCode(HttpStatus.OK)
  @ApiDataResponse(NotificationDto)
  @ApiErrorResponses(404)
  async read(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<DataResponse<NotificationView>> {
    return ok(await this.center.setRead(user.id, id, true));
  }

  @Post('notifications/:id/unread')
  @HttpCode(HttpStatus.OK)
  @ApiDataResponse(NotificationDto)
  @ApiErrorResponses(404)
  async unread(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<DataResponse<NotificationView>> {
    return ok(await this.center.setRead(user.id, id, false));
  }

  @Delete('notifications/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<void> {
    await this.center.remove(user.id, id);
  }

  // ---- preferences ---------------------------------------------------------------------------

  @Get('notification-preferences')
  @NoStore()
  @ApiOperation({ summary: 'Types, channels, quiet hours, unsubscribe-all and push status' })
  @ApiDataResponse(PreferencesDto)
  async preferences(@CurrentUser() user: AuthUser): Promise<DataResponse<unknown>> {
    return ok(await this.center.preferences(user.id));
  }

  @Patch('notification-preferences')
  @RateLimit('write')
  @ApiDataResponse(PreferencesDto)
  @ApiErrorResponses(422)
  async updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePreferencesDto,
  ): Promise<DataResponse<unknown>> {
    return ok(await this.center.updatePreferences(user.id, dto));
  }

  // ---- subscriptions -------------------------------------------------------------------------

  @Get('notification-subscriptions')
  @NoStore()
  @ApiLocale()
  @ApiDataListResponse(SubscriptionDto)
  async subscriptions(
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
  ): Promise<PaginatedResponse<unknown>> {
    return listOf(await this.center.subscriptions(user.id, lang));
  }

  @Post('notification-subscriptions')
  @RateLimit('write')
  @ApiLocale()
  @ApiOperation({
    summary:
      'Follow a brand / model / trim / category / market / station / price (idempotent: 200 when it exists)',
  })
  @ApiDataResponse(SubscriptionDto)
  @ApiErrorResponses(422)
  async subscribe(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSubscriptionDto,
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<unknown>> {
    const { created, view } = await this.center.subscribe(user.id, dto, lang);
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return ok(view);
  }

  @Delete('notification-subscriptions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  async unsubscribe(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<void> {
    await this.center.unsubscribe(user.id, id);
  }

  // ---- devices -----------------------------------------------------------------------------

  @Get('devices')
  @NoStore()
  @ApiDataListResponse(DeviceDto)
  async devices(@CurrentUser() user: AuthUser): Promise<PaginatedResponse<unknown>> {
    return listOf(await this.center.devices(user.id));
  }

  @Post('devices')
  @HttpCode(HttpStatus.OK)
  @RateLimit('write')
  @ApiOperation({ summary: 'Register / refresh this installation’s push token' })
  @ApiDataResponse(DeviceDto)
  @ApiErrorResponses(422)
  async register(
    @CurrentUser() user: AuthUser,
    @Body() dto: RegisterDeviceDto,
  ): Promise<DataResponse<unknown>> {
    return ok(await this.center.registerDevice(user.id, dto));
  }

  @Post('devices/unregister')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a push token (idempotent; call before sign-out)' })
  @ApiNoContentResponse()
  async unregister(@CurrentUser() user: AuthUser, @Body() dto: UnregisterDeviceDto): Promise<void> {
    await this.center.unregisterToken(user.id, dto.token);
  }

  @Delete('devices/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  async removeDevice(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<void> {
    await this.center.removeDevice(user.id, id);
  }
}
