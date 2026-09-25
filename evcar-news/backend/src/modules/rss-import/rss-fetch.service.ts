import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { sanitizePlainText } from '../../common/sanitize/html-sanitizer';
import {
  ImportJobStatus,
  ImportRowStatus,
  Prisma,
  RssItemStatus,
  type RssFeed,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  describeProviderError,
  NEWS_FETCHER,
  type FeedItem,
  type NewsFetcher,
} from '../../providers';
import { contentError } from '../articles/common/content-errors';
import { ImportJobsService, type RowRecord } from '../system';
import { dedupeKeys, draftPolicy, normalizeLanguage, toLicenseMode } from './rss-dedupe';
import type { RssFetchSummaryDto } from './rss.dto';

export const RSS_IMPORT_JOB_TYPE = 'rss.fetch';
const MAX_ITEMS = 100;
/** A "running" fetch older than this is considered crashed. */
const STALE_JOB_MS = 10 * 60_000;
const MAX_BACKOFF_MINUTES = 24 * 60;

type ItemOutcome =
  | { kind: 'created'; itemId: string }
  | { kind: 'duplicate'; itemId: string; duplicateOfId: string }
  | { kind: 'known'; itemId: string | null }
  | { kind: 'invalid'; reason: string };

/** Secret-free, short description of a fetch failure (stored on the feed and the job). */
export function fetchErrorText(err: unknown): string {
  if (err instanceof AppException) {
    const reason = (err.details as { reason?: unknown } | undefined)?.reason;
    return `${err.code}${typeof reason === 'string' ? ` (${reason})` : ''}`;
  }
  return describeProviderError(err);
}

/**
 * Fetches one feed through NEWS_FETCHER (SSRF-safe, conditional GET) and
 * stores new items, de-duplicated by guid (per feed), canonical URL
 * (global) and content hash (same story elsewhere → status duplicate).
 * Every run is an import job ("rss.fetch") with one row per received item.
 * Nothing is published: items only become article DRAFTS on an editor's
 * request (RssItemsService.createDraft).
 */
@Injectable()
export class RssFetchService {
  private readonly logger = new Logger(RssFetchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly importJobs: ImportJobsService,
    @Inject(NEWS_FETCHER) private readonly fetcher: NewsFetcher,
  ) {}

