import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { SupportedLanguage } from '../../../config/app-config';
import { PaginationQueryDto } from '../../../common/http/pagination';
import { ok, type DataResponse, type PaginatedResponse } from '../../../common/http/responses';
import { Lang } from '../../../common/i18n/request-locale';
import {
  ApiDataResponse,
  ApiErrorResponses,
  ApiPaginatedResponse,
} from '../../../common/swagger/api-responses';
import { RateLimit } from '../../../common/throttle/rate-limit.decorator';
import { ApiAccessToken, CurrentUser, type AuthUser } from '../../auth';
import { UuidParamPipe } from '../../system/uuid-param.pipe';
import {
  CommunityStatusDto,
  ContentReportDto,
  CreateOwnerVerificationDto,
  MutedUserDto,
  MyContentItemDto,
  MyContentQueryDto,
  OwnerVerificationDto,
} from '../dto/community.dto';
import { CommunityViewerService } from '../services/community-viewer.service';
import { MeCommunityService } from '../services/me-community.service';
import { OwnerVerificationsService } from '../services/owner-verifications.service';
import { VotesReportsService } from '../services/votes-reports.service';

@ApiTags('me')
@ApiAccessToken()
@ApiErrorResponses(401)
@Controller('me')
export class MeCommunityController {
  constructor(
    private readonly me: MeCommunityService,
    private readonly viewers: CommunityViewerService,
    private readonly reports: VotesReportsService,
    private readonly verifications: OwnerVerificationsService,
  ) {}

  @Get('community/status')
  @ApiOperation({
    summary: 'May I post? (verified e-mail, block with reason / end, new-account limits)',
  })
  @ApiDataResponse(CommunityStatusDto)
  async status(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<CommunityStatusDto>> {
    res.setHeader('Cache-Control', 'no-store');
    return ok(await this.me.status(user));
  }

  @Get('community/content')
  @ApiOperation({
    summary: 'My reviews / comments / questions / answers in every moderation state',
  })
  @ApiPaginatedResponse(MyContentItemDto)
  async content(
    @Query() q: MyContentQueryDto,
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<MyContentItemDto>> {
    res.setHeader('Cache-Control', 'no-store');
    return this.me.content(userId, q);
  }

  @Get('community/reports')
  @ApiOperation({ summary: 'My content reports and their status' })
  @ApiPaginatedResponse(ContentReportDto)
  async myReports(
    @Query() q: PaginationQueryDto,
    @CurrentUser('id') userId: string,
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<ContentReportDto>> {
    res.setHeader('Cache-Control', 'no-store');
    return this.reports.myReports(userId, q, lang);
  }

  @Get('mutes')
  @ApiOperation({ summary: 'Users I blocked (their community content is hidden for me)' })
  @ApiPaginatedResponse(MutedUserDto)
  async mutes(
    @Query() q: PaginationQueryDto,
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<MutedUserDto>> {
    res.setHeader('Cache-Control', 'no-store');
    return this.viewers.listMutes(userId, q);
  }

  @Put('mutes/:userId')
  @RateLimit('write')
  @ApiOperation({ summary: 'Blocks (mutes) a user for me; idempotent' })
  @ApiDataResponse(MutedUserDto)
  @ApiErrorResponses(404, 422)
  async mute(
    @Param('userId', UuidParamPipe) mutedUserId: string,
    @CurrentUser('id') userId: string,
  ): Promise<DataResponse<MutedUserDto>> {
    return ok(await this.viewers.mute(userId, mutedUserId));
  }

  @Delete('mutes/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unblocks (unmutes) a user; idempotent' })
  @ApiNoContentResponse()
  async unmute(
    @Param('userId', UuidParamPipe) mutedUserId: string,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    await this.viewers.unmute(userId, mutedUserId);
  }

  @Get('owner-verifications')
  @ApiOperation({ summary: 'My car ownership verification requests (verified owner badge)' })
  @ApiPaginatedResponse(OwnerVerificationDto)
  async myVerifications(
    @Query() q: PaginationQueryDto,
    @CurrentUser('id') userId: string,
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<OwnerVerificationDto>> {
    res.setHeader('Cache-Control', 'no-store');
    return this.verifications.mine(userId, q, lang);
  }

  @Post('owner-verifications')
  @RateLimit('reports')
  @ApiOperation({
    summary: 'Asks staff to verify that I own a trim (no badge until a moderator approves)',
    description:
      '409 OWNER_VERIFICATION_EXISTS when a pending / approved request exists for the trim. A document review can only be approved once a private evidence file (upload purpose owner_evidence) is attached.',
  })
  @ApiBody({ type: CreateOwnerVerificationDto })
  @ApiDataResponse(OwnerVerificationDto)
  @ApiErrorResponses(403, 409, 422, 429)
  async requestVerification(
    @Body() dto: CreateOwnerVerificationDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
  ): Promise<DataResponse<OwnerVerificationDto>> {
    return ok(await this.verifications.request(dto, user, lang));
  }

  @Delete('owner-verifications/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Withdraws my pending verification request (its evidence is deleted)' })
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 409)
  async withdraw(
    @Param('id', UuidParamPipe) id: string,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    await this.verifications.withdraw(id, userId);
  }
}
