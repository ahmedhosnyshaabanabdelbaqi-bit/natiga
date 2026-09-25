import { Module } from '@nestjs/common';
import { jobsEnabledProviders } from '../../jobs/queues';
import { AdminArticlesController } from './controllers/admin-articles.controller';
import { PublicArticlesController } from './controllers/public-articles.controller';
import { ArticleCorrectionsService } from './services/article-corrections.service';
import { ArticleMediaService } from './services/article-media.service';
import { ArticlePresenter } from './services/article-presenter.service';
import { ArticleRevisionsService } from './services/article-revisions.service';
import {
  ArticleSchedulerService,
  ArticleSchedulerTrigger,
} from './services/article-scheduler.service';
import { ArticleSearchIndexService } from './services/article-search-index.service';
import { ArticlesAdminService } from './services/articles-admin.service';
import { ArticlesPublicService } from './services/articles-public.service';

/**
 * News, reviews, test drives, guides (REQUIREMENTS §5):
 *   GET  /api/v1/articles, /articles/:slug, /articles/preview/:token, POST /articles/:slug/view
 *   /api/v1/admin/articles/...  CRUD, workflow, revisions, corrections, images, preview links
 * Scheduled articles are published by ArticleSchedulerTrigger (JOBS_ENABLED
 * instances only; ArticleSchedulerService.publishDue() is idempotent).
 * Events: `article.published` / `article.unpublished` ({articleId, slug, from, to}).
 * See docs/decisions/backend-articles.md.
 */
@Module({
  controllers: [PublicArticlesController, AdminArticlesController],
  providers: [
    ArticleMediaService,
    ArticlePresenter,
    ArticleSearchIndexService,
    ArticlesAdminService,
    ArticlesPublicService,
    ArticleRevisionsService,
    ArticleCorrectionsService,
    ArticleSchedulerService,
    ...jobsEnabledProviders([ArticleSchedulerTrigger]),
  ],
  exports: [
    ArticlesAdminService,
    ArticlesPublicService,
    ArticleMediaService,
    ArticlePresenter,
    ArticleSearchIndexService,
    ArticleSchedulerService,
  ],
})
export class ArticlesModule {}
