import { Module } from '@nestjs/common';
import { jobsEnabledProviders } from '../../jobs/queues';
import { ArticlesModule } from '../articles/articles.module';
import { AdminRssFeedsController, AdminRssItemsController } from './rss.controller';
import { RssFeedsService } from './rss-feeds.service';
import { RssFetchService } from './rss-fetch.service';
import { RssItemsService } from './rss-items.service';
import { RssSchedulerService, RssSchedulerTrigger } from './rss-scheduler.service';

/**
 * RSS/Atom import (REQUIREMENTS §5): feeds with licence modes, SSRF-safe
 * scheduled + manual fetching (NEWS_FETCHER), de-duplication, review queue
 * and "create draft" (never auto-published). Admin routes:
 *   /api/v1/admin/rss-feeds[/:id][/fetch]     rss.read / rss.manage
 *   /api/v1/admin/rss-items[/:id][/ignore|restore|create-draft]
 * Scheduled fetching runs on JOBS_ENABLED instances (RssSchedulerTrigger).
 */
@Module({
  imports: [ArticlesModule],
  controllers: [AdminRssFeedsController, AdminRssItemsController],
  providers: [
    RssFeedsService,
    RssFetchService,
    RssItemsService,
    RssSchedulerService,
    ...jobsEnabledProviders([RssSchedulerTrigger]),
  ],
  exports: [RssFetchService, RssSchedulerService],
})
export class RssImportModule {}
