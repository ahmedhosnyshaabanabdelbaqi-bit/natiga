import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppConfig, type SupportedLanguage } from '../../../config/app-config';
import { AppException } from '../../../common/errors/app.exception';
import { toPageRequest } from '../../../common/http/pagination';
import { paginated, type PaginatedResponse } from '../../../common/http/responses';
import { sanitizePlainText } from '../../../common/sanitize/html-sanitizer';
import {
  ArticleType,
  ContentStatus,
  MediaKind,
  Prisma,
  UserStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit';
import type { AuthUser } from '../../auth';
import { OWNER_ROLE } from '../../rbac';
import { toCategoryRef } from '../../categories/categories.service';
import { toTagRef } from '../../tags/tags.service';
import { contentError, fieldError, type ContentErrorCode } from '../common/content-errors';
import { pickTranslation } from '../common/localized';
import { isUuid, isValidContentSlug, slugFromTexts, uniqueSlug } from '../common/slug';
import { articleIdsMatching } from '../common/text-search';
import { isServableTranslation } from '../common/visibility';
import { prepareArticleHtml, readingMinutes } from '../domain/article-html';
import {
  diffSnapshots,
  textChanged,
  toDateOnly,
  type ArticleSnapshot,
  type VehicleLinkSnapshot,
} from '../domain/article-snapshot';
import {
  allowedActions,
  decideTransition,
  editDecision,
  type WorkflowAction,
  type WorkflowState,
} from '../domain/article-workflow';
import { createPreviewToken, previewKey } from '../domain/preview-token';
import type {
  AdminArticleDto,
  AdminArticleQueryDto,
  AdminArticleSummaryDto,
  AdminTranslationDto,
  ArticleTranslationInputDto,
  ArticleTranslationPatchDto,
  AuthorOptionDto,
  CreateArticleDto,
  PreviewTokenDto,
  UpdateArticleDto,
  VehicleLinkInputDto,
} from '../dto/admin-article.dto';
import {
  ADMIN_ARTICLE_INCLUDE,
  ARTICLE_LIST_INCLUDE,
  toVehicleRef,
  type AdminArticleRow,
  type ArticleListRow,
} from './article-includes';
import { ArticleMediaService } from './article-media.service';
import { ArticlePresenter, type ShareUrlBuilder } from './article-presenter.service';
import { ArticleSearchIndexService } from './article-search-index.service';
import {
  cloneState,
  sameTranslation,
  stateFromRow,
  stateSnapshot,
  type ArticleState,
  type TranslationState,
} from './article-state';

export const ARTICLE_PUBLISHED_EVENT = 'article.published';
export const ARTICLE_UNPUBLISHED_EVENT = 'article.unpublished';

export interface ArticleStatusEvent {
  articleId: string;
  slug: string;
  from: ContentStatus;
  to: ContentStatus;
}

export interface PublishIssue {
  code:
    | 'ORIGINAL_TRANSLATION_MISSING'
    | 'ORIGINAL_TRANSLATION_UNREVIEWED'
    | 'BODY_EMPTY'
    | 'COVER_NOT_LICENSED'
    | 'SPONSOR_NAME_MISSING';
  field?: string;
  locale?: string;
}

interface PersistContext {
  userId: string | null;
  note?: string | null;
  restoredFromVersion?: number;
  /** Do not reset a recorded approval (e.g. a reviewer confirming a translation). */
  keepApproval?: boolean;
}

const LOCALES = ['ar', 'en'] as const;
const SCHEDULE_MIN_LEAD_MS = 30_000;
const SCHEDULE_MAX_AHEAD_MS = 366 * 24 * 3600 * 1000;

function permissionsOf(user: AuthUser): Set<string> {
  return new Set(user.permissions);
}

export function isApproved(a: {
  status: ContentStatus;
  reviewedAt: Date | null;
  submittedAt: Date | null;
}): boolean {
  return (
    (a.status === ContentStatus.in_review || a.status === ContentStatus.scheduled) &&
    !!a.reviewedAt &&
    (!a.submittedAt || a.reviewedAt.getTime() >= a.submittedAt.getTime())
  );
}

function isOwn(a: { authorId: string | null; createdById: string | null }, userId: string) {
  return a.authorId === userId || a.createdById === userId;
}

function workflowState(a: AdminArticleRow, userId: string): WorkflowState {
  return {
    status: a.status,
    approved: isApproved(a),
    isOwn: isOwn(a, userId),
    deleted: !!a.deletedAt,
  };
}

function throwContent(code: ContentErrorCode, details?: unknown): never {
  throw contentError(code, details);
}

/**
 * Articles administration (/api/v1/admin/articles): CRUD with optimistic
 * versioning, the editorial workflow (article-workflow.ts), full revisions
 * with restore, preview links. Every content save writes an
 * article_revisions snapshot (version = current_version + 1) in the same
 * transaction; workflow transitions do not create versions (they are in
 * the audit log).
 */
@Injectable()
export class ArticlesAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: ArticleMediaService,
    private readonly presenter: ArticlePresenter,
    private readonly search: ArticleSearchIndexService,
    private readonly events: EventEmitter2,
    private readonly config: AppConfig,
  ) {}

  // --- reading -------------------------------------------------------------------------

  async load(id: string, opts: { includeDeleted?: boolean } = {}): Promise<AdminArticleRow> {
    const row = await this.prisma.article.findUnique({
      where: { id },
      include: ADMIN_ARTICLE_INCLUDE,
    });
    if (!row || (row.deletedAt && !opts.includeDeleted)) throwContent('ARTICLE_NOT_FOUND');
    return row;
  }

  async list(
    query: AdminArticleQueryDto,
    lang: SupportedLanguage,
  ): Promise<PaginatedResponse<AdminArticleSummaryDto>> {
    const page = toPageRequest(query);
    const and: Prisma.ArticleWhereInput[] = [];
    const deleted = query.deleted ?? 'exclude';
    if (deleted === 'exclude') and.push({ deletedAt: null });
    if (deleted === 'only') and.push({ deletedAt: { not: null } });
    if (query.status) and.push({ status: query.status });
    if (query.type) and.push({ type: query.type });
    if (query.categoryId) and.push({ categoryId: query.categoryId });
    if (query.tagId) and.push({ tags: { some: { tagId: query.tagId } } });
    if (query.authorId) and.push({ authorId: query.authorId });
    if (query.language) and.push({ translations: { some: { locale: query.language } } });
    if (query.targetMarket) {
      const code = query.targetMarket.toUpperCase();
      and.push({
        OR: [{ markets: { none: {} } }, { markets: { some: { marketCode: code } } }],
      });
    }
    if (query.approved) {
      const approvedWhere: Prisma.ArticleWhereInput = {
        status: ContentStatus.in_review,
        reviewedAt: { not: null },
      };
      and.push(query.approved === 'true' ? approvedWhere : { NOT: approvedWhere });
    }
    if (query.q) {
      const ids = await articleIdsMatching(this.prisma, query.q);
      and.push({ id: { in: ids } });
    }
    const orderBy: Prisma.ArticleOrderByWithRelationInput[] = (() => {
      switch (query.sort) {
        case 'updatedAt':
          return [{ updatedAt: 'asc' }];
        case '-createdAt':
          return [{ createdAt: 'desc' }];
        case '-publishedAt':
          return [{ publishedAt: { sort: 'desc', nulls: 'last' } }];
        case 'scheduledAt':
          return [{ scheduledAt: { sort: 'asc', nulls: 'last' } }];
        default:
          return [{ updatedAt: 'desc' }];
      }
    })();
    const where: Prisma.ArticleWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.article.findMany({
        where,
        include: ARTICLE_LIST_INCLUDE,
        orderBy: [...orderBy, { id: 'desc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.article.count({ where }),
    ]);
    return paginated(
      rows.map((r) => this.toSummary(r, lang)),
      total,
      page,
    );
  }

  private toSummary(
    r: ArticleListRow | AdminArticleRow,
    lang: SupportedLanguage,
  ): AdminArticleSummaryDto {
    const t = pickTranslation(r.translations, lang);
    return {
      id: r.id,
      slug: r.slug,
      type: r.type,
      status: r.status,
      approved: isApproved(r),
      title: t?.title ?? r.slug,
      originalLanguage: r.originalLanguage,
      languages: r.translations.map((x) => x.locale).sort(),
      category: r.category ? toCategoryRef(r.category, lang) : null,
      author: r.author
        ? { id: r.author.id, name: r.authorName ?? r.author.displayName }
        : r.authorName
          ? { id: null, name: r.authorName }
          : null,
      marketCodes: r.markets.map((m) => m.marketCode).sort(),
      coverImage: this.media.toView(r.coverAsset, lang),
      currentVersion: r.currentVersion,
      isFeatured: r.isFeatured,
      isSponsored: r.isSponsored,
      isDemo: r.isDemo,
      rssItemId: r.rssItemId,
      scheduledAt: r.scheduledAt?.toISOString() ?? null,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      deletedAt: r.deletedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  publishIssues(a: AdminArticleRow): PublishIssue[] {
    const issues: PublishIssue[] = [];
    const original = a.translations.find((t) => t.locale === a.originalLanguage);
    if (!original) {
      issues.push({ code: 'ORIGINAL_TRANSLATION_MISSING', locale: a.originalLanguage });
    } else {
      if (!isServableTranslation(original)) {
        issues.push({ code: 'ORIGINAL_TRANSLATION_UNREVIEWED', locale: a.originalLanguage });
      }
      if (!original.bodyText?.trim()) {
        issues.push({
          code: 'BODY_EMPTY',
          locale: a.originalLanguage,
          field: `translations.${a.originalLanguage}.bodyHtml`,
        });
      }
    }
    if (a.coverAssetId) {
      const c = a.coverAsset;
      if (!c || !ArticleMediaService.isPublishableImage(c)) {
        issues.push({ code: 'COVER_NOT_LICENSED', field: 'coverAssetId' });
      }
    }
    if (a.isSponsored && !a.sponsorName?.trim()) {
      issues.push({ code: 'SPONSOR_NAME_MISSING', field: 'sponsorName' });
    }
    return issues;
  }

  async view(
    a: AdminArticleRow,
    user: AuthUser,
    lang: SupportedLanguage,
    share?: ShareUrlBuilder,
  ): Promise<AdminArticleDto> {
    const perms = permissionsOf(user);
    const state = workflowState(a, user.id);
    const shareUrl = share ?? (await this.presenter.shareUrlBuilder());
    const translations: Record<string, AdminTranslationDto> = {};
    for (const t of [...a.translations].sort((x, y) => x.locale.localeCompare(y.locale))) {
      translations[t.locale] = {
        locale: t.locale,
        title: t.title,
        summary: t.summary,
        bodyHtml: t.bodyHtml,
        seoTitle: t.seoTitle,
        seoDescription: t.seoDescription,
        isMachineTranslated: t.isMachineTranslated,
        humanReviewedAt: t.humanReviewedAt?.toISOString() ?? null,
        servable: isServableTranslation(t),
        readingMinutes: readingMinutes(t.bodyText ?? ''),
        updatedAt: t.updatedAt.toISOString(),
      };
    }
    return {
      ...this.toSummary(a, lang),
      translations,
      tags: a.tags.map((x) => toTagRef(x.tag, lang)),
      vehicleLinks: a.vehicleLinks
        .map((l) => toVehicleRef(l, lang))
        .filter((v): v is NonNullable<typeof v> => !!v),
      categoryId: a.categoryId,
      coverAssetId: a.coverAssetId,
      authorName: a.authorName,
      eventDate: toDateOnly(a.eventDate),
      sourceName: a.sourceName,
      sourceUrl: a.sourceUrl,
      sponsorName: a.sponsorName,
      allowComments: a.allowComments,
      submittedAt: a.submittedAt?.toISOString() ?? null,
      reviewedAt: a.reviewedAt?.toISOString() ?? null,
      reviewedBy: a.reviewedBy ? { id: a.reviewedBy.id, name: a.reviewedBy.displayName } : null,
      reviewNote: a.reviewNote,
      contentUpdatedAt: a.contentUpdatedAt?.toISOString() ?? null,
      archivedAt: a.archivedAt?.toISOString() ?? null,
      allowedActions: allowedActions(state, perms),
      canEdit: editDecision(state, perms).ok,
      publishIssues: this.publishIssues(a),
      shareUrl: shareUrl(a.slug),
    };
  }

  async get(id: string, user: AuthUser, lang: SupportedLanguage): Promise<AdminArticleDto> {
    return this.view(await this.load(id, { includeDeleted: true }), user, lang);
  }

  /** Staff who may be named as author (roles granting articles.create, or owner). */
  async authors(): Promise<AuthorOptionDto[]> {
    const users = await this.prisma.user.findMany({
      where: {
        status: UserStatus.active,
        roles: {
          some: {
            role: {
              OR: [
                { key: OWNER_ROLE },
                { permissions: { some: { permission: { key: 'articles.create' } } } },
              ],
            },
          },
        },
      },
      select: { id: true, displayName: true },
      orderBy: { displayName: 'asc' },
      take: 500,
    });
    return users;
  }

  // --- input → state -------------------------------------------------------------------

  private translationFrom(
    input: ArticleTranslationInputDto | ArticleTranslationPatchDto,
    base: TranslationState | undefined,
    locale: string,
    collect: { images: string[]; embeds: string[] },
  ): TranslationState {
    const title =
      input.title !== undefined ? sanitizePlainText(input.title, 300) : (base?.title ?? '');
    if (!title) {
      throw fieldError(`translations.${locale}.title`, 'isNotEmpty', {
        ar: 'العنوان مطلوب.',
        en: 'The title is required.',
      });
    }
    let bodyHtml = base?.bodyHtml ?? '';
    let bodyText = base?.bodyText ?? '';
    if (input.bodyHtml !== undefined) {
      const prepared = prepareArticleHtml(input.bodyHtml, {
        mediaOrigins: this.media.mediaOrigins(),
      });
      collect.images.push(...prepared.imageSources);
      collect.embeds.push(...prepared.rejectedEmbeds);
      bodyHtml = prepared.html;
      bodyText = prepared.text;
    }
    const plainOrNull = (v: string | null | undefined, max: number, fallback: string | null) =>
      v === undefined ? fallback : v === null ? null : sanitizePlainText(v, max) || null;
    let isMachineTranslated = base?.isMachineTranslated ?? false;
    let humanReviewedAt = base?.humanReviewedAt ?? null;
    let humanReviewedById = base?.humanReviewedById ?? null;
    if (input.isMachineTranslated === true && !isMachineTranslated) {
      isMachineTranslated = true;
      humanReviewedAt = null;
      humanReviewedById = null;
    } else if (input.isMachineTranslated === false && isMachineTranslated) {
      // A machine text becomes publishable only through an explicit review.
      throw fieldError(`translations.${locale}.isMachineTranslated`, 'machineTranslationReview', {
        ar: 'هذا نص مترجم آليًا. يعتمده مراجع المحتوى من إجراء «اعتماد الترجمة».',
        en: 'This is a machine translation. A content reviewer must use "mark reviewed".',
      });
    }
    return {
      title,
      summary: plainOrNull(input.summary, 1000, base?.summary ?? null),
      bodyHtml,
      bodyText,
      seoTitle: plainOrNull(input.seoTitle, 300, base?.seoTitle ?? null),
      seoDescription: plainOrNull(input.seoDescription, 500, base?.seoDescription ?? null),
      isMachineTranslated,
      humanReviewedAt,
      humanReviewedById,
    };
  }

  private async assertMediaRights(collect: { images: string[]; embeds: string[] }) {
    if (collect.embeds.length) {
      throwContent('ARTICLE_EMBED_NOT_ALLOWED', { embeds: [...new Set(collect.embeds)] });
    }
    const bad = await this.media.unlicensedImages(collect.images);
    if (bad.length) throwContent('ARTICLE_IMAGE_NOT_LICENSED', { images: bad });
  }

  private linksFrom(input: VehicleLinkInputDto[]): VehicleLinkSnapshot[] {
    const seen = new Set<string>();
    const out: VehicleLinkSnapshot[] = [];
    for (const l of input) {
      const key = `${l.type}:${l.id.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        brandId: l.type === 'brand' ? l.id : null,
        modelId: l.type === 'model' ? l.id : null,
        variantId: l.type === 'variant' ? l.id : null,
      });
    }
    return out;
  }

  /**
   * Checks every reference of `next` that differs from `before` (existing
   * references stay valid even if e.g. the category was deactivated later).
   */
  private async assertReferences(next: ArticleState, before: ArticleState | null): Promise<void> {
    const problems: Record<string, unknown> = {};
    const changed = <T>(pick: (s: ArticleState) => T) =>
      !before || JSON.stringify(pick(before)) !== JSON.stringify(pick(next));

    if (next.categoryId && changed((s) => s.categoryId)) {
      const c = await this.prisma.category.findUnique({
        where: { id: next.categoryId },
        select: { isActive: true },
      });
      if (!c?.isActive) problems.categoryId = next.categoryId;
    }
    if (next.tagIds.length && changed((s) => s.tagIds)) {
      const found = await this.prisma.tag.findMany({
        where: { id: { in: next.tagIds } },
        select: { id: true },
      });
      const ok = new Set(found.map((t) => t.id));
      const missing = next.tagIds.filter((id) => !ok.has(id));
      if (missing.length) problems.tagIds = missing;
    }
    if (next.marketCodes.length && changed((s) => s.marketCodes)) {
      const found = await this.prisma.market.findMany({
        where: { code: { in: next.marketCodes } },
        select: { code: true },
      });
      const ok = new Set(found.map((m) => m.code));
      const missing = next.marketCodes.filter((c) => !ok.has(c));
      if (missing.length) problems.marketCodes = missing;
    }
    if (next.vehicleLinks.length && changed((s) => s.vehicleLinks)) {
      const ids = (k: keyof VehicleLinkSnapshot) =>
        next.vehicleLinks.map((l) => l[k]).filter((x): x is string => !!x);
      const [brands, models, variants] = await Promise.all([
        this.prisma.brand.findMany({
          where: { id: { in: ids('brandId') }, deletedAt: null },
          select: { id: true },
        }),
        this.prisma.carModel.findMany({
          where: { id: { in: ids('modelId') }, deletedAt: null },
          select: { id: true },
        }),
        this.prisma.vehicleVariant.findMany({
          where: { id: { in: ids('variantId') }, deletedAt: null },
          select: { id: true },
        }),
      ]);
      const ok = new Set([...brands, ...models, ...variants].map((x) => x.id));
      const missing = next.vehicleLinks
        .map((l) => l.brandId ?? l.modelId ?? l.variantId)
        .filter((id): id is string => !!id && !ok.has(id));
      if (missing.length) problems.vehicleLinks = missing;
    }
    if (next.authorId && changed((s) => s.authorId)) {
      const authors = await this.authors();
      if (!authors.some((a) => a.id === next.authorId)) problems.authorId = next.authorId;
    }
    if (Object.keys(problems).length) throwContent('ARTICLE_REFERENCE_INVALID', problems);
    if (next.coverAssetId && changed((s) => s.coverAssetId)) {
      await this.media.assertCoverUsable(next.coverAssetId);
    }
    if (next.isSponsored && !next.sponsorName?.trim()) {
      throw fieldError('sponsorName', 'isNotEmpty', {
        ar: 'اسم الراعي مطلوب للمحتوى المموّل.',
        en: 'The sponsor name is required for sponsored content.',
      });
    }
    if (!next.translations.has(next.originalLanguage)) {
      throw fieldError(`translations.${next.originalLanguage}`, 'isNotEmpty', {
        ar: 'يجب أن يوجد نص المادة بلغتها الأصلية.',
        en: 'The article needs a text in its original language.',
      });
    }
  }

  private async slugTaken(slug: string, exceptId?: string): Promise<boolean> {
    const row = await this.prisma.article.findUnique({ where: { slug }, select: { id: true } });
    return !!row && row.id !== exceptId;
  }

  private assertSlugFormat(slug: string): void {
    if (!isValidContentSlug(slug, 200)) {
      throw fieldError('slug', 'slug', {
        ar: 'استخدم حروفًا صغيرة وأرقامًا وشرطات فقط (ولا يكون معرّفًا أو كلمة محجوزة).',
        en: 'Use lower-case letters, digits and single hyphens (not an id or a reserved word).',
      });
    }
  }

  private async resolveSlug(
    requested: string | undefined,
    state: ArticleState,
    exceptId?: string,
  ): Promise<string> {
    if (requested !== undefined) {
      const slug = requested.trim().toLowerCase();
      this.assertSlugFormat(slug);
      if (await this.slugTaken(slug, exceptId)) throwContent('ARTICLE_SLUG_TAKEN', { slug });
      return slug;
    }
    const base = slugFromTexts(
      [state.translations.get('en')?.title, state.translations.get(state.originalLanguage)?.title],
      120,
    );
    return uniqueSlug(base, (s) => this.slugTaken(s, exceptId));
  }

  // --- create --------------------------------------------------------------------------

  async create(dto: CreateArticleDto, user: AuthUser, lang: SupportedLanguage) {
    const perms = permissionsOf(user);
    if (dto.isFeatured && !perms.has('articles.publish')) {
      throwContent('ARTICLE_FEATURE_NEEDS_PUBLISH');
    }
    const authorId = dto.authorId === undefined ? user.id : dto.authorId;
    if (authorId !== user.id && !perms.has('articles.update_any')) {
      throw AppException.forbidden(undefined, 'FORBIDDEN');
    }
    const collect = { images: [] as string[], embeds: [] as string[] };
    const translations = new Map<string, TranslationState>();
    for (const locale of LOCALES) {
      const input = dto.translations?.[locale];
      if (input) translations.set(locale, this.translationFrom(input, undefined, locale, collect));
    }
    let type: ArticleType = dto.type ?? ArticleType.news;
    if (!dto.type && dto.categoryId) {
      const c = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
        select: { defaultArticleType: true },
      });
      type = c?.defaultArticleType ?? ArticleType.news;
    }
    const state: ArticleState = {
      slug: '',
      type,
      categoryId: dto.categoryId ?? null,
      authorId,
      authorName: dto.authorName ?? null,
      coverAssetId: dto.coverAssetId ?? null,
      originalLanguage: dto.originalLanguage,
      eventDate: dto.eventDate ? new Date(`${dto.eventDate}T00:00:00Z`) : null,
      sourceName: dto.sourceName ?? null,
      sourceUrl: dto.sourceUrl ?? null,
      isFeatured: dto.isFeatured ?? false,
      isSponsored: dto.isSponsored ?? false,
      sponsorName: dto.sponsorName ?? null,
      allowComments: dto.allowComments ?? true,
      marketCodes: [...new Set(dto.marketCodes ?? [])].sort(),
      tagIds: [...new Set((dto.tagIds ?? []).map((x) => x.toLowerCase()))].sort(),
      vehicleLinks: this.linksFrom(dto.vehicleLinks ?? []),
      translations,
    };
    await this.assertReferences(state, null);
    await this.assertMediaRights(collect);
    state.slug = await this.resolveSlug(dto.slug, state);
    const id = await this.createFromState(state, { userId: user.id, note: dto.revisionNote });
    const row = await this.load(id);
    this.audit.annotate({
      entityType: 'article',
      entityId: id,
      after: { version: 1, slug: row.slug, status: row.status },
    });
    return this.view(row, user, lang);
  }

  /**
   * Writes a new DRAFT article + revision 1 from a validated state. Also
   * used by the RSS import (`extra.rssItemId`); never publishes.
   */
  async createFromState(
    state: ArticleState,
    ctx: PersistContext,
    extra: { rssItemId?: string } = {},
  ): Promise<string> {
    const snapshot = stateSnapshot(state);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.article.create({
          data: {
            slug: state.slug,
            type: state.type,
            status: ContentStatus.draft,
            categoryId: state.categoryId,
            authorId: state.authorId,
            authorName: state.authorName,
            coverAssetId: state.coverAssetId,
            originalLanguage: state.originalLanguage,
            eventDate: state.eventDate,
            sourceName: state.sourceName,
            sourceUrl: state.sourceUrl,
            rssItemId: extra.rssItemId ?? null,
            isFeatured: state.isFeatured,
            isSponsored: state.isSponsored,
            sponsorName: state.sponsorName,
            allowComments: state.allowComments,
            currentVersion: 1,
            createdById: ctx.userId,
            updatedById: ctx.userId,
            translations: {
              create: [...state.translations].map(([locale, t]) => ({ locale, ...t })),
            },
            markets: { create: state.marketCodes.map((marketCode) => ({ marketCode })) },
            tags: { create: state.tagIds.map((tagId) => ({ tagId })) },
            vehicleLinks: { create: state.vehicleLinks },
          },
          select: { id: true },
        });
        await tx.articleRevision.create({
          data: {
            articleId: created.id,
            version: 1,
            status: ContentStatus.draft,
            snapshot: snapshot as unknown as Prisma.InputJsonValue,
            note: ctx.note ?? null,
            createdById: ctx.userId,
          },
        });
        return created.id;
      });
    } catch (err) {
      throw this.mapWriteError(err, state.slug);
    }
  }

  private mapWriteError(err: unknown, slug: string): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = JSON.stringify(err.meta ?? {});
      if (target.includes('slug')) return contentError('ARTICLE_SLUG_TAKEN', { slug });
      if (target.includes('rss_item')) return contentError('RSS_ITEM_ALREADY_DRAFTED');
    }
    return err;
  }

  // --- update --------------------------------------------------------------------------

  async update(id: string, dto: UpdateArticleDto, user: AuthUser, lang: SupportedLanguage) {
    const perms = permissionsOf(user);
    const before = await this.load(id);
    const decision = editDecision(workflowState(before, user.id), perms);
    if (!decision.ok) throwContent(decision.reason);
    if (before.currentVersion !== dto.expectedVersion) {
      throwContent('ARTICLE_VERSION_CONFLICT', { currentVersion: before.currentVersion });
    }
    const prev = stateFromRow(before);
    const next = cloneState(prev);
    const collect = { images: [] as string[], embeds: [] as string[] };

    if (dto.type !== undefined) next.type = dto.type;
    if (dto.categoryId !== undefined) next.categoryId = dto.categoryId;
    if (dto.authorId !== undefined && dto.authorId !== prev.authorId) {
      if (!perms.has('articles.update_any')) throw AppException.forbidden();
      next.authorId = dto.authorId;
    }
    if (dto.authorName !== undefined) next.authorName = dto.authorName;
    if (dto.coverAssetId !== undefined) next.coverAssetId = dto.coverAssetId;
    if (dto.eventDate !== undefined) {
      next.eventDate = dto.eventDate ? new Date(`${dto.eventDate}T00:00:00Z`) : null;
    }
    if (dto.sourceName !== undefined) next.sourceName = dto.sourceName;
    if (dto.sourceUrl !== undefined) next.sourceUrl = dto.sourceUrl;
    if (dto.isFeatured !== undefined && dto.isFeatured !== prev.isFeatured) {
      if (!perms.has('articles.publish')) throwContent('ARTICLE_FEATURE_NEEDS_PUBLISH');
      next.isFeatured = dto.isFeatured;
    }
    if (dto.isSponsored !== undefined) next.isSponsored = dto.isSponsored;
    if (dto.sponsorName !== undefined) next.sponsorName = dto.sponsorName;
    if (dto.allowComments !== undefined) next.allowComments = dto.allowComments;
    if (dto.marketCodes !== undefined) next.marketCodes = [...new Set(dto.marketCodes)].sort();
    if (dto.tagIds !== undefined) {
      next.tagIds = [...new Set(dto.tagIds.map((x) => x.toLowerCase()))].sort();
    }
    if (dto.vehicleLinks !== undefined) next.vehicleLinks = this.linksFrom(dto.vehicleLinks);
    if (dto.originalLanguage !== undefined) next.originalLanguage = dto.originalLanguage;
    for (const locale of LOCALES) {
      const patch = dto.translations?.[locale];
      if (patch === undefined) continue;
      if (patch === null) {
        if (locale === next.originalLanguage) throwContent('ARTICLE_TRANSLATION_ORIGINAL');
        next.translations.delete(locale);
        continue;
      }
      next.translations.set(
        locale,
        this.translationFrom(patch, next.translations.get(locale), locale, collect),
      );
    }
    if (dto.slug !== undefined && dto.slug.trim().toLowerCase() !== prev.slug) {
      if (before.publishedAt) throwContent('ARTICLE_SLUG_LOCKED', { slug: prev.slug });
      next.slug = await this.resolveSlug(dto.slug, next, id);
    }
    await this.assertReferences(next, prev);
    await this.assertMediaRights(collect);
    await this.persistUpdate(before, prev, next, {
      userId: user.id,
      note: dto.revisionNote,
    });
    return this.view(await this.load(id), user, lang);
  }

  /**
   * Writes `next` over the stored article with an optimistic version check
   * and a new revision. No-op (no version) when nothing changed.
   */
  async persistUpdate(
    before: AdminArticleRow,
    prev: ArticleState,
    next: ArticleState,
    ctx: PersistContext,
  ): Promise<{ version: number; changed: boolean }> {
    const beforeSnap: ArticleSnapshot = stateSnapshot(prev);
    const nextSnap = stateSnapshot(next);
    const changes = diffSnapshots(beforeSnap, nextSnap);
    if (changes.length === 0 && ctx.restoredFromVersion === undefined) {
      return { version: before.currentVersion, changed: false };
    }
    const version = before.currentVersion + 1;
    const now = new Date();
    const setsEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    try {
      await this.prisma.$transaction(async (tx) => {
        const res = await tx.article.updateMany({
          where: { id: before.id, currentVersion: before.currentVersion, deletedAt: null },
          data: {
            slug: next.slug,
            type: next.type,
            categoryId: next.categoryId,
            authorId: next.authorId,
            authorName: next.authorName,
            coverAssetId: next.coverAssetId,
            originalLanguage: next.originalLanguage,
            eventDate: next.eventDate,
            sourceName: next.sourceName,
            sourceUrl: next.sourceUrl,
            isFeatured: next.isFeatured,
            isSponsored: next.isSponsored,
            sponsorName: next.sponsorName,
            allowComments: next.allowComments,
            currentVersion: version,
            updatedById: ctx.userId,
            // A reviewed text that changes during review must be reviewed again.
            ...(before.status === ContentStatus.in_review && !ctx.keepApproval
              ? { reviewedAt: null, reviewedById: null }
              : {}),
            ...(before.publishedAt && textChanged(beforeSnap, nextSnap)
              ? { contentUpdatedAt: now }
              : {}),
          },
        });
        if (res.count === 0) {
          throw contentError('ARTICLE_VERSION_CONFLICT', {
            expectedVersion: before.currentVersion,
          });
        }
        const removed = [...prev.translations.keys()].filter((l) => !next.translations.has(l));
        if (removed.length) {
          await tx.articleTranslation.deleteMany({
            where: { articleId: before.id, locale: { in: removed } },
          });
        }
        for (const [locale, t] of next.translations) {
          if (sameTranslation(prev.translations.get(locale), t)) continue;
          await tx.articleTranslation.upsert({
            where: { articleId_locale: { articleId: before.id, locale } },
            create: { articleId: before.id, locale, ...t },
            update: t,
          });
        }
        if (!setsEqual(prev.marketCodes, next.marketCodes)) {
          await tx.articleMarket.deleteMany({ where: { articleId: before.id } });
          await tx.articleMarket.createMany({
            data: next.marketCodes.map((marketCode) => ({ articleId: before.id, marketCode })),
          });
        }
        if (!setsEqual(prev.tagIds, next.tagIds)) {
          await tx.articleTag.deleteMany({ where: { articleId: before.id } });
          await tx.articleTag.createMany({
            data: next.tagIds.map((tagId) => ({ articleId: before.id, tagId })),
          });
        }
        if (!setsEqual(beforeSnap.vehicleLinks, nextSnap.vehicleLinks)) {
          await tx.articleVehicleLink.deleteMany({ where: { articleId: before.id } });
          await tx.articleVehicleLink.createMany({
            data: next.vehicleLinks.map((l) => ({ articleId: before.id, ...l })),
          });
        }
        await tx.articleRevision.create({
          data: {
            articleId: before.id,
            version,
            status: before.status,
            snapshot: nextSnap as unknown as Prisma.InputJsonValue,
            note: ctx.note ?? null,
            restoredFromVersion: ctx.restoredFromVersion ?? null,
            createdById: ctx.userId,
          },
        });
      });
    } catch (err) {
      throw this.mapWriteError(err, next.slug);
    }
    this.audit.annotate({
      entityType: 'article',
      entityId: before.id,
      before: { version: before.currentVersion },
      after: {
        version,
        changedFields: changes.map((c) => c.field),
        ...(ctx.restoredFromVersion ? { restoredFromVersion: ctx.restoredFromVersion } : {}),
      },
    });
    if (before.status === ContentStatus.published) await this.search.sync(before.id);
    return { version, changed: true };
  }

  // --- workflow ------------------------------------------------------------------------

  async transition(
    id: string,
    action: WorkflowAction,
    input: { note?: string; expectedVersion?: number; scheduledAt?: string },
    user: AuthUser,
    lang: SupportedLanguage,
  ): Promise<AdminArticleDto> {
    const perms = permissionsOf(user);
    const a = await this.load(id);
    const decision = decideTransition(action, workflowState(a, user.id), perms);
    if (!decision.ok) {
      if (decision.reason === 'FORBIDDEN') {
        throw new AppException({
          status: HttpStatus.FORBIDDEN,
          code: 'FORBIDDEN',
          details: { missingPermissions: decision.missing },
        });
      }
      throwContent(decision.reason, { status: a.status, action });
    }
    if (input.expectedVersion !== undefined && input.expectedVersion !== a.currentVersion) {
      throwContent('ARTICLE_VERSION_CONFLICT', { currentVersion: a.currentVersion });
    }
    const now = new Date();
    const goingLive = action === 'publish' || action === 'schedule' || action === 'unarchive';
    if (goingLive || action === 'submit') {
      const issues = this.publishIssues(a).filter(
        (i) => goingLive || i.code === 'ORIGINAL_TRANSLATION_MISSING',
      );
      if (issues.length) throwContent('ARTICLE_NOT_PUBLISHABLE', { issues });
    }
    const note = input.note?.trim() || null;
    const approval = decision.implicitApproval
      ? { reviewedAt: now, reviewedById: user.id, reviewNote: note }
      : {};
    let data: Prisma.ArticleUncheckedUpdateManyInput;
    switch (action) {
      case 'submit':
        data = {
          status: ContentStatus.in_review,
          submittedAt: now,
          reviewedAt: null,
          reviewedById: null,
          reviewNote: note,
        };
        break;
      case 'withdraw':
        data = {
          status: ContentStatus.draft,
          reviewedAt: null,
          reviewedById: null,
          reviewNote: note,
        };
        break;
      case 'approve':
        data = { reviewedAt: now, reviewedById: user.id, reviewNote: note };
        break;
      case 'reject':
        data = {
          status: ContentStatus.draft,
          reviewedAt: null,
          reviewedById: user.id,
          reviewNote: note,
        };
        break;
      case 'schedule': {
        const at = new Date(input.scheduledAt ?? '');
        if (
          Number.isNaN(at.getTime()) ||
          at.getTime() < now.getTime() + SCHEDULE_MIN_LEAD_MS ||
          at.getTime() > now.getTime() + SCHEDULE_MAX_AHEAD_MS
        ) {
          throw fieldError('scheduledAt', 'futureDate', {
            ar: 'اختر وقت نشر في المستقبل (خلال سنة).',
            en: 'Choose a publication time in the future (within one year).',
          });
        }
        data = { status: ContentStatus.scheduled, scheduledAt: at, ...approval };
        break;
      }
      case 'unschedule':
        data = { status: ContentStatus.in_review, scheduledAt: null };
        break;
      case 'publish':
        data = {
          status: ContentStatus.published,
          publishedAt: a.publishedAt ?? now,
          scheduledAt: null,
          archivedAt: null,
          ...approval,
        };
        break;
      case 'unpublish':
        data = {
          status: ContentStatus.draft,
          scheduledAt: null,
          archivedAt: null,
          submittedAt: null,
          reviewedAt: null,
          reviewedById: null,
          reviewNote: note,
        };
        break;
      case 'archive':
        data = { status: ContentStatus.archived, archivedAt: now };
        break;
      case 'unarchive':
        data = { status: ContentStatus.published, archivedAt: null };
        break;
    }
    const res = await this.prisma.article.updateMany({
      where: {
        id,
        status: a.status,
        currentVersion: a.currentVersion,
        deletedAt: null,
      },
      data: { ...data, updatedById: user.id },
    });
    if (res.count === 0)
      throwContent('ARTICLE_VERSION_CONFLICT', { currentVersion: a.currentVersion });
    const after = await this.load(id);
    this.audit.annotate({
      action: `articles.${action}`,
      entityType: 'article',
      entityId: id,
      before: { status: a.status, approved: isApproved(a) },
      after: {
        status: after.status,
        approved: isApproved(after),
        scheduledAt: after.scheduledAt?.toISOString() ?? null,
        note,
      },
    });
    await this.afterStatusChange(after, a.status);
    return this.view(after, user, lang);
  }

  /** Search index + events after the public status may have changed. */
  async afterStatusChange(
    a: { id: string; slug: string; status: ContentStatus },
    from: ContentStatus,
  ): Promise<void> {
    if (from === a.status) return;
    if (a.status === ContentStatus.published || from === ContentStatus.published) {
      await this.search.sync(a.id);
    }
    const event: ArticleStatusEvent = { articleId: a.id, slug: a.slug, from, to: a.status };
    if (a.status === ContentStatus.published) this.events.emit(ARTICLE_PUBLISHED_EVENT, event);
    else if (from === ContentStatus.published) this.events.emit(ARTICLE_UNPUBLISHED_EVENT, event);
  }

  // --- delete --------------------------------------------------------------------------

  async remove(id: string): Promise<void> {
    const a = await this.load(id);
    if (a.status === ContentStatus.published || a.status === ContentStatus.scheduled) {
      throwContent('ARTICLE_IS_LIVE', { status: a.status });
    }
    await this.prisma.article.update({ where: { id }, data: { deletedAt: new Date() } });
    this.audit.annotate({
      entityType: 'article',
      entityId: id,
      before: { status: a.status, slug: a.slug, deletedAt: null },
      after: { deleted: true },
    });
    await this.search.sync(id);
  }

  async undelete(id: string, user: AuthUser, lang: SupportedLanguage): Promise<AdminArticleDto> {
    const a = await this.load(id, { includeDeleted: true });
    if (!a.deletedAt) throwContent('ARTICLE_NOT_DELETED');
    await this.prisma.article.update({ where: { id }, data: { deletedAt: null } });
    this.audit.annotate({
      entityType: 'article',
      entityId: id,
      before: { deletedAt: a.deletedAt.toISOString() },
      after: { deletedAt: null },
    });
    await this.search.sync(id);
    return this.get(id, user, lang);
  }

  // --- translations --------------------------------------------------------------------

  /** Human review of a machine translation (articles.review). Creates a version. */
  async markTranslationReviewed(
    id: string,
    locale: string,
    expectedVersion: number,
    user: AuthUser,
    lang: SupportedLanguage,
  ): Promise<AdminArticleDto> {
    const a = await this.load(id);
    if (a.status === ContentStatus.archived) throwContent('ARTICLE_ARCHIVED');
    if (a.currentVersion !== expectedVersion) {
      throwContent('ARTICLE_VERSION_CONFLICT', { currentVersion: a.currentVersion });
    }
    const prev = stateFromRow(a);
    const t = prev.translations.get(locale);
    if (!t) throwContent('ARTICLE_TRANSLATION_NOT_FOUND', { locale });
    if (!t.isMachineTranslated || t.humanReviewedAt) {
      throwContent('ARTICLE_TRANSLATION_NOT_MACHINE', { locale });
    }
    const next = cloneState(prev);
    next.translations.set(locale, {
      ...t,
      humanReviewedAt: new Date(),
      humanReviewedById: user.id,
    });
    await this.persistUpdate(a, prev, next, {
      userId: user.id,
      note: `Machine translation (${locale}) reviewed`,
      keepApproval: true,
    });
    this.audit.annotate({ action: 'articles.translation_reviewed' });
    return this.get(id, user, lang);
  }

  // --- preview -------------------------------------------------------------------------

  async previewToken(id: string, ttlMinutes = 1440): Promise<PreviewTokenDto> {
    const a = await this.load(id);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
    const token = createPreviewToken(previewKey(this.config.auth.accessTokenSecret), {
      articleId: a.id,
      expiresAt,
    });
    const base = this.config.http.publicBaseUrl.replace(/\/+$/, '');
    this.audit.annotate({
      action: 'articles.preview_link',
      entityType: 'article',
      entityId: id,
      after: { expiresAt: expiresAt.toISOString() },
    });
    return {
      token,
      expiresAt: expiresAt.toISOString(),
      url: `${base}/api/v1/articles/preview/${token}`,
    };
  }

  /** Throws unless the id is a UUID (admin routes also validate with UuidParamPipe). */
  static assertId(id: string): void {
    if (!isUuid(id)) throw contentError('ARTICLE_NOT_FOUND');
  }

  /** Valid cover asset ids for an editor picker (latest licensed article images). */
  async recentImages(lang: SupportedLanguage, take = 40) {
    const rows = await this.prisma.mediaAsset.findMany({
      where: { kind: MediaKind.image, deletedAt: null, licenseId: { not: null }, status: 'ready' },
      include: { variants: true, license: true },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows.map((r) => this.media.toView(r, lang)).filter((v) => !!v);
  }
}
