import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { toPageRequest } from '../../../common/http/pagination';
import { paginated } from '../../../common/http/responses';
import { htmlToPlainText } from '../../../common/sanitize/html-sanitizer';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuthUser } from '../../auth';
import { contentError } from '../common/content-errors';
import { prepareArticleHtml } from '../domain/article-html';
import {
  diffSnapshots,
  parseSnapshot,
  wordDiff,
  type ArticleSnapshot,
} from '../domain/article-snapshot';
import { editDecision } from '../domain/article-workflow';
import type {
  AdminArticleDto,
  RevisionDetailDto,
  RevisionDiffDto,
  RevisionSummaryDto,
} from '../dto/admin-article.dto';
import { ArticleMediaService } from './article-media.service';
import { ArticlesAdminService } from './articles-admin.service';
import { cloneState, stateFromRow, type ArticleState } from './article-state';

const REVISION_SELECT = {
  version: true,
  status: true,
  note: true,
  restoredFromVersion: true,
  createdAt: true,
  createdBy: { select: { id: true, displayName: true } },
} as const;

type RevisionRow = {
  version: number;
  status: string;
  note: string | null;
  restoredFromVersion: number | null;
  createdAt: Date;
  createdBy: { id: string; displayName: string } | null;
};

function toSummary(r: RevisionRow): RevisionSummaryDto {
  return {
    version: r.version,
    status: r.status,
    note: r.note,
    restoredFromVersion: r.restoredFromVersion,
    createdBy: r.createdBy ? { id: r.createdBy.id, name: r.createdBy.displayName } : null,
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * Revision history of an article: list, full snapshot, field + word diff,
 * and restore. Restoring never rewrites history: it saves a NEW version
 * (restoredFromVersion = the restored one). References that no longer exist
 * (deleted tags, cars, cover image, inactive category) are dropped, the
 * slug of an already published article is kept (shared links), and the
 * restored HTML passes the current sanitizer and media-rights checks again.
 */
@Injectable()
export class ArticleRevisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly articles: ArticlesAdminService,
    private readonly media: ArticleMediaService,
  ) {}

  async list(articleId: string, query: { page?: number; pageSize?: number }) {
    await this.articles.load(articleId, { includeDeleted: true });
    const page = toPageRequest(query);
    const [rows, total] = await Promise.all([
      this.prisma.articleRevision.findMany({
        where: { articleId },
        select: REVISION_SELECT,
        orderBy: { version: 'desc' },
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.articleRevision.count({ where: { articleId } }),
    ]);
    return paginated(rows.map(toSummary), total, page);
  }

  private async snapshotOf(articleId: string, version: number) {
    const row = await this.prisma.articleRevision.findUnique({
      where: { articleId_version: { articleId, version } },
      select: { ...REVISION_SELECT, snapshot: true },
    });
    const snapshot = row ? parseSnapshot(row.snapshot) : null;
    if (!row || !snapshot) throw contentError('ARTICLE_REVISION_NOT_FOUND', { version });
    return { row, snapshot };
  }

  async get(articleId: string, version: number): Promise<RevisionDetailDto> {
    await this.articles.load(articleId, { includeDeleted: true });
    const { row, snapshot } = await this.snapshotOf(articleId, version);
    return { ...toSummary(row), snapshot: snapshot as unknown as Record<string, unknown> };
  }

  async diff(articleId: string, version: number, against?: number): Promise<RevisionDiffDto> {
    await this.articles.load(articleId, { includeDeleted: true });
    const from = against ?? version - 1;
    const to = await this.snapshotOf(articleId, version);
    if (from < 1) {
      return { from: 0, to: version, changes: [], bodyDiff: {} };
    }
    const base = await this.snapshotOf(articleId, from);
    const [older, newer] =
      from <= version ? [base.snapshot, to.snapshot] : [to.snapshot, base.snapshot];
    const bodyDiff: Record<string, unknown> = {};
    const locales = new Set([
      ...Object.keys(older.translations),
      ...Object.keys(newer.translations),
    ]);
    for (const locale of locales) {
      const a = older.translations[locale]?.bodyHtml ?? '';
      const b = newer.translations[locale]?.bodyHtml ?? '';
      if (a !== b) bodyDiff[locale] = wordDiff(htmlToPlainText(a), htmlToPlainText(b));
    }
    return {
      from: Math.min(from, version),
      to: Math.max(from, version),
      changes: diffSnapshots(older, newer),
      bodyDiff,
    };
  }

  async restore(
    articleId: string,
    version: number,
    expectedVersion: number,
    user: AuthUser,
    lang: SupportedLanguage,
  ): Promise<AdminArticleDto> {
    const perms = new Set(user.permissions);
    const current = await this.articles.load(articleId);
    const decision = editDecision(
      {
        status: current.status,
        isOwn: current.authorId === user.id || current.createdById === user.id,
        deleted: false,
      },
      perms,
    );
    if (!decision.ok) throw contentError(decision.reason);
    if (current.currentVersion !== expectedVersion) {
      throw contentError('ARTICLE_VERSION_CONFLICT', { currentVersion: current.currentVersion });
    }
    const { snapshot } = await this.snapshotOf(articleId, version);
    const prev = stateFromRow(current);
    const next = await this.stateFromSnapshot(snapshot, prev, current.publishedAt !== null, perms);
    await this.articles.persistUpdate(current, prev, next, {
      userId: user.id,
      note: `Restored version ${version}`,
      restoredFromVersion: version,
    });
    return this.articles.get(articleId, user, lang);
  }

  private async stateFromSnapshot(
    s: ArticleSnapshot,
    current: ArticleState,
    slugLocked: boolean,
    perms: Set<string>,
  ): Promise<ArticleState> {
    const next = cloneState(current);
    const images: string[] = [];
    const embeds: string[] = [];
    next.translations = new Map();
    for (const [locale, t] of Object.entries(s.translations)) {
      if (!t) continue;
      const prepared = prepareArticleHtml(t.bodyHtml ?? '', {
        mediaOrigins: this.media.mediaOrigins(),
      });
      images.push(...prepared.imageSources);
      embeds.push(...prepared.rejectedEmbeds);
      next.translations.set(locale, {
        title: t.title,
        summary: t.summary,
        bodyHtml: prepared.html,
        bodyText: prepared.text,
        seoTitle: t.seoTitle,
        seoDescription: t.seoDescription,
        isMachineTranslated: t.isMachineTranslated,
        humanReviewedAt: t.humanReviewedAt ? new Date(t.humanReviewedAt) : null,
        humanReviewedById: t.humanReviewedById,
      });
    }
    if (embeds.length) throw contentError('ARTICLE_EMBED_NOT_ALLOWED', { embeds });
    const bad = await this.media.unlicensedImages(images);
    if (bad.length) throw contentError('ARTICLE_IMAGE_NOT_LICENSED', { images: bad });

    if (!slugLocked && s.slug !== current.slug) {
      const taken = await this.prisma.article.findUnique({
        where: { slug: s.slug },
        select: { id: true },
      });
      if (!taken) next.slug = s.slug;
    }
    next.type = s.type as ArticleState['type'];
    next.originalLanguage = next.translations.has(s.originalLanguage)
      ? s.originalLanguage
      : current.originalLanguage;
    if (!next.translations.has(next.originalLanguage)) {
      // Keep the current original text rather than losing it.
      const keep = current.translations.get(current.originalLanguage);
      if (keep) next.translations.set(current.originalLanguage, keep);
    }
    next.authorName = s.authorName;
    next.eventDate = s.eventDate ? new Date(`${s.eventDate}T00:00:00Z`) : null;
    next.sourceName = s.sourceName;
    next.sourceUrl = s.sourceUrl;
    next.isSponsored = s.isSponsored;
    next.sponsorName = s.sponsorName;
    next.allowComments = s.allowComments;
    if (perms.has('articles.publish')) next.isFeatured = s.isFeatured;

    const [category, tags, markets, brands, models, variants, cover] = await Promise.all([
      s.categoryId
        ? this.prisma.category.findFirst({ where: { id: s.categoryId, isActive: true } })
        : null,
      this.prisma.tag.findMany({ where: { id: { in: s.tagIds } }, select: { id: true } }),
      this.prisma.market.findMany({
        where: { code: { in: s.marketCodes } },
        select: { code: true },
      }),
      this.prisma.brand.findMany({
        where: {
          id: { in: s.vehicleLinks.map((l) => l.brandId ?? '').filter(Boolean) },
          deletedAt: null,
        },
        select: { id: true },
      }),
      this.prisma.carModel.findMany({
        where: {
          id: { in: s.vehicleLinks.map((l) => l.modelId ?? '').filter(Boolean) },
          deletedAt: null,
        },
        select: { id: true },
      }),
      this.prisma.vehicleVariant.findMany({
        where: {
          id: { in: s.vehicleLinks.map((l) => l.variantId ?? '').filter(Boolean) },
          deletedAt: null,
        },
        select: { id: true },
      }),
      s.coverAssetId
        ? this.prisma.mediaAsset.findUnique({
            where: { id: s.coverAssetId },
            select: { id: true, kind: true, deletedAt: true, status: true },
          })
        : null,
    ]);
    next.categoryId = category?.id ?? null;
    next.tagIds = tags.map((t) => t.id).sort();
    next.marketCodes = markets.map((m) => m.code).sort();
    const okVehicles = new Set([...brands, ...models, ...variants].map((x) => x.id));
    next.vehicleLinks = s.vehicleLinks.filter((l) =>
      okVehicles.has(l.brandId ?? l.modelId ?? l.variantId ?? ''),
    );
    next.coverAssetId =
      cover && !cover.deletedAt && cover.kind === 'image' && cover.status !== 'failed'
        ? cover.id
        : null;
    if (s.authorId && s.authorId !== current.authorId) {
      const authors = await this.articles.authors();
      if (authors.some((a) => a.id === s.authorId)) next.authorId = s.authorId;
    }
    return next;
  }
}
