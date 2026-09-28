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
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SupportedLanguage } from '../../config/app-config';
import { listOf, ok, type DataResponse, type PaginatedResponse } from '../../common/http/responses';
import { ApiLocale, Lang, Market } from '../../common/i18n/request-locale';
import {
  ApiDataListResponse,
  ApiDataResponse,
  ApiErrorResponses,
} from '../../common/swagger/api-responses';
import { RateLimit } from '../../common/throttle/rate-limit.decorator';
import { NoStore } from '../auth/auth-http';
import { ApiAccessToken, CurrentUser, type AuthUser } from '../auth';
import { UuidParamPipe } from '../system/uuid-param.pipe';
import { CreateUserVehicleDto, UpdateUserVehicleDto, UserVehicleDto } from './garage.dto';
import { GarageService, type UserVehicleView } from './garage.service';

/** "جراجي": the signed-in user's cars. */
@ApiTags('me: garage')
@ApiAccessToken()
@ApiLocale()
@ApiErrorResponses(401)
@Controller('me/vehicles')
export class GarageController {
  constructor(private readonly garage: GarageService) {}

  @Get()
  @NoStore()
  @ApiOperation({ summary: 'My cars (primary first)' })
  @ApiDataListResponse(UserVehicleDto)
  async list(
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
  ): Promise<PaginatedResponse<UserVehicleView>> {
    return listOf(await this.garage.list(user.id, lang));
  }

  @Post()
  @RateLimit('write')
  @ApiOperation({ summary: 'Add a car (trim + market + optional nickname / odometer)' })
  @ApiDataResponse(UserVehicleDto)
  @ApiErrorResponses(409, 422)
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateUserVehicleDto,
    @Market() market: string,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<UserVehicleView>> {
    return ok(await this.garage.create(user.id, dto, market, lang));
  }

  @Get(':id')
  @NoStore()
  @ApiDataResponse(UserVehicleDto)
  @ApiErrorResponses(404)
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParamPipe) id: string,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<UserVehicleView>> {
    return ok(await this.garage.get(user.id, id, lang));
  }

  @Patch(':id')
  @RateLimit('write')
  @ApiDataResponse(UserVehicleDto)
  @ApiErrorResponses(404, 422)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateUserVehicleDto,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<UserVehicleView>> {
    return ok(await this.garage.update(user.id, id, dto, lang));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a car (its charging logs and reminders are deleted too)' })
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<void> {
    await this.garage.remove(user.id, id);
  }
}
