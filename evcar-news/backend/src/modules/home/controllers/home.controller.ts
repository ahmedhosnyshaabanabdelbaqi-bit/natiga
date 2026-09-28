import { Body, Controller, Get, Put, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { SupportedLanguage } from '../../../config/app-config';
import { ok, type DataResponse } from '../../../common/http/responses';
import { ApiLocale, Lang, Market } from '../../../common/i18n/request-locale';
import { ApiDataResponse, ApiErrorResponses } from '../../../common/swagger/api-responses';
import { RateLimit } from '../../../common/throttle/rate-limit.decorator';
import { ApiAccessToken, CurrentUser, Public, type AuthUser } from '../../auth';
import {
  fieldError,
  setNoStore,
  setPrivateRevalidate,
  setPublicCache,
} from '../../search/common/discovery-http';
import { HomeDto, HomeQueryDto, InterestsDto, UpdateInterestsDto } from '../dto/home.dto';
import { HomeService } from '../services/home.service';
import { InterestsService } from '../services/interests.service';

@ApiTags('home')
@Controller()
export class HomeController {
  constructor(
    private readonly home: HomeService,
    private readonly interests: InterestsService,
  ) {}

  @Get('home')
  @Public()
  @ApiLocale()
  @ApiOperation({
    summary: 'Home feed: sections in admin order (hidden ones listed in hiddenSections)',
    description:
      'Token optional (adds "for_you" when the user follows brands/models/categories). lat+lng enable nearby_stations (not stored); without them that section has state=location_required. Strong ETag: send If-None-Match → 304.',
  })
  @ApiDataResponse(HomeDto)
  @ApiErrorResponses(422)
  async get(
    @Query() q: HomeQueryDto,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @CurrentUser() user: AuthUser | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<HomeDto>> {
    if ((q.lat === undefined) !== (q.lng === undefined)) {
      throw fieldError(q.lat === undefined ? 'lat' : 'lng', 'bothOrNeither', {
        ar: 'أرسل خط العرض والطول معًا.',
        en: 'Send lat and lng together.',
      });
    }
    const point =
      q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : undefined;
    const data = await this.home.build({ lang, market, userId: user?.id, point });
    if (user || point) setPrivateRevalidate(res);
    else setPublicCache(res, 60);
    return ok(data);
  }

  @Get('me/interests')
  @ApiAccessToken()
  @ApiLocale()
  @ApiOperation({ summary: 'Followed brands / models / news categories (home personalization)' })
  @ApiDataResponse(InterestsDto)
  @ApiErrorResponses(401)
  async myInterests(
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<InterestsDto>> {
    setNoStore(res);
    return ok(await this.interests.get(user.id, lang));
  }

  @Put('me/interests')
  @ApiAccessToken()
  @ApiLocale()
  @RateLimit('write')
  @ApiOperation({ summary: 'Replace the followed sets (each ≤ 50)' })
  @ApiDataResponse(InterestsDto)
  @ApiErrorResponses(401, 422, 429)
  async setInterests(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateInterestsDto,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<InterestsDto>> {
    return ok(await this.interests.replace(user.id, dto, lang));
  }
}
