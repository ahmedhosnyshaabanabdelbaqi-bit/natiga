import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { SupportedLanguage } from '../../config/app-config';
import { ok, type DataResponse } from '../../common/http/responses';
import { ApiLocale, Lang, Market } from '../../common/i18n/request-locale';
import { ApiDataResponse, ApiErrorResponses } from '../../common/swagger/api-responses';
import { RateLimit } from '../../common/throttle/rate-limit.decorator';
import { Public } from '../auth';
import { RecommendationRequestDto, RecommendationResultDto } from './dto/recommendation.dto';
import { RecommendationsService } from './recommendations.service';

@ApiTags('recommendations')
@ApiLocale()
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.OK)
  @RateLimit('search')
  @ApiOperation({
    summary: 'Explainable car recommendation by budget, usage and home charging',
    description:
      'Ranks the trims listed in the market that fit the budget (current local price), seats and body type. Returns the visible weights (defaults derived from the answers, overridable), per-factor contributions (weight × position among the cars; the score is their sum), localized reasons, the missing / non-comparable data per car, and a decision that is NOT decisive when fewer than two cars have comparable data or the top scores are within 3 points. Ranges / consumption are compared on one test cycle only. Nothing is stored. Sponsorship never affects scoring (sponsored: false + disclosure).',
  })
  @ApiDataResponse(RecommendationResultDto)
  @ApiErrorResponses(422, 429)
  async recommend(
    @Body() dto: RecommendationRequestDto,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<RecommendationResultDto>> {
    res.setHeader('Cache-Control', 'no-store');
    return ok(await this.recommendations.recommend(dto, market, lang));
  }
}
