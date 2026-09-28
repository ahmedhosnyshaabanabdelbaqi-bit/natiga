import { Module } from '@nestjs/common';
import { COMMUNITY_CLOCK, systemClock } from './common/clock';
import { AdminCommunityController } from './controllers/admin-community.controller';
import { MeCommunityController } from './controllers/me-community.controller';
import {
  AnswersController,
  CommentsController,
  CommunityController,
  QuestionsController,
} from './controllers/public-community.controller';
import { CommentsService } from './services/comments.service';
import { CommunityGuardService } from './services/community-guard.service';
import { CommunityViewerService } from './services/community-viewer.service';
import { MeCommunityService } from './services/me-community.service';
import { ModerationService } from './services/moderation.service';
import { OwnerVerificationsService } from './services/owner-verifications.service';
import { QuestionsService } from './services/questions.service';
import { ReviewsService } from './services/reviews.service';
import { VotesReportsService } from './services/votes-reports.service';

/**
 * Community (REQUIREMENTS §15), see docs/decisions/backend-community.md:
 *   GET/POST/PATCH/DELETE /api/v1/community/reviews[/:id], GET /community/reviews/summary
 *   POST /api/v1/community/votes, POST /community/reports, GET /community/report-reasons
 *   /api/v1/comments[/:id[/replies]], /api/v1/questions[/:id[/answers|/accept]], /api/v1/answers/:id
 *   /api/v1/me/community/{status,content,reports}, /me/mutes[/:userId], /me/owner-verifications
 *   /api/v1/admin/community/{overview,reports,blocks,users/:id[/block|unblock|warn],
 *     owner-verifications[/:id/approve|reject|revoke],:collection[/:id[/moderate]]}
 */
@Module({
  controllers: [
    CommunityController,
    CommentsController,
    QuestionsController,
    AnswersController,
    MeCommunityController,
    AdminCommunityController,
  ],
  providers: [
    { provide: COMMUNITY_CLOCK, useValue: systemClock },
    CommunityGuardService,
    CommunityViewerService,
    ReviewsService,
    CommentsService,
    QuestionsService,
    VotesReportsService,
    ModerationService,
    OwnerVerificationsService,
    MeCommunityService,
  ],
  exports: [ReviewsService, CommunityGuardService],
})
export class CommunityModule {}