  /**
   * Fetches now. `trigger = manual` throws on failures (the admin sees the
   * error); `scheduled` records them on the feed and returns a summary.
   */
  async fetchFeed(
    feedId: string,
    opts: { trigger: 'manual' | 'scheduled'; userId?: string | null },
  ): Promise<RssFetchSummaryDto> {
    const feed = await this.prisma.rssFeed.findUnique({ where: { id: feedId } });
    if (!feed) throw contentError('RSS_FEED_NOT_FOUND');
    const summary: RssFetchSummaryDto = {
      jobId: null,
      feedId,
      outcome: 'skipped',
      received: 0,
      created: 0,
      duplicates: 0,
      alreadyKnown: 0,
      invalid: 0,
      error: null,
      nextFetchAt: null,
    };

    const job = await this.openJob(feed, opts);
    if (!job) {
      if (opts.trigger === 'manual') throw contentError('RSS_FETCH_IN_PROGRESS');
      return summary;
    }
    summary.jobId = job.id;
    await this.importJobs.start(job.id);

    let result;
    try {
      result = await this.fetcher.fetchFeed(feed.url, {
        etag: feed.etag,
        lastModified: feed.lastModified,
        maxItems: MAX_ITEMS,
      });
    } catch (err) {
      const text = fetchErrorText(err);
      await this.importJobs.fail(job.id, text);
      const failures = feed.consecutiveFailures + 1;
      const backoff = Math.min(
        MAX_BACKOFF_MINUTES,
        feed.fetchIntervalMinutes * 2 ** Math.min(failures, 6),
      );
      const next = new Date(Date.now() + backoff * 60_000);
      await this.prisma.rssFeed.update({
        where: { id: feed.id },
        data: {
          lastFetchedAt: new Date(),
          lastError: text.slice(0, 1000),
          consecutiveFailures: failures,
          nextFetchAt: next,
        },
      });
      this.logger.warn(`RSS feed ${feed.id} failed: ${text}`);
      if (opts.trigger === 'manual') throw err;
      return { ...summary, outcome: 'failed', error: text, nextFetchAt: next.toISOString() };
    }

    const now = new Date();
    const next = new Date(now.getTime() + feed.fetchIntervalMinutes * 60_000);
    const feedUpdate: Prisma.RssFeedUpdateInput = {
      lastFetchedAt: now,
      lastSuccessAt: now,
      lastError: null,
      consecutiveFailures: 0,
      nextFetchAt: next,
      etag: result.etag?.slice(0, 512) ?? null,
      lastModified: result.lastModified?.slice(0, 128) ?? null,
    };
    if (result.status === 'not_modified') {
      await this.importJobs.complete(job.id);
      await this.prisma.rssFeed.update({ where: { id: feed.id }, data: feedUpdate });
      return { ...summary, outcome: 'not_modified', nextFetchAt: next.toISOString() };
    }

    const feedLanguage =
      normalizeLanguage(feed.language) ?? normalizeLanguage(result.feed.language);
    if (!feed.language && feedLanguage) feedUpdate.language = feedLanguage;
    if (!feed.siteUrl && result.feed.link && /^https?:\/\//i.test(result.feed.link)) {
      feedUpdate.siteUrl = result.feed.link.slice(0, 2048);
    }
    await this.importJobs.setTotal(job.id, result.items.length);
    summary.received = result.items.length;
    const rows: RowRecord[] = [];
    for (const [index, item] of result.items.entries()) {
      const outcome = await this.processItem(feed, item, feedLanguage);
      const data = { title: item.title.slice(0, 300), url: item.url, guid: item.guid };
      switch (outcome.kind) {
        case 'created':
          summary.created++;
          rows.push({
            rowNumber: index + 1,
            status: ImportRowStatus.imported,
            data,
            entityType: 'rss_item',
            entityId: outcome.itemId,
          });
          break;
        case 'duplicate':
          summary.duplicates++;
          rows.push({
            rowNumber: index + 1,
            status: ImportRowStatus.duplicate,
            data: { ...data, duplicateOfId: outcome.duplicateOfId },
            entityType: 'rss_item',
            entityId: outcome.itemId,
          });
          break;
        case 'known':
          summary.alreadyKnown++;
          rows.push({
            rowNumber: index + 1,
            status: ImportRowStatus.skipped,
            data,
            entityType: 'rss_item',
            entityId: outcome.itemId,
          });
          break;
        case 'invalid':
          summary.invalid++;
          rows.push({
            rowNumber: index + 1,
            status: ImportRowStatus.invalid,
            data,
            errors: [{ code: outcome.reason, message: outcome.reason }],
          });
          break;
      }
    }
    if (rows.length) await this.importJobs.recordRows(job.id, rows);
    const done = await this.importJobs.complete(job.id);
    await this.prisma.rssFeed.update({ where: { id: feed.id }, data: feedUpdate });
    return {
      ...summary,
      outcome:
        done.status === ImportJobStatus.completed_with_errors
          ? 'completed_with_errors'
          : 'completed',
      nextFetchAt: next.toISOString(),
    };
  }

