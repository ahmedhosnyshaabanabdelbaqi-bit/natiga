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
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
  ApiExtraModels,
} from '@nestjs/swagger';
import type { SupportedLanguage } from '../../config/app-config';
import { listOf, ok, type DataResponse, type PaginatedResponse } from '../../common/http/responses';
import { ApiLocale, Lang } from '../../common/i18n/request-locale';
import {
  ApiDataListResponse,
  ApiDataResponse,
  ApiErrorResponses,
} from '../../common/swagger/api-responses';
import { RateLimit } from '../../common/throttle/rate-limit.decorator';
import { NoStore } from '../auth/auth-http';
import { ApiAccessToken, CurrentUser, type AuthUser } from '../auth';
import { UuidParamPipe } from '../system/uuid-param.pipe';
import {
  CompleteReminderDto,
  CreateReminderDto,
  ListRemindersQueryDto,
  ReminderDto,
  UpdateReminderDto,
} from './reminders.dto';
import { type ReminderView, RemindersService } from './reminders.service';

@ApiTags('me: reminders')
@ApiAccessToken()
@ApiLocale()
@ApiErrorResponses(401)
@Controller('me/reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get()
  @NoStore()
  @ApiOperation({ summary: 'My reminders (open: overdue → due soon → upcoming)' })
  @ApiDataListResponse(ReminderDto)
  async list(
    @CurrentUser() user: AuthUser,
    @Query() q: ListRemindersQueryDto,
    @Lang() lang: SupportedLanguage,
  ): Promise<PaginatedResponse<ReminderView>> {
    return listOf(await this.reminders.list(user.id, q, lang));
  }

  @Post()
  @RateLimit('write')
  @ApiDataResponse(ReminderDto)
  @ApiErrorResponses(409, 422)
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateReminderDto,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<ReminderView>> {
    return ok(await this.reminders.create(user.id, dto, lang));
  }

  @Get(':id')
  @NoStore()
  @ApiDataResponse(ReminderDto)
  @ApiErrorResponses(404)
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParamPipe) id: string,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<ReminderView>> {
    return ok(await this.reminders.get(user.id, id, lang));
  }

  @Patch(':id')
  @RateLimit('write')
  @ApiDataResponse(ReminderDto)
  @ApiErrorResponses(404, 422)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateReminderDto,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<ReminderView>> {
    return ok(await this.reminders.update(user.id, id, dto, lang));
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @RateLimit('write')
  @ApiOperation({ summary: 'Mark done; a repeating reminder creates its next occurrence' })
  @ApiExtraModels(ReminderDto)
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: {
            completed: { $ref: getSchemaPath(ReminderDto) },
            next: { nullable: true, allOf: [{ $ref: getSchemaPath(ReminderDto) }] },
          },
        },
      },
    },
  })
  @ApiErrorResponses(404, 409, 422)
  async complete(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: CompleteReminderDto,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<{ completed: ReminderView; next: ReminderView | null }>> {
    return ok(await this.reminders.complete(user.id, id, dto, lang));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<void> {
    await this.reminders.remove(user.id, id);
  }
}
