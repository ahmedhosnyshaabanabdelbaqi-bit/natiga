import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SupportedLanguage } from '../../config/app-config';
import { ok, type DataResponse, type PaginatedResponse } from '../../common/http/responses';
import { ApiLocale, Lang, Market } from '../../common/i18n/request-locale';
import { ApiErrorResponses } from '../../common/swagger/api-responses';
import { RateLimit } from '../../common/throttle/rate-limit.decorator';
import { NoStore } from '../auth/auth-http';
import { ApiAccessToken, CurrentUser, Public, type AuthUser } from '../auth';
import { UuidParamPipe } from '../system/uuid-param.pipe';
import { ListTripsQueryDto, PlanTripDto } from './trips.dto';
import { TripsService } from './trips.service';

@ApiTags('trips')
@Controller()
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Post('trips/plan')
  @Public()
  @HttpCode(HttpStatus.OK)
  @RateLimit('search')
  @ApiLocale()
  @ApiOperation({
    summary:
      'Plan an EV trip (road route, charging stops with reserve + alternative, visible assumptions)',
    description:
      '503 INTEGRATION_NOT_CONFIGURED when no routing provider is configured (app-config features.tripPlanner is then false). 422 TRIP_VEHICLE_DATA_MISSING / TRIP_NO_REACHABLE_STATION when the data does not support a plan (never invented). Never guarantees arrival or a free connector. `save: true` (signed in) stores it under /me/trips. See docs/decisions/backend-personal.md §7.',
  })
  @ApiOkResponse({ description: '{ data: TripPlan }' })
  @ApiErrorResponses(422, 503)
  async plan(
    @Body() dto: PlanTripDto,
    @Market() market: string,
    @Lang() lang: SupportedLanguage,
    @CurrentUser() user?: AuthUser,
  ): Promise<DataResponse<unknown>> {
    return ok(await this.trips.plan(dto, user?.id, market, lang));
  }

  @Get('me/trips')
  @NoStore()
  @ApiAccessToken()
  @ApiOperation({ summary: 'My saved trip plans' })
  @ApiErrorResponses(401)
  list(
    @CurrentUser() user: AuthUser,
    @Query() q: ListTripsQueryDto,
  ): Promise<PaginatedResponse<unknown>> {
    return this.trips.list(user.id, q);
  }

  @Get('me/trips/:id')
  @NoStore()
  @ApiAccessToken()
  @ApiLocale()
  @ApiErrorResponses(401, 404)
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParamPipe) id: string,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<unknown>> {
    return ok(await this.trips.get(user.id, id, lang));
  }

  @Delete('me/trips/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAccessToken()
  @ApiNoContentResponse()
  @ApiErrorResponses(401, 404)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<void> {
    await this.trips.remove(user.id, id);
  }
}
