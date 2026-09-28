import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  type PipeTransform,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { SupportedLanguage } from '../../../config/app-config';
import { ok } from '../../../common/http/responses';
import { Lang } from '../../../common/i18n/request-locale';
import { ApiErrorResponses } from '../../../common/swagger/api-responses';
import { Audit } from '../../audit';
import { CurrentUser } from '../../auth';
import { RequireAnyPermission, RequirePermissions } from '../../rbac';
import { UuidParamPipe } from '../../system/uuid-param.pipe';
import { CommunityErrors } from '../common/community-errors';
import {
  AdminBlockListQueryDto,
  AdminContentListQueryDto,
  AdminReportListQueryDto,
  AdminVerificationListQueryDto,
  ApproveVerificationDto,
  BlockUserDto,
  DecisionNoteDto,
  ModerateDto,
  UnblockUserDto,
  UpdateContentReportDto,
  WarnUserDto,
} from '../dto/admin.dto';
import type { ContentType } from '../dto/community.dto';
import { ModerationService } from '../services/moderation.service';
import { OwnerVerificationsService } from '../services/owner-verifications.service';

const COLLECTIONS: Record<string, ContentType> = {
  reviews: 'review',
  comments: 'comment',
  questions: 'question',
  answers: 'answer',
};

/** `reviews | comments | questions | answers` → content type (404 otherwise). */
class ContentCollectionPipe implements PipeTransform<string, ContentType> {
  transform(value: string): ContentType {
    const t = COLLECTIONS[value];
    if (!t) throw CommunityErrors.notFound('collection');
    return t;
  }
}

const noStore = (res: Response) => res.setHeader('Cache-Control', 'no-store');

/**
 * Moderation API for community_moderator (and owner / admin):
 * read = community.read or community.moderate, writes = community.moderate,
 * ownership verifications = community.verify_owners. Every mutating request
 * is written to audit_logs; moderation decisions also to moderation_actions.
 */
@ApiTags('admin-community')
@ApiErrorResponses(401, 403)
@Controller('admin/community')
export class AdminCommunityController {
  constructor(
    private readonly moderation: ModerationService,
    private readonly verifications: OwnerVerificationsService,
  ) {}

  @Get('overview')
  @RequireAnyPermission('community.read', 'community.moderate')
  @ApiOperation({
    summary:
      'Queue sizes: pending items per type, open reports, pending verifications, active blocks',
  })
  async overview(@Res({ passthrough: true }) res: Response) {
    noStore(res);
    return ok(await this.moderation.overview());
  }

  // --- reports -----------------------------------------------------------------------------

  @Get('reports')
  @RequireAnyPermission('community.read', 'community.moderate')
  @ApiOperation({
    summary: 'Content reports queue (default: open + in_review), with a snapshot of each target',
  })
  async reports(
    @Query() q: AdminReportListQueryDto,
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    return this.moderation.listReports(q, lang);
  }

  @Patch('reports/:id')
  @RequirePermissions('community.moderate')
  @Audit({ entityType: 'content_report' })
  @ApiOperation({ summary: 'Sets a report status (in_review / resolved / rejected / open)' })
  @ApiErrorResponses(404, 409, 422)
  async updateReport(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateContentReportDto,
    @CurrentUser('id') userId: string,
    @Lang() lang: SupportedLanguage,
  ) {
    return ok(await this.moderation.updateReport(id, dto, userId, lang));
  }

  // --- users -------------------------------------------------------------------------------

  @Get('blocks')
  @RequireAnyPermission('community.read', 'community.moderate')
  @ApiOperation({ summary: 'User blocks (default: active only)' })
  async blocks(@Query() q: AdminBlockListQueryDto, @Res({ passthrough: true }) res: Response) {
    noStore(res);
    return this.moderation.listBlocks(q);
  }

  @Get('users/:userId')
  @RequireAnyPermission('community.read', 'community.moderate')
  @ApiOperation({
    summary: 'Community overview of a user: content per status, blocks, history, spam signals',
  })
  @ApiErrorResponses(404)
  async user(
    @Param('userId', UuidParamPipe) userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    return ok(await this.moderation.userOverview(userId));
  }

  @Post('users/:userId/block')
  @RequirePermissions('community.moderate')
  @Audit({ entityType: 'user_block', entityIdParam: 'userId' })
  @ApiOperation({
    summary:
      'Blocks ("bans") a user from the community, optionally until a date and hiding their posts',
  })
  @ApiBody({ type: BlockUserDto })
  @ApiErrorResponses(404, 409, 422)
  async block(
    @Param('userId', UuidParamPipe) userId: string,
    @Body() dto: BlockUserDto,
    @CurrentUser('id') moderatorId: string,
  ) {
    return ok(await this.moderation.block(userId, dto, moderatorId));
  }

