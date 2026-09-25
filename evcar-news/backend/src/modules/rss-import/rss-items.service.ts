import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../config/app-config';
import { toPageRequest } from '../../common/http/pagination';
import { paginated, type PaginatedResponse } from '../../common/http/responses';
import { escapeHtml } from '../../common/sanitize/html-sanitizer';
import { ArticleType, RssItemStatus, type Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit';
import type { AuthUser } from '../auth';
import { contentError } from '../articles/common/content-errors';
import { slugFromTexts, uniqueSlug } from '../articles/common/slug';
import { prepareArticleHtml } from '../articles/domain/article-html';
import type { ArticleState } from '../articles/services/article-state';
import { ArticlesAdminService } from '../articles/services/articles-admin.service';
import { draftPolicy, normalizeLanguage, toLicenseMode } from './rss-dedupe';
import type {
  CreateDraftFromItemDto,
  DraftFromItemResultDto,
  RssItemDto,
  RssItemQueryDto,
} from './rss.dto';

const ITEM_INCLUDE = {
  feed: {
    select: {
      id: true,
      name: true,
      usagePolicy: true,
      allowImages: true,
      language: true,
      marketCode: true,
      defaultCategoryId: true,
    },
  },
  duplicateOf: { select: { id: true, title: true, url: true } },
  article: { select: { id: true, slug: true, status: true } },
} satisfies Prisma.RssItemInclude;

type ItemRow = Prisma.RssItemGetPayload<{ include: typeof ITEM_INCLUDE }>;

function toItemView(i: ItemRow): RssItemDto {
  return {
    id: i.id,
    feedId: i.feedId,
    feedName: i.feed.name,
    licenseMode: toLicenseMode(i.feed.usagePolicy),
    title: i.title,
    summary: i.summary,
    url: i.url,
    canonicalUrl: i.canonicalUrl,
    author: i.author,
    imageUrl: i.feed.allowImages ? i.imageUrl : null,
    language: i.language,
    feedCategories: i.feedCategories,
    publishedAt: i.publishedAt?.toISOString() ?? null,
    fetchedAt: i.fetchedAt.toISOString(),
    status: i.status,
    statusReason: i.statusReason,
    duplicateOf: i.duplicateOf,
    article: i.article ? { ...i.article, status: i.article.status } : null,
    processedAt: i.processedAt?.toISOString() ?? null,
  };
}

/**
 * Imported feed entries (/api/v1/admin/rss-items): review queue, ignore /
 * restore, and "create a draft" — the ONLY way an item becomes content. The
 * draft respects the feed licence (headline + link by default; the excerpt
 * only with a recorded permission), carries the source name / URL and the
 * feed attribution, and goes through the normal review workflow. Items are
 * never published automatically.
 */
@Injectable()
export class RssItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly articles: ArticlesAdminService,
    private readonly audit: AuditService,
  ) {}

  async list(query: RssItemQueryDto): Promise<PaginatedResponse<RssItemDto>> {
    const page = toPageRequest(query);
    const and: Prisma.RssItemWhereInput[] = [];
    if (query.feedId) and.push({ feedId: query.feedId });
    if (query.status) and.push({ status: query.status });
    if (query.q) and.push({ title: { contains: query.q, mode: 'insensitive' } });
    const where: Prisma.RssItemWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.rssItem.findMany({
        where,
        include: ITEM_INCLUDE,
        orderBy: [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { fetchedAt: 'desc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.rssItem.count({ where }),
    ]);
    return paginated(rows.map(toItemView), total, page);
  }

  private async load(id: string): Promise<ItemRow> {
    const row = await this.prisma.rssItem.findUnique({ where: { id }, include: ITEM_INCLUDE });
    if (!row) throw contentError('RSS_ITEM_NOT_FOUND');
    return row;
  }

  async get(id: string): Promise<RssItemDto> {
    return toItemView(await this.load(id));
  }

  async ignore(id: string, reason: string | undefined, userId: string): Promise<RssItemDto> {
    const item = await this.load(id);
    if (item.status === RssItemStatus.drafted) throw contentError('RSS_ITEM_ALREADY_DRAFTED');
    const updated = await this.prisma.rssItem.update({
      where: { id },
      data: {
        status: RssItemStatus.ignored,
        statusReason: reason?.slice(0, 1000) ?? null,
        processedAt: new Date(),
        processedById: userId,
      },
      include: ITEM_INCLUDE,
    });
    this.audit.annotate({
      entityType: 'rss_item',
      entityId: id,
      before: { status: item.status },
      after: { status: updated.status, reason: updated.statusReason },
    });
    return toItemView(updated);
  }

  async restore(id: string, userId: string): Promise<RssItemDto> {
    const item = await this.load(id);
    if (item.status === RssItemStatus.drafted) throw contentError('RSS_ITEM_ALREADY_DRAFTED');
    const updated = await this.prisma.rssItem.update({
      where: { id },
      data: {
        status: RssItemStatus.new,
        statusReason: null,
        processedAt: new Date(),
        processedById: userId,
      },
      include: ITEM_INCLUDE,
    });
    this.audit.annotate({
      entityType: 'rss_item',
      entityId: id,
      before: { status: item.status },
      after: { status: updated.status },
    });
    return toItemView(updated);
  }

  async createDraft(
    id: string,
    dto: CreateDraftFromItemDto,
    user: AuthUser,
    lang: SupportedLanguage,
  ): Promise<DraftFromItemResultDto> {
    const item = await this.load(id);
    if (item.status === RssItemStatus.drafted || item.article) {
      throw contentError('RSS_ITEM_ALREADY_DRAFTED', { articleId: item.article?.id });
    }
    if (item.status !== RssItemStatus.new) {
      throw contentError('RSS_ITEM_NOT_DRAFTABLE', { status: item.status });
    }
    const language =
      dto.language ?? normalizeLanguage(item.language) ?? normalizeLanguage(item.feed.language);
    if (!language) throw contentError('RSS_ITEM_LANGUAGE_UNSUPPORTED', { language: item.language });

    const feed = await this.prisma.rssFeed.findUniqueOrThrow({ where: { id: item.feedId } });
    const policy = draftPolicy(toLicenseMode(feed.usagePolicy), feed.allowImages);
    const summary = policy.summary ? item.summary : null;
    const body =
      policy.body && item.summary ? prepareArticleHtml(`<p>${escapeHtml(item.summary)}</p>`) : null;
    let categoryId = dto.categoryId ?? feed.defaultCategoryId ?? null;
    if (categoryId && !dto.categoryId) {
      const active = await this.prisma.category.count({
        where: { id: categoryId, isActive: true },
      });
      if (!active) categoryId = null;
    }
    const state: ArticleState = {
      slug: await uniqueSlug(
        slugFromTexts([item.title], 120),
        async (s) =>
          !!(await this.prisma.article.findUnique({ where: { slug: s }, select: { id: true } })),
      ),
      type: ArticleType.news,
      categoryId,
      authorId: user.id,
      authorName: null,
      coverAssetId: null,
      originalLanguage: language,
      eventDate: null,
      sourceName: feed.name.slice(0, 200),
      sourceUrl: item.url,
      isFeatured: false,
      isSponsored: false,
      sponsorName: null,
      allowComments: true,
      marketCodes: feed.marketCode ? [feed.marketCode] : [],
      tagIds: [],
      vehicleLinks: [],
      translations: new Map([
        [
          language,
          {
            title: item.title.slice(0, 300),
            summary: summary?.slice(0, 1000) ?? null,
            bodyHtml: body?.html ?? '',
            bodyText: body?.text ?? '',
            seoTitle: null,
            seoDescription: null,
            isMachineTranslated: false,
            humanReviewedAt: null,
            humanReviewedById: null,
          },
        ],
      ]),
    };

    // Claim the item first so two editors cannot draft it twice.
    const claimed = await this.prisma.rssItem.updateMany({
      where: { id, status: RssItemStatus.new },
      data: { status: RssItemStatus.drafted, processedAt: new Date(), processedById: user.id },
    });
    if (claimed.count === 0) throw contentError('RSS_ITEM_ALREADY_DRAFTED');
    let articleId: string;
    try {
      articleId = await this.articles.createFromState(
        state,
        { userId: user.id, note: 'Draft created from an RSS item' },
        { rssItemId: id },
      );
    } catch (err) {
      await this.prisma.rssItem.update({
        where: { id },
        data: { status: RssItemStatus.new, processedAt: null, processedById: null },
      });
      throw err;
    }
    this.audit.annotate({
      action: 'rss.item_drafted',
      entityType: 'rss_item',
      entityId: id,
      after: { articleId, language, licenseMode: toLicenseMode(feed.usagePolicy) },
    });
    return {
      article: await this.articles.get(articleId, user, lang),
      item: toItemView(await this.load(id)),
    };
  }
}
