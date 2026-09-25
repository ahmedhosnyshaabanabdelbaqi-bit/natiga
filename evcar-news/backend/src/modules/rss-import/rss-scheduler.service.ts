import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { RssFetchService } from './rss-fetch.service';

const BATCH = 5;
/** A claimed feed is not picked again by another instance for this long. */
const LEASE_MS = 10 * 60_000;

/**
 * Scheduled RSS fetching: active feeds whose next_fetch_at has passed (or
 * was never set). Each feed is claimed with a conditional update of
 * next_fetch_at (a lease), so several instances never fetch the same feed
 * at the same time; the fetch itself then sets the real next time
 * (interval, or exponential back-off after failures).
 */
@Injectable()
export class RssSchedulerService {
  private readonly logger = new Logger(RssSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fetcher: RssFetchService,
  ) {}

  async runDue(now: Date = new Date()): Promise<string[]> {
    const due = await this.prisma.rssFeed.findMany({
      where: { isActive: true, OR: [{ nextFetchAt: null }, { nextFetchAt: { lte: now } }] },
      select: { id: true, nextFetchAt: true },
      orderBy: { nextFetchAt: { sort: 'asc', nulls: 'first' } },
      take: BATCH,
    });
    const fetched: string[] = [];
    for (const feed of due) {
      const claimed = await this.prisma.rssFeed.updateMany({
        where: { id: feed.id, isActive: true, nextFetchAt: feed.nextFetchAt },
        data: { nextFetchAt: new Date(now.getTime() + LEASE_MS) },
      });
      if (claimed.count !== 1) continue;
      try {
        await this.fetcher.fetchFeed(feed.id, { trigger: 'scheduled' });
        fetched.push(feed.id);
      } catch (err) {
        this.logger.warn(`Scheduled fetch of feed ${feed.id} failed: ${(err as Error).message}`);
      }
    }
    return fetched;
  }
}

/** Runs runDue() every minute on instances with JOBS_ENABLED. */
@Injectable()
export class RssSchedulerTrigger {
  private readonly logger = new Logger(RssSchedulerTrigger.name);
  private running = false;

  constructor(private readonly scheduler: RssSchedulerService) {}

  @Interval('rss-fetch-due', 60_000)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.scheduler.runDue();
    } catch (err) {
      this.logger.warn(`RSS scheduling run failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