  /**
   * One open "rss.fetch" job per feed (import_jobs idempotency key). A
   * crashed run older than STALE_JOB_MS is failed and replaced. Returns
   * null while another fetch of the feed is running.
   */
  private async openJob(feed: RssFeed, opts: { trigger: string; userId?: string | null }) {
    const input = {
      type: RSS_IMPORT_JOB_TYPE,
      source: feed.url,
      options: { feedId: feed.id, trigger: opts.trigger },
      idempotencyKey: `feed:${feed.id}`,
      createdById: opts.userId ?? null,
    };
    let { job, created } = await this.importJobs.create(input);
    if (created) return job;
    const startedAt = (job.startedAt ?? job.createdAt).getTime();
    if (Date.now() - startedAt < STALE_JOB_MS) return null;
    await this.importJobs.fail(job.id, 'Stale fetch (no progress for 10 minutes)');
    ({ job, created } = await this.importJobs.create(input));
    return created ? job : null;
  }

  private async processItem(
    feed: RssFeed,
    item: FeedItem,
    feedLanguage: 'ar' | 'en' | null,
  ): Promise<ItemOutcome> {
    const title = sanitizePlainText(item.title ?? '', 500);
    if (!title) return { kind: 'invalid', reason: 'missing_title' };
    if (!item.url) return { kind: 'invalid', reason: 'missing_url' };
    const excerpt = item.excerpt ? sanitizePlainText(item.excerpt, 2000) || null : null;
    const guid = item.guid?.trim().slice(0, 2048) || null;
    const keys = dedupeKeys({ url: item.url, guid, title, summary: excerpt });
    if (!keys || item.url.length > 2048 || keys.canonicalUrl.length > 2048) {
      return { kind: 'invalid', reason: 'invalid_url' };
    }

    // Already imported (same guid in this feed, or same article URL anywhere).
    const known = await this.prisma.rssItem.findFirst({
      where: {
        OR: [
          ...(keys.guidHash ? [{ feedId: feed.id, guidHash: keys.guidHash }] : []),
          { urlHash: keys.urlHash },
        ],
      },
      select: { id: true, feedId: true },
    });
    if (known) {
      return known.feedId === feed.id
        ? { kind: 'known', itemId: known.id }
        : { kind: 'duplicate', itemId: known.id, duplicateOfId: known.id };
    }

    // Same story (title + excerpt) under another URL / feed → kept, flagged duplicate.
    const sameContent = await this.prisma.rssItem.findFirst({
      where: { contentHash: keys.contentHash, duplicateOfId: null },
      orderBy: { fetchedAt: 'asc' },
      select: { id: true },
    });
    const policy = draftPolicy(toLicenseMode(feed.usagePolicy), feed.allowImages);
    const imageUrl =
      policy.image &&
      item.imageUrl &&
      /^https?:\/\//i.test(item.imageUrl) &&
      item.imageUrl.length <= 2048
        ? item.imageUrl
        : null;
    const publishedAt = item.publishedAt ? new Date(item.publishedAt) : null;
    try {
      const created = await this.prisma.rssItem.create({
        data: {
          feedId: feed.id,
          guid,
          guidHash: keys.guidHash,
          url: item.url,
          canonicalUrl: keys.canonicalUrl,
          urlHash: keys.urlHash,
          contentHash: keys.contentHash,
          duplicateOfId: sameContent?.id ?? null,
          title,
          // Headline + link feeds: the excerpt is not stored at all (licence).
          summary: policy.summary ? excerpt : null,
          author: item.author ? sanitizePlainText(item.author, 200) || null : null,
          imageUrl,
          language: feedLanguage,
          feedCategories: item.categories
            .map((c) => sanitizePlainText(c, 200))
            .filter(Boolean)
            .slice(0, 50),
          publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
          status: sameContent ? RssItemStatus.duplicate : RssItemStatus.new,
          statusReason: sameContent ? 'same_title_and_summary' : null,
        },
        select: { id: true },
      });
      return sameContent
        ? { kind: 'duplicate', itemId: created.id, duplicateOfId: sameContent.id }
        : { kind: 'created', itemId: created.id };
    } catch (err) {
      // A concurrent run inserted the same item: not an error.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { kind: 'known', itemId: null };
      }
      throw err;
    }
  }
}
