import { createHmac } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AppConfig, type SupportedLanguage } from '../../../config/app-config';
import { toPageRequest } from '../../../common/http/pagination';
import { paginated, type PaginatedResponse } from '../../../common/http/responses';
import { REDIS } from '../../../common/redis/redis.module';
import { ContentStatus, type Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { contentError } from '../common/content-errors';
import { isUuid } from '../common/slug';
import { articleIdsMatching } from '../common/text-search';
import {
  SERVABLE_TRANSLATION_WHERE,
  isServableTranslation,
  visibleArticleWhere,
} from '../common/visibility';
import { previewKey, verifyPreviewToken } from '../domain/preview-token';
import type {
  PublicArticleDetailDto,
  PublicArticleQueryDto,
  PublicArticleSummaryDto,
  PublicCorrectionDto,
} from '../dto/public-article.dto';
import { ARTICLE_LIST_INCLUDE, VEHICLE_LINK_INCLUDE, toVehicleRef } from './article-includes';
import { ArticlePresenter, type ShareUrlBuilder } from './article-presenter.service';

const DETAIL_INCLUDE = {
  ...ARTICLE_LIST_INCLUDE,
  translations: true,
  vehicleLinks: { include: VEHICLE_LINK_INCLUDE },
  corrections: { where: { isPublic: true }, orderBy: { correctedAt: 'desc' } },
  rssItem: { select: { feed: { select: { name: true, attributionText: true } } } },
} satisfies Prisma.ArticleInclude;

type DetailRow = Prisma.ArticleGetPayload<{ include: typeof DETAIL_INCLUDE }>;

const RELATED_LIMIT = 6;
const POPULAR_DAYS = 7;
const POPULAR_MAX = 500;
const VIEW_DEDUPE_SECONDS = 30 * 60;

/**
 * Reader-facing news API (guests allowed): list with filters, detail with
 * related articles / cars and the corrections log, signed previews and the
 * anonymous view counter. Only published articles whose publication time
 * has come are visible; unreviewed machine translations are never served.
 */
@Injectable()
export class ArticlesPublicService {
  private readonly logger = new Logger(ArticlesPublicService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly presenter: ArticlePresenter,
    private readonly config: AppConfig,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  // --- list ----------------------------------------------------------------------------

  async list(
    query: PublicArticleQueryDto,
    lang: SupportedLanguage,
    market: string,
  ): Promise<PaginatedResponse<PublicArticleSummaryDto>> {
    const page = toPageRequest(query);
    const where = await this.listWhere(query, lang, market);
    const share = await this.presenter.shareUrlBuilder();
    const empty = paginated<PublicArticleSummaryDto>([], 0, page);
    if (!where) return empty;

    let rows: Prisma.ArticleGetPayload<{ include: typeof ARTICLE_LIST_INCLUDE }>[];
    let total: number;
    if (query.sort === 'popular') {
      ({ rows, total } = await this.popular(where, page));
    } else {
      const direction = query.sort === 'oldest' ? 'asc' : 'desc';
      [rows, total] = await Promise.all([
        this.prisma.article.findMany({
          where,
          include: ARTICLE_LIST_INCLUDE,
          orderBy: [{ publishedAt: direction }, { id: direction }],
          skip: page.skip,
          take: page.take,
        }),
        this.prisma.article.count({ where }),
      ]);
    }
    const data = rows
      .map((r) => this.presenter.toPublicSummary(r, lang, share))
      .filter((x): x is PublicArticleSummaryDto => !!x);
    return paginated(data, total, page);
  }

  /** Where-clause of a list query; null = a filter matches nothing. */
  private async listWhere(
    query: PublicArticleQueryDto,
    lang: SupportedLanguage,
    market: string,
  ): Promise<Prisma.ArticleWhereInput | null> {
    const and: Prisma.ArticleWhereInput[] = [
      visibleArticleWhere(query.allMarkets === 'true' ? null : market),
      {
        translations: {
          some:
            query.languageMode === 'strict'
              ? { locale: lang, ...SERVABLE_TRANSLATION_WHERE }
              : SERVABLE_TRANSLATION_WHERE,
        },
      },
    ];
    if (query.type) and.push({ type: query.type });
    if (query.featured) and.push({ isFeatured: query.featured === 'true' });
    if (query.category) {
      const ids = await this.categoryIds(query.category);
      if (!ids.length) return null;
      and.push({ categoryId: { in: ids } });
    }
    if (query.tag) {
      const tag = await this.prisma.tag.findFirst({
        where: isUuid(query.tag) ? { id: query.tag } : { slug: query.tag.toLowerCase() },
        select: { id: true },
      });
      if (!tag) return null;
      and.push({ tags: { some: { tagId: tag.id } } });
    }
    const vehicleFilters: Array<[string | undefined, 'brand' | 'model' | 'variant' | 'any']> = [
      [query.brand ?? query.brandId, 'brand'],
      [query.model ?? query.modelId, 'model'],
      [query.variant ?? query.variantId, 'variant'],
      [query.vehicle, 'any'],
    ];
    for (const [value, kind] of vehicleFilters) {
      if (!value) continue;
      const cond = await this.vehicleCondition(value, kind);
      if (!cond) return null;
      and.push(cond);
    }
    if (query.q) {
      const ids = await articleIdsMatching(this.prisma, query.q, {
        includeBody: true,
        servableOnly: true,
      });
      if (!ids.length) return null;
      and.push({ id: { in: ids } });
    }
    return { AND: and };
  }

  /** Category (slug or id) + its active sub-categories. */
  private async categoryIds(slugOrId: string): Promise<string[]> {
    const c = await this.prisma.category.findFirst({
      where: {
        isActive: true,
        ...(isUuid(slugOrId) ? { id: slugOrId } : { slug: slugOrId.toLowerCase() }),
      },
      select: { id: true, children: { where: { isActive: true }, select: { id: true } } },
    });
    return c ? [c.id, ...c.children.map((x) => x.id)] : [];
  }

  private idOrSlug(value: string): { id: string } | { slug: string } {
    return isUuid(value) ? { id: value.toLowerCase() } : { slug: value.toLowerCase() };
  }

  /**
   * Articles about a car: brand → brand or any of its models / variants;
   * model → the model or its variants; variant → the variant or its model.
   */
  private async vehicleCondition(
    value: string,
    kind: 'brand' | 'model' | 'variant' | 'any',
  ): Promise<Prisma.ArticleWhereInput | null> {
    const key = this.idOrSlug(value);
    if (kind === 'variant' || kind === 'any') {
      const v = await this.prisma.vehicleVariant.findFirst({
        where: { ...key, deletedAt: null },
        select: { id: true, modelYear: { select: { generation: { select: { modelId: true } } } } },
      });
      if (v) {
        return {
          vehicleLinks: {
            some: {
              OR: [{ variantId: v.id }, { modelId: v.modelYear.generation.modelId }],
            },
          },
        };
      }
      if (kind === 'variant') return null;
    }
    if (kind === 'model' || kind === 'any') {
      const m = await this.prisma.carModel.findFirst({
        where: { ...key, deletedAt: null },
        select: { id: true },
      });
      if (m) {
        return {
          vehicleLinks: {
            some: {
              OR: [
                { modelId: m.id },
                { variant: { modelYear: { generation: { modelId: m.id } } } },
              ],
            },
          },
        };
      }
      if (kind === 'model') return null;
    }
    const b = await this.prisma.brand.findFirst({
      where: { ...key, deletedAt: null },
      select: { id: true },
    });
    if (!b) return null;
    return {
      vehicleLinks: {
        some: {
          OR: [
            { brandId: b.id },
            { model: { brandId: b.id } },
            { variant: { modelYear: { generation: { model: { brandId: b.id } } } } },
          ],
        },
      },
    };
  }

  /** Most read over the last days first, then the latest ones. */
  private async popular(where: Prisma.ArticleWhereInput, page: { skip: number; take: number }) {
    const since = new Date(Date.now() - POPULAR_DAYS * 24 * 3600 * 1000);
    const stats = await this.prisma.contentDailyStat.groupBy({
      by: ['entityId'],
      where: { entityType: 'article', day: { gte: since }, views: { gt: 0 } },
      _sum: { views: true },
      orderBy: { _sum: { views: 'desc' } },
      take: POPULAR_MAX,
    });
    const rankedIds = stats.map((s) => s.entityId);
    const visibleRanked = await this.prisma.article.findMany({
      where: { AND: [where, { id: { in: rankedIds } }] },
      select: { id: true },
    });
    const visibleSet = new Set(visibleRanked.map((r) => r.id));
    const ranked = rankedIds.filter((id) => visibleSet.has(id));
    const total = await this.prisma.article.count({ where });
    const pageIds = ranked.slice(page.skip, page.skip + page.take);
    let rows = pageIds.length
      ? await this.prisma.article.findMany({
          where: { id: { in: pageIds } },
          include: ARTICLE_LIST_INCLUDE,
        })
      : [];
    rows.sort((a, b) => pageIds.indexOf(a.id) - pageIds.indexOf(b.id));
    const missing = page.take - rows.length;
    if (missing > 0) {
      const skip = Math.max(0, page.skip - ranked.length);
      const rest = await this.prisma.article.findMany({
        where: { AND: [where, { id: { notIn: ranked } }] },
        include: ARTICLE_LIST_INCLUDE,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: missing,
      });
      rows = [...rows, ...rest];
    }
    return { rows, total };
  }

  // --- detail --------------------------------------------------------------------------

  async detail(
    slugOrId: string,
    lang: SupportedLanguage,
    market: string,
  ): Promise<PublicArticleDetailDto> {
    const key = this.idOrSlug(slugOrId);
    const row = await this.prisma.article.findFirst({
      where: { AND: [visibleArticleWhere(null), key] },
      include: DETAIL_INCLUDE,
    });
    if (!row) throw contentError('ARTICLE_NOT_FOUND');
    const share = await this.presenter.shareUrlBuilder();
    const detail = this.toDetail(row, lang, market, share, false);
    if (!detail) throw contentError('ARTICLE_NOT_FOUND');
    detail.relatedArticles = await this.related(row, lang, market, share);
    return detail;
  }

  /** Unpublished article through a signed preview link (no caching, noindex). */
  async preview(token: string, lang: SupportedLanguage, market: string) {
    const result = verifyPreviewToken(previewKey(this.config.auth.accessTokenSecret), token);
    if (!result.ok) throw contentError(result.reason);
    const row = await this.prisma.article.findFirst({
      where: { id: result.claims.articleId, deletedAt: null },
      include: DETAIL_INCLUDE,
    });
    if (!row) throw contentError('ARTICLE_NOT_FOUND');
    const share = await this.presenter.shareUrlBuilder();
    const detail = this.toDetail(row, lang, market, share, true);
    if (!detail) throw contentError('ARTICLE_NOT_FOUND');
    detail.relatedArticles = await this.related(row, lang, market, share);
    return { ...detail, preview: true, status: row.status };
  }

  private toDetail(
    row: DetailRow,
    lang: SupportedLanguage,
    market: string,
    share: ShareUrlBuilder,
    preview: boolean,
  ): PublicArticleDetailDto | null {
    const summary = this.presenter.toPublicSummary(row, lang, share, {
      includeUnservable: preview,
    });
    if (!summary) return null;
    const t = row.translations.find((x) => x.locale === summary.language)!;
    const servedLang: SupportedLanguage = summary.language === 'en' ? 'en' : 'ar';
    const corrections: PublicCorrectionDto[] = row.corrections
      .map((c): PublicCorrectionDto | null => {
        const primary = servedLang === 'en' ? c.noteEn : c.noteAr;
        const note = primary ?? (servedLang === 'en' ? c.noteAr : c.noteEn);
        if (!note) return null;
        return {
          id: c.id,
          kind: c.kind,
          note,
          noteLanguage: primary ? servedLang : servedLang === 'en' ? 'ar' : 'en',
          correctedAt: c.correctedAt.toISOString(),
        };
      })
      .filter((c): c is PublicCorrectionDto => !!c);
    const attribution = row.rssItem?.feed.attributionText ?? null;
    const hasSource = row.sourceName || row.sourceUrl || attribution;
    return {
      ...summary,
      bodyHtml: t.bodyHtml,
      seoTitle: t.seoTitle,
      seoDescription: t.seoDescription,
      machineTranslated: t.isMachineTranslated && (preview || isServableTranslation(t)),
      source: hasSource
        ? {
            name: row.sourceName ?? row.rssItem?.feed.name ?? null,
            url: row.sourceUrl,
            attribution,
          }
        : null,
      corrections,
      relatedArticles: [],
      relatedVehicles: row.vehicleLinks
        .map((l) => toVehicleRef(l, lang))
        .filter((v): v is NonNullable<typeof v> => !!v && v.isPublic)
        .map(({ isPublic: _isPublic, ...v }) => v),
      marketMatch: row.markets.length === 0 || row.markets.some((m) => m.marketCode === market),
      allowComments: row.allowComments,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** Same cars > shared tags > same category, newest first. */
  private async related(
    row: DetailRow,
    lang: SupportedLanguage,
    market: string,
    share: ShareUrlBuilder,
  ): Promise<PublicArticleSummaryDto[]> {
    const tagIds = row.tags.map((t) => t.tagId);
    const brandIds = row.vehicleLinks.map((l) => l.brandId).filter((x): x is string => !!x);
    const modelIds = row.vehicleLinks
      .flatMap((l) => [l.modelId, l.variant?.modelYear.generation.model.id])
      .filter((x): x is string => !!x);
    const variantIds = row.vehicleLinks.map((l) => l.variantId).filter((x): x is string => !!x);
    const or: Prisma.ArticleWhereInput[] = [];
    if (tagIds.length) or.push({ tags: { some: { tagId: { in: tagIds } } } });
    if (brandIds.length) or.push({ vehicleLinks: { some: { brandId: { in: brandIds } } } });
    if (modelIds.length) {
      or.push({
        vehicleLinks: {
          some: {
            OR: [
              { modelId: { in: modelIds } },
              { variant: { modelYear: { generation: { modelId: { in: modelIds } } } } },
            ],
          },
        },
      });
    }
    if (variantIds.length) or.push({ vehicleLinks: { some: { variantId: { in: variantIds } } } });
    if (row.categoryId) or.push({ categoryId: row.categoryId });
    if (!or.length) return [];
    const candidates = await this.prisma.article.findMany({
      where: {
        AND: [
          visibleArticleWhere(market),
          { id: { not: row.id } },
          { translations: { some: SERVABLE_TRANSLATION_WHERE } },
          { OR: or },
        ],
      },
      include: {
        ...ARTICLE_LIST_INCLUDE,
        vehicleLinks: { select: { brandId: true, modelId: true, variantId: true } },
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: 40,
    });
    const tagSet = new Set(tagIds);
    const vehicleSet = new Set([...brandIds, ...modelIds, ...variantIds]);
    const score = (c: (typeof candidates)[number]) =>
      c.vehicleLinks.filter((l) => vehicleSet.has(l.brandId ?? l.modelId ?? l.variantId ?? ''))
        .length *
        3 +
      c.tags.filter((t) => tagSet.has(t.tagId)).length * 2 +
      (c.categoryId && c.categoryId === row.categoryId ? 1 : 0);
    return candidates
      .map((c, index) => ({ c, s: score(c), index }))
      .sort((a, b) => b.s - a.s || a.index - b.index)
      .slice(0, RELATED_LIMIT)
      .map(({ c }) => this.presenter.toPublicSummary(c, lang, share))
      .filter((x): x is PublicArticleSummaryDto => !!x);
  }

  // --- views ---------------------------------------------------------------------------

  /**
   * Anonymous view counter (content_daily_stats). A reader is counted once
   * per article per 30 minutes; the dedupe key is an HMAC of IP + user agent
   * kept only in Redis with a TTL — nothing about readers is stored in the
   * database (no reading history).
   */
  async recordView(slugOrId: string, ip: string | undefined, userAgent: string | undefined) {
    const row = await this.prisma.article.findFirst({
      where: { AND: [visibleArticleWhere(null), this.idOrSlug(slugOrId)] },
      select: { id: true },
    });
    if (!row) throw contentError('ARTICLE_NOT_FOUND');
    if (!(await this.firstViewInWindow(row.id, ip, userAgent))) return;
    await this.prisma.$executeRaw`
      INSERT INTO "content_daily_stats" ("id", "entity_type", "entity_id", "day", "views")
      VALUES (gen_random_uuid(), 'article', ${row.id}::uuid, (now() AT TIME ZONE 'UTC')::date, 1)
      ON CONFLICT ("entity_type", "entity_id", "day")
      DO UPDATE SET "views" = "content_daily_stats"."views" + 1`;
  }

  private async firstViewInWindow(
    articleId: string,
    ip: string | undefined,
    userAgent: string | undefined,
  ): Promise<boolean> {
    const reader = createHmac('sha256', this.config.auth.ipHashSalt || 'evcar-views')
      .update(`${ip ?? ''}|${userAgent ?? ''}`)
      .digest('base64url')
      .slice(0, 22);
    try {
      const res = await this.redis.set(
        `${this.config.redis.keyPrefix}article-view:${articleId}:${reader}`,
        '1',
        'EX',
        VIEW_DEDUPE_SECONDS,
        'NX',
      );
      return res === 'OK';
    } catch (err) {
      // Redis down: count anyway (the route is rate limited per IP).
      this.logger.debug?.(`View dedupe unavailable: ${(err as Error).message}`);
      return true;
    }
  }

  /** Status helper for tests / admin: is the article visible to readers now? */
  async isVisible(id: string): Promise<boolean> {
    return (
      (await this.prisma.article.count({
        where: { AND: [visibleArticleWhere(null), { id }, { status: ContentStatus.published }] },
      })) > 0
    );
  }
}
