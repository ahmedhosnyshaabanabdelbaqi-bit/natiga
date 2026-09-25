import { Inject, Injectable } from '@nestjs/common';
import { toPageRequest } from '../../common/http/pagination';
import { paginated, type PaginatedResponse } from '../../common/http/responses';
import { normalizeSearchText } from '../../common/i18n/arabic-normalize';
import { Prisma, type RssFeed } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NEWS_FETCHER, type NewsFetcher } from '../../providers';
import { AuditService } from '../audit';
import { contentError } from '../articles/common/content-errors';
import { needsPermission, toLicenseMode, toUsagePolicy, type LicenseMode } from './rss-dedupe';
import type {
  CreateRssFeedDto,
  RssFeedDto,
  RssFeedQueryDto,
  RssItemCountsDto,
  UpdateRssFeedDto,
} from './rss.dto';

export function toFeedView(f: RssFeed, counts?: Partial<RssItemCountsDto>): RssFeedDto {
  return {
    id: f.id,
    name: f.name,
    url: f.url,
    siteUrl: f.siteUrl,
    language: f.language,
    marketCode: f.marketCode,
    defaultCategoryId: f.defaultCategoryId,
    isActive: f.isActive,
    fetchIntervalMinutes: f.fetchIntervalMinutes,
    licenseMode: toLicenseMode(f.usagePolicy),
    licenseNotes: f.licenseNotes,
    licenseUrl: f.licenseUrl,
    permissionReference: f.permissionReference,
    permissionConfirmedAt: f.permissionConfirmedAt?.toISOString() ?? null,
    permissionConfirmedById: f.permissionConfirmedById,
    allowImages: f.allowImages,
    attributionText: f.attributionText,
    lastFetchedAt: f.lastFetchedAt?.toISOString() ?? null,
    lastSuccessAt: f.lastSuccessAt?.toISOString() ?? null,
    lastError: f.lastError,
    consecutiveFailures: f.consecutiveFailures,
    nextFetchAt: f.nextFetchAt?.toISOString() ?? null,
    itemCounts: { new: 0, drafted: 0, ignored: 0, duplicate: 0, failed: 0, ...counts },
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}

/**
 * RSS/Atom sources (/api/v1/admin/rss-feeds). A feed is not a licence
 * (REQUIREMENTS §5): the default licence mode is headline + link; showing
 * summaries, republishing or using the feed images requires a recorded
 * permission reference, and the server records who confirmed it and when.
 * Feed URLs are validated by the SSRF-safe fetcher (https, public hosts).
 */
@Injectable()
export class RssFeedsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(NEWS_FETCHER) private readonly fetcher: NewsFetcher,
  ) {}

  private async counts(feedIds: string[]): Promise<Map<string, Partial<RssItemCountsDto>>> {
    const rows = await this.prisma.rssItem.groupBy({
      by: ['feedId', 'status'],
      where: { feedId: { in: feedIds } },
      _count: { _all: true },
    });
    const map = new Map<string, Partial<RssItemCountsDto>>();
    for (const r of rows) {
      const entry = map.get(r.feedId) ?? {};
      entry[r.status] = r._count._all;
      map.set(r.feedId, entry);
    }
    return map;
  }

  async list(query: RssFeedQueryDto): Promise<PaginatedResponse<RssFeedDto>> {
    const page = toPageRequest(query);
    const where: Prisma.RssFeedWhereInput = {};
    if (query.active) where.isActive = query.active === 'true';
    let feeds = await this.prisma.rssFeed.findMany({ where, orderBy: { name: 'asc' } });
    if (query.q) {
      const q = normalizeSearchText(query.q);
      feeds = feeds.filter((f) => [f.name, f.url].some((s) => normalizeSearchText(s).includes(q)));
    }
    const slice = feeds.slice(page.skip, page.skip + page.take);
    const counts = await this.counts(slice.map((f) => f.id));
    return paginated(
      slice.map((f) => toFeedView(f, counts.get(f.id))),
      feeds.length,
      page,
    );
  }

  async load(id: string): Promise<RssFeed> {
    const feed = await this.prisma.rssFeed.findUnique({ where: { id } });
    if (!feed) throw contentError('RSS_FEED_NOT_FOUND');
    return feed;
  }

  async get(id: string): Promise<RssFeedDto> {
    const feed = await this.load(id);
    return toFeedView(feed, (await this.counts([id])).get(id));
  }

  private async assertReferences(marketCode?: string | null, categoryId?: string | null) {
    const problems: Record<string, string> = {};
    if (marketCode) {
      const m = await this.prisma.market.findUnique({ where: { code: marketCode } });
      if (!m) problems.marketCode = marketCode;
    }
    if (categoryId) {
      const c = await this.prisma.category.findUnique({ where: { id: categoryId } });
      if (!c?.isActive) problems.defaultCategoryId = categoryId;
    }
    if (Object.keys(problems).length) throw contentError('ARTICLE_REFERENCE_INVALID', problems);
  }

  /** Licence fields + permission record (who/when) for the resulting settings. */
  private licence(
    mode: LicenseMode,
    allowImages: boolean,
    reference: string | null,
    before: RssFeed | null,
    userId: string,
  ): Pick<
    Prisma.RssFeedUncheckedCreateInput,
    | 'usagePolicy'
    | 'allowImages'
    | 'permissionReference'
    | 'permissionConfirmedAt'
    | 'permissionConfirmedById'
  > {
    const ref = reference?.trim() || null;
    if (needsPermission(mode, allowImages) && !ref) {
      throw contentError('RSS_PERMISSION_REQUIRED', { licenseMode: mode, allowImages });
    }
    const usagePolicy = toUsagePolicy(mode);
    const unchanged =
      before &&
      before.usagePolicy === usagePolicy &&
      before.allowImages === allowImages &&
      before.permissionReference === ref;
    return {
      usagePolicy,
      allowImages,
      permissionReference: ref,
      permissionConfirmedAt: unchanged ? before.permissionConfirmedAt : ref ? new Date() : null,
      permissionConfirmedById: unchanged ? before.permissionConfirmedById : ref ? userId : null,
    };
  }

  async create(dto: CreateRssFeedDto, userId: string): Promise<RssFeedDto> {
    const url = await this.fetcher.validateFeedUrl(dto.url.trim());
    await this.assertReferences(dto.marketCode, dto.defaultCategoryId);
    const licence = this.licence(
      dto.licenseMode ?? 'link_only',
      dto.allowImages ?? false,
      dto.permissionReference ?? null,
      null,
      userId,
    );
    try {
      const feed = await this.prisma.rssFeed.create({
        data: {
          name: dto.name,
          url,
          siteUrl: dto.siteUrl ?? null,
          language: dto.language ?? null,
          marketCode: dto.marketCode ?? null,
          defaultCategoryId: dto.defaultCategoryId ?? null,
          isActive: dto.isActive ?? true,
          fetchIntervalMinutes: dto.fetchIntervalMinutes ?? 60,
          licenseNotes: dto.licenseNotes ?? null,
          licenseUrl: dto.licenseUrl ?? null,
          attributionText: dto.attributionText ?? null,
          createdById: userId,
          ...licence,
        },
      });
      const view = toFeedView(feed);
      this.audit.annotate({ entityType: 'rss_feed', entityId: feed.id, after: view });
      return view;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw contentError('RSS_FEED_EXISTS', { url });
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateRssFeedDto, userId: string): Promise<RssFeedDto> {
    const before = await this.load(id);
    const url =
      dto.url !== undefined && dto.url.trim() !== before.url
        ? await this.fetcher.validateFeedUrl(dto.url.trim())
        : undefined;
    await this.assertReferences(
      dto.marketCode !== undefined ? dto.marketCode : null,
      dto.defaultCategoryId !== undefined && dto.defaultCategoryId !== before.defaultCategoryId
        ? dto.defaultCategoryId
        : null,
    );
    const licence = this.licence(
      dto.licenseMode ?? toLicenseMode(before.usagePolicy),
      dto.allowImages ?? before.allowImages,
      dto.permissionReference !== undefined ? dto.permissionReference : before.permissionReference,
      before,
      userId,
    );
    const data: Prisma.RssFeedUncheckedUpdateInput = { ...licence };
    if (dto.name !== undefined) data.name = dto.name;
    if (url !== undefined) {
      data.url = url;
      // A new address starts without conditional-GET state.
      data.etag = null;
      data.lastModified = null;
      data.nextFetchAt = null;
    }
    if (dto.siteUrl !== undefined) data.siteUrl = dto.siteUrl;
    if (dto.language !== undefined) data.language = dto.language;
    if (dto.marketCode !== undefined) data.marketCode = dto.marketCode;
    if (dto.defaultCategoryId !== undefined) data.defaultCategoryId = dto.defaultCategoryId;
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
      if (dto.isActive && !before.isActive) data.nextFetchAt = null;
    }
    if (dto.fetchIntervalMinutes !== undefined)
      data.fetchIntervalMinutes = dto.fetchIntervalMinutes;
    if (dto.licenseNotes !== undefined) data.licenseNotes = dto.licenseNotes;
    if (dto.licenseUrl !== undefined) data.licenseUrl = dto.licenseUrl;
    if (dto.attributionText !== undefined) data.attributionText = dto.attributionText;
    try {
      const feed = await this.prisma.rssFeed.update({ where: { id }, data });
      const view = toFeedView(feed, (await this.counts([id])).get(id));
      this.audit.annotate({
        entityType: 'rss_feed',
        entityId: id,
        before: toFeedView(before),
        after: view,
      });
      return view;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw contentError('RSS_FEED_EXISTS', { url });
      }
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    const feed = await this.load(id);
    const drafted = await this.prisma.rssItem.count({
      where: { feedId: id, article: { isNot: null } },
    });
    if (drafted > 0) throw contentError('RSS_FEED_IN_USE', { articles: drafted });
    this.audit.annotate({ entityType: 'rss_feed', entityId: id, before: toFeedView(feed) });
    await this.prisma.rssFeed.delete({ where: { id } });
  }
}
