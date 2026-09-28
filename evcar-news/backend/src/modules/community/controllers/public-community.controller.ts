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
  Req,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { SupportedLanguage } from '../../../config/app-config';
import { PaginationQueryDto } from '../../../common/http/pagination';
import {
  listOf,
  ok,
  type DataResponse,
  type PaginatedResponse,
} from '../../../common/http/responses';
import { ApiLocale, Lang, Market } from '../../../common/i18n/request-locale';
import {
  ApiDataListResponse,
  ApiDataResponse,
  ApiErrorResponses,
  ApiPaginatedResponse,
} from '../../../common/swagger/api-responses';
import { RateLimit } from '../../../common/throttle/rate-limit.decorator';
import { ApiAccessToken, CurrentUser, Public, type AuthUser } from '../../auth';
import { UuidParamPipe } from '../../system/uuid-param.pipe';
import {
  AcceptAnswerDto,
  AnswerDto,
  CommentDto,
  CommentListQueryDto,
  ContentReportDto,
  CreateAnswerDto,
  CreateCommentDto,
  CreateContentReportDto,
  CreateQuestionDto,
  CreateReviewDto,
  QuestionDetailDto,
  QuestionDto,
  QuestionListQueryDto,
  ReportReasonDto,
  ReviewDto,
  ReviewListQueryDto,
  ReviewSummaryDto,
  ReviewSummaryQueryDto,
  UpdateCommentDto,
  UpdateQuestionDto,
  UpdateReviewDto,
  VoteDto,
  VoteResultDto,
} from '../dto/community.dto';
import { CommentsService } from '../services/comments.service';
import { CommunityViewerService } from '../services/community-viewer.service';
import { QuestionsService } from '../services/questions.service';
import { ReviewsService } from '../services/reviews.service';
import { VotesReportsService } from '../services/votes-reports.service';

/**
 * Guests get a short shared cache; signed-in viewers get personal data
 * (own votes, muted users, own pending items) → never cached by proxies.
 */
function cacheFor(res: Response, user: AuthUser | undefined, maxAge = 30): void {
  if (user) {
    res.setHeader('Cache-Control', 'private, no-store');
  } else {
    res.setHeader(
      'Cache-Control',
      `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 4}`,
    );
  }
  res.setHeader('Vary', 'Accept-Language, X-Market, Authorization');
}

const POST_ERRORS = [401, 403, 404, 409, 422, 429];

