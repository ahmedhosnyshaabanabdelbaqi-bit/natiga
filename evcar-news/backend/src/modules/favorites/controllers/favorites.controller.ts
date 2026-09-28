import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { SupportedLanguage } from '../../../config/app-config';
import { listOf, ok, type DataResponse } from '../../../common/http/responses';
import { ApiLocale, Lang } from '../../../common/i18n/request-locale';
import {
  ApiDataListResponse,
  ApiDataResponse,
  ApiErrorResponses,
  ApiPaginatedResponse,
} from '../../../common/swagger/api-responses';
import { RateLimit } from '../../../common/throttle/rate-limit.decorator';
import { FavoriteTargetType } from '../../../generated/prisma/enums';
import { ApiAccessToken, CurrentUser, type AuthUser } from '../../auth';
import { UuidParamPipe } from '../../system';
import { fieldError, setNoStore } from '../../search/common/discovery-http';
import {
  FavoriteKeyDto,
  FavoriteListQueryDto,
  FavoriteViewDto,
  MergeFavoritesDto,
  MergeResultDto,
} from '../dto/favorites.dto';
import { FavoritesService } from '../services/favorites.service';

const typePipe = new ParseEnumPipe(FavoriteTargetType, {
  exceptionFactory: () =>
    fieldError('type', 'isIn', {
      ar: 'نوع غير صالح (article, model, variant, station, comparison, tour).',
      en: 'Invalid type (article, model, variant, station, comparison, tour).',
    }),
});

@ApiTags('me-favorites')
@ApiAccessToken()
@ApiErrorResponses(401)
@Controller('me/favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  @ApiLocale()
  @ApiOperation({ summary: 'My favorites, newest first' })
  @ApiPaginatedResponse(FavoriteViewDto)
  async list(
    @CurrentUser() user: AuthUser,
    @Query() q: FavoriteListQueryDto,
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ) {
    setNoStore(res);
    return this.favorites.list(user.id, q, lang);
  }

  @Get('keys')
  @ApiOperation({ summary: 'Every favorite key (type + id) for heart states (≤ 1000)' })
  @ApiDataListResponse(FavoriteKeyDto)
  async keys(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    setNoStore(res);
    return listOf(await this.favorites.keys(user.id));
  }

  @Post('merge')
  @RateLimit('write')
  @HttpCode(HttpStatus.OK)
  @ApiLocale()
  @ApiOperation({ summary: 'Merge guest (device) favorites into the account after sign-in' })
  @ApiDataResponse(MergeResultDto)
  @ApiErrorResponses(422, 429)
  async merge(
    @CurrentUser() user: AuthUser,
    @Body() dto: MergeFavoritesDto,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<MergeResultDto>> {
    return ok(await this.favorites.merge(user.id, dto, lang));
  }

  @Put(':type/:id')
  @RateLimit('write')
  @ApiLocale()
  @ApiOperation({ summary: 'Add (idempotent): 201 created, 200 already saved' })
  @ApiDataResponse(FavoriteViewDto)
  @ApiErrorResponses(404, 409, 422, 429)
  async add(
    @CurrentUser() user: AuthUser,
    @Param('type', typePipe) type: FavoriteTargetType,
    @Param('id', UuidParamPipe) id: string,
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<FavoriteViewDto>> {
    const { created, view } = await this.favorites.add(user.id, type, id.toLowerCase(), lang);
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return ok(view);
  }

  @Delete(':type/:id')
  @RateLimit('write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Removed (or was not saved)' })
  @ApiErrorResponses(422, 429)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('type', typePipe) type: FavoriteTargetType,
    @Param('id', UuidParamPipe) id: string,
  ): Promise<void> {
    await this.favorites.remove(user.id, type, id.toLowerCase());
  }
}
