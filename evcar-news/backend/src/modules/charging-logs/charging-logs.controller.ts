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
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SupportedLanguage } from '../../config/app-config';
import { ok, type DataResponse, type PaginatedResponse } from '../../common/http/responses';
import { ApiLocale, Lang } from '../../common/i18n/request-locale';
import {
  ApiDataResponse,
  ApiErrorResponses,
  ApiPaginatedResponse,
} from '../../common/swagger/api-responses';
import { RateLimit } from '../../common/throttle/rate-limit.decorator';
import { NoStore } from '../auth/auth-http';
import { ApiAccessToken, CurrentUser, type AuthUser } from '../auth';
import { UuidParamPipe } from '../system/uuid-param.pipe';
import {
  ChargingLogDto,
  ChargingLogPeriodDto,
  ChargingReportDto,
  CreateChargingLogDto,
  ListChargingLogsQueryDto,
  UpdateChargingLogDto,
} from './charging-logs.dto';
import { type ChargingLogView, ChargingLogsService } from './charging-logs.service';

@ApiTags('me: charging logs')
@ApiAccessToken()
@ApiLocale()
@ApiErrorResponses(401)
@Controller('me/charging-logs')
export class ChargingLogsController {
  constructor(private readonly logs: ChargingLogsService) {}

  @Get()
  @NoStore()
  @ApiOperation({ summary: 'My charging sessions (newest first)' })
  @ApiPaginatedResponse(ChargingLogDto)
  @ApiErrorResponses(422)
  list(
    @CurrentUser() user: AuthUser,
    @Query() q: ListChargingLogsQueryDto,
    @Lang() lang: SupportedLanguage,
  ): Promise<PaginatedResponse<ChargingLogView>> {
    return this.logs.list(user.id, q, lang);
  }

  @Get('report')
  @NoStore()
  @ApiOperation({
    summary: 'Spending / energy / consumption report from my logs only',
    description:
      'Figures the logs cannot support are null with status "insufficient_data" and a reason code.',
  })
  @ApiDataResponse(ChargingReportDto)
  @ApiErrorResponses(422)
  async report(
    @CurrentUser() user: AuthUser,
    @Query() q: ChargingLogPeriodDto,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<unknown>> {
    return ok(await this.logs.report(user.id, q, lang));
  }

  @Post()
  @RateLimit('write')
  @ApiDataResponse(ChargingLogDto)
  @ApiErrorResponses(422)
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateChargingLogDto,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<ChargingLogView>> {
    return ok(await this.logs.create(user.id, dto, lang));
  }

  @Get(':id')
  @NoStore()
  @ApiDataResponse(ChargingLogDto)
  @ApiErrorResponses(404)
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParamPipe) id: string,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<ChargingLogView>> {
    return ok(await this.logs.get(user.id, id, lang));
  }

  @Patch(':id')
  @RateLimit('write')
  @ApiDataResponse(ChargingLogDto)
  @ApiErrorResponses(404, 422)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateChargingLogDto,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<ChargingLogView>> {
    return ok(await this.logs.update(user.id, id, dto, lang));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<void> {
    await this.logs.remove(user.id, id);
  }
}