@ApiTags('community')
@Controller('community')
export class CommunityController {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly votesReports: VotesReportsService,
    private readonly viewers: CommunityViewerService,
  ) {}

  @Get('reviews')
  @Public()
  @ApiLocale()
  @ApiOperation({
    summary:
      'Approved owner reviews of a variant or a station (exactly one of variantId / stationId)',
    description:
      'Hidden / pending / deleted reviews and reviews of users the caller muted are never listed. `verifiedOwner` is true only with an approved, unexpired ownership verification.',
  })
  @ApiPaginatedResponse(ReviewDto)
  @ApiErrorResponses(404, 422)
  async listReviews(
    @Query() q: ReviewListQueryDto,
    @Lang() lang: SupportedLanguage,
    @CurrentUser() user: AuthUser | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<ReviewDto>> {
    cacheFor(res, user);
    return this.reviews.list(q, await this.viewers.viewer(user), lang);
  }

  @Get('reviews/summary')
  @Public()
  @ApiLocale()
  @ApiOperation({
    summary:
      'Rating summary (count, average, distribution, dimension averages); averages are null without reviews',
  })
  @ApiDataResponse(ReviewSummaryDto)
  @ApiErrorResponses(404, 422)
  async summary(
    @Query() q: ReviewSummaryQueryDto,
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<ReviewSummaryDto>> {
    cacheFor(res, undefined, 60);
    return ok(await this.reviews.summary(q, lang));
  }

  @Get('reviews/:id')
  @Public()
  @ApiLocale()
  @ApiOperation({ summary: 'One review (authors also see their own pending / hidden review)' })
  @ApiDataResponse(ReviewDto)
  @ApiErrorResponses(404)
  async getReview(
    @Param('id', UuidParamPipe) id: string,
    @Lang() lang: SupportedLanguage,
    @CurrentUser() user: AuthUser | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<ReviewDto>> {
    cacheFor(res, user);
    return ok(await this.reviews.get(id, await this.viewers.viewer(user), lang));
  }

  @Post('reviews')
  @RateLimit('comments')
  @ApiAccessToken()
  @ApiOperation({
    summary: 'Writes an owner review (one per user and variant / station; waits for moderation)',
    description:
      '403 EMAIL_NOT_VERIFIED / COMMUNITY_USER_BLOCKED; 409 COMMUNITY_REVIEW_EXISTS / COMMUNITY_DUPLICATE_CONTENT; 422 too many links; 429 COMMUNITY_RATE_LIMITED. The verified-owner badge is attached automatically when the author has an approved ownership verification of the variant.',
  })
  @ApiBody({ type: CreateReviewDto })
  @ApiDataResponse(ReviewDto)
  @ApiErrorResponses(...POST_ERRORS)
  async createReview(
    @Body() dto: CreateReviewDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Req() req: Request,
  ): Promise<DataResponse<ReviewDto>> {
    return ok(await this.reviews.create(dto, user, req.ip, lang, market));
  }

  @Patch('reviews/:id')
  @RateLimit('comments')
  @ApiAccessToken()
  @ApiOperation({ summary: 'Edits my review (goes back to moderation)' })
  @ApiBody({ type: UpdateReviewDto })
  @ApiDataResponse(ReviewDto)
  @ApiErrorResponses(...POST_ERRORS)
  async updateReview(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateReviewDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
    @Req() req: Request,
  ): Promise<DataResponse<ReviewDto>> {
    return ok(await this.reviews.update(id, dto, user, req.ip, lang));
  }

  @Delete('reviews/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAccessToken()
  @ApiOperation({ summary: 'Deletes my review' })
  @ApiNoContentResponse()
  @ApiErrorResponses(401, 403, 404)
  async deleteReview(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.reviews.remove(id, user);
  }

  @Post('votes')
  @HttpCode(HttpStatus.OK)
  @RateLimit('write')
  @ApiAccessToken()
  @ApiOperation({
    summary:
      'Helpful / not helpful vote on a review, comment, question or answer (value 0 removes it)',
  })
  @ApiBody({ type: VoteDto })
  @ApiDataResponse(VoteResultDto)
  @ApiErrorResponses(401, 403, 404, 422, 429)
  async vote(
    @Body() dto: VoteDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<DataResponse<VoteResultDto>> {
    return ok(await this.votesReports.vote(dto, user, req.ip));
  }

  @Get('report-reasons')
  @Public()
  @ApiLocale()
  @ApiOperation({ summary: 'Reasons for reporting community content (labels from the database)' })
  @ApiDataListResponse(ReportReasonDto)
  async reasons(
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<ReportReasonDto>> {
    cacheFor(res, undefined, 300);
    return listOf(await this.votesReports.reasons(lang));
  }

  @Post('reports')
  @RateLimit('reports')
  @ApiAccessToken()
  @ApiOperation({
    summary:
      'Reports a review, comment, question, answer or user (spam / abuse …) to the moderators',
    description:
      '409 COMMUNITY_REPORT_DUPLICATE when the caller already has an open report on the target. Content with 3+ distinct open reports goes back to the review queue until a moderator decides.',
  })
  @ApiBody({ type: CreateContentReportDto })
  @ApiDataResponse(ContentReportDto)
  @ApiErrorResponses(...POST_ERRORS)
  async report(
    @Body() dto: CreateContentReportDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
    @Req() req: Request,
  ): Promise<DataResponse<ContentReportDto>> {
    return ok(await this.votesReports.report(dto, user, req.ip, lang));
  }
}

@ApiTags('community')
@Controller('comments')
export class CommentsController {
  constructor(
    private readonly comments: CommentsService,
    private readonly viewers: CommunityViewerService,
  ) {}

  @Get()
  @Public()
  @ApiLocale()
  @ApiOperation({
    summary:
      'Visible top-level comments of an article, review, car model or variant (+ first replies)',
  })
  @ApiPaginatedResponse(CommentDto)
  @ApiErrorResponses(422)
  async list(
    @Query() q: CommentListQueryDto,
    @Lang() lang: SupportedLanguage,
    @CurrentUser() user: AuthUser | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<CommentDto>> {
    cacheFor(res, user, 15);
    return this.comments.list(q, await this.viewers.viewer(user), lang);
  }

  @Get(':id')
  @Public()
  @ApiLocale()
  @ApiDataResponse(CommentDto)
  @ApiErrorResponses(404)
  async get(
    @Param('id', UuidParamPipe) id: string,
    @Lang() lang: SupportedLanguage,
    @CurrentUser() user: AuthUser | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<CommentDto>> {
    cacheFor(res, user, 15);
    return ok(await this.comments.get(id, await this.viewers.viewer(user), lang));
  }

  @Get(':id/replies')
  @Public()
  @ApiLocale()
  @ApiOperation({ summary: 'Visible replies of a comment, oldest first' })
  @ApiPaginatedResponse(CommentDto)
  @ApiErrorResponses(404)
  async replies(
    @Param('id', UuidParamPipe) id: string,
    @Query() q: PaginationQueryDto,
    @Lang() lang: SupportedLanguage,
    @CurrentUser() user: AuthUser | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<CommentDto>> {
    cacheFor(res, user, 15);
    return this.comments.replies(id, q, await this.viewers.viewer(user), lang);
  }

  @Post()
  @RateLimit('comments')
  @ApiAccessToken()
  @ApiOperation({
    summary: 'Writes a comment or a reply (published at once unless held by the anti-spam rules)',
    description:
      'status = pending when held (links, new account, text also posted by others). 409 COMMUNITY_COMMENTS_CLOSED for articles with comments off.',
  })
  @ApiBody({ type: CreateCommentDto })
  @ApiDataResponse(CommentDto)
  @ApiErrorResponses(...POST_ERRORS)
  async create(
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
    @Req() req: Request,
  ): Promise<DataResponse<CommentDto>> {
    return ok(await this.comments.create(dto, user, req.ip, lang));
  }

  @Patch(':id')
  @RateLimit('comments')
  @ApiAccessToken()
  @ApiBody({ type: UpdateCommentDto })
  @ApiDataResponse(CommentDto)
  @ApiErrorResponses(...POST_ERRORS)
  async update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateCommentDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
    @Req() req: Request,
  ): Promise<DataResponse<CommentDto>> {
    return ok(await this.comments.update(id, dto, user, req.ip, lang));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAccessToken()
  @ApiNoContentResponse()
  @ApiErrorResponses(401, 403, 404)
  async remove(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.comments.remove(id, user);
  }
}

@ApiTags('community')
@Controller('questions')
export class QuestionsController {
  constructor(
    private readonly questions: QuestionsService,
    private readonly viewers: CommunityViewerService,
  ) {}

  @Get()
  @Public()
  @ApiLocale()
  @ApiOperation({ summary: 'Visible questions (optionally about a car model, variant or station)' })
  @ApiPaginatedResponse(QuestionDto)
  @ApiErrorResponses(422)
  async list(
    @Query() q: QuestionListQueryDto,
    @Lang() lang: SupportedLanguage,
    @CurrentUser() user: AuthUser | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<QuestionDto>> {
    cacheFor(res, user);
    return this.questions.list(q, await this.viewers.viewer(user), lang);
  }

  @Get(':id')
  @Public()
  @ApiLocale()
  @ApiOperation({ summary: 'One question with its accepted answer' })
  @ApiDataResponse(QuestionDetailDto)
  @ApiErrorResponses(404)
  async get(
    @Param('id', UuidParamPipe) id: string,
    @Lang() lang: SupportedLanguage,
    @CurrentUser() user: AuthUser | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<QuestionDetailDto>> {
    cacheFor(res, user);
    return ok(await this.questions.get(id, await this.viewers.viewer(user), lang));
  }

  @Get(':id/answers')
  @Public()
  @ApiLocale()
  @ApiOperation({ summary: 'Visible answers, most helpful first' })
  @ApiPaginatedResponse(AnswerDto)
  @ApiErrorResponses(404)
  async answers(
    @Param('id', UuidParamPipe) id: string,
    @Query() q: PaginationQueryDto,
    @Lang() lang: SupportedLanguage,
    @CurrentUser() user: AuthUser | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<AnswerDto>> {
    cacheFor(res, user);
    return this.questions.answers(id, q, await this.viewers.viewer(user), lang);
  }

  @Post()
  @RateLimit('comments')
  @ApiAccessToken()
  @ApiOperation({ summary: 'Asks a question (general, or about a car model / variant / station)' })
  @ApiBody({ type: CreateQuestionDto })
  @ApiDataResponse(QuestionDetailDto)
  @ApiErrorResponses(...POST_ERRORS)
  async create(
    @Body() dto: CreateQuestionDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
    @Market() market: string,
    @Req() req: Request,
  ): Promise<DataResponse<QuestionDetailDto>> {
    return ok(await this.questions.create(dto, user, req.ip, lang, market));
  }

  @Patch(':id')
  @RateLimit('comments')
  @ApiAccessToken()
  @ApiBody({ type: UpdateQuestionDto })
  @ApiDataResponse(QuestionDetailDto)
  @ApiErrorResponses(...POST_ERRORS)
  async update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateQuestionDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
    @Req() req: Request,
  ): Promise<DataResponse<QuestionDetailDto>> {
    return ok(await this.questions.update(id, dto, user, req.ip, lang));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAccessToken()
  @ApiNoContentResponse()
  @ApiErrorResponses(401, 403, 404)
  async remove(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.questions.remove(id, user);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiAccessToken()
  @ApiOperation({ summary: 'The asker accepts one answer (answerId null clears it)' })
  @ApiBody({ type: AcceptAnswerDto })
  @ApiDataResponse(QuestionDetailDto)
  @ApiErrorResponses(401, 403, 404, 422)
  async accept(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: AcceptAnswerDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<QuestionDetailDto>> {
    return ok(await this.questions.accept(id, dto, user, lang));
  }

  @Post(':id/answers')
  @RateLimit('comments')
  @ApiAccessToken()
  @ApiOperation({ summary: 'Answers a visible question' })
  @ApiBody({ type: CreateAnswerDto })
  @ApiDataResponse(AnswerDto)
  @ApiErrorResponses(...POST_ERRORS)
  async answer(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: CreateAnswerDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
    @Req() req: Request,
  ): Promise<DataResponse<AnswerDto>> {
    return ok(await this.questions.createAnswer(id, dto, user, req.ip, lang));
  }
}

@ApiTags('community')
@ApiAccessToken()
@Controller('answers')
export class AnswersController {
  constructor(private readonly questions: QuestionsService) {}

  @Patch(':id')
  @RateLimit('comments')
  @ApiBody({ type: CreateAnswerDto })
  @ApiDataResponse(AnswerDto)
  @ApiErrorResponses(...POST_ERRORS)
  async update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: CreateAnswerDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
    @Req() req: Request,
  ): Promise<DataResponse<AnswerDto>> {
    return ok(await this.questions.updateAnswer(id, dto, user, req.ip, lang));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiErrorResponses(401, 403, 404)
  async remove(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.questions.removeAnswer(id, user);
  }
}