  @Post('users/:userId/unblock')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('community.moderate')
  @Audit({ entityType: 'user_block', entityIdParam: 'userId' })
  @ApiBody({ type: UnblockUserDto })
  @ApiErrorResponses(404)
  async unblock(
    @Param('userId', UuidParamPipe) userId: string,
    @Body() dto: UnblockUserDto,
    @CurrentUser('id') moderatorId: string,
  ) {
    return ok(await this.moderation.unblock(userId, dto, moderatorId));
  }

  @Post('users/:userId/warn')
  @RequirePermissions('community.moderate')
  @Audit({ entityType: 'user', entityIdParam: 'userId' })
  @ApiOperation({ summary: 'Records a warning to a user (moderation history)' })
  @ApiBody({ type: WarnUserDto })
  @ApiErrorResponses(404)
  async warn(
    @Param('userId', UuidParamPipe) userId: string,
    @Body() dto: WarnUserDto,
    @CurrentUser('id') moderatorId: string,
  ) {
    return ok(await this.moderation.warn(userId, dto, moderatorId));
  }

  // --- ownership verifications ----------------------------------------------------------------

  @Get('owner-verifications')
  @RequirePermissions('community.verify_owners')
  @ApiOperation({ summary: 'Ownership verification requests (default: pending, oldest first)' })
  async verificationsList(
    @Query() q: AdminVerificationListQueryDto,
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    return this.verifications.list(q, lang);
  }

  @Get('owner-verifications/:id')
  @RequirePermissions('community.verify_owners')
  @ApiOperation({
    summary: 'One request with a short-lived signed URL of the private evidence file',
  })
  @ApiErrorResponses(404)
  async verification(
    @Param('id', UuidParamPipe) id: string,
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    return ok(await this.verifications.get(id, lang));
  }

  @Post('owner-verifications/:id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('community.verify_owners')
  @Audit({ entityType: 'owner_verification' })
  @ApiOperation({
    summary:
      'Approves: the verified-owner badge is attached to the user’s reviews of the trim; evidence deleted',
  })
  @ApiBody({ type: ApproveVerificationDto })
  @ApiErrorResponses(404, 409, 422)
  async approve(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: ApproveVerificationDto,
    @CurrentUser('id') staffId: string,
    @Lang() lang: SupportedLanguage,
  ) {
    return ok(await this.verifications.approve(id, dto, staffId, lang));
  }

  @Post('owner-verifications/:id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('community.verify_owners')
  @Audit({ entityType: 'owner_verification' })
  @ApiBody({ type: DecisionNoteDto })
  @ApiErrorResponses(404, 409, 422)
  async reject(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: DecisionNoteDto,
    @CurrentUser('id') staffId: string,
    @Lang() lang: SupportedLanguage,
  ) {
    return ok(await this.verifications.reject(id, dto, staffId, lang));
  }

  @Post('owner-verifications/:id/revoke')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('community.verify_owners')
  @Audit({ entityType: 'owner_verification' })
  @ApiOperation({ summary: 'Revokes an approved verification (badges removed)' })
  @ApiBody({ type: DecisionNoteDto })
  @ApiErrorResponses(404, 409, 422)
  async revoke(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: DecisionNoteDto,
    @CurrentUser('id') staffId: string,
    @Lang() lang: SupportedLanguage,
  ) {
    return ok(await this.verifications.revoke(id, dto, staffId, lang));
  }

  // --- content queues (keep after the static routes) ---------------------------------------

  @Get(':collection')
  @RequireAnyPermission('community.read', 'community.moderate')
  @ApiParam({ name: 'collection', enum: Object.keys(COLLECTIONS) })
  @ApiOperation({
    summary:
      'Moderation queue of one content type (default: pending), with open report counts and spam scores',
  })
  @ApiErrorResponses(404, 422)
  async list(
    @Param('collection', ContentCollectionPipe) type: ContentType,
    @Query() q: AdminContentListQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    return this.moderation.list(type, q);
  }

  @Get(':collection/:id')
  @RequireAnyPermission('community.read', 'community.moderate')
  @ApiParam({ name: 'collection', enum: Object.keys(COLLECTIONS) })
  @ApiOperation({ summary: 'One item with its reports, moderation history and spam signals' })
  @ApiErrorResponses(404)
  async detail(
    @Param('collection', ContentCollectionPipe) type: ContentType,
    @Param('id', UuidParamPipe) id: string,
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    return ok(await this.moderation.detail(type, id, lang));
  }

  @Post(':collection/:id/moderate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('community.moderate')
  @Audit({ entityType: 'community_content' })
  @ApiParam({ name: 'collection', enum: Object.keys(COLLECTIONS) })
  @ApiOperation({
    summary: 'approve / reject / hide / restore / delete (closes open reports on the item)',
  })
  @ApiBody({ type: ModerateDto })
  @ApiErrorResponses(404, 409, 422)
  async moderate(
    @Param('collection', ContentCollectionPipe) type: ContentType,
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: ModerateDto,
    @CurrentUser('id') moderatorId: string,
    @Lang() lang: SupportedLanguage,
  ) {
    return ok(await this.moderation.moderate(type, id, dto, moderatorId, lang));
  }
}
