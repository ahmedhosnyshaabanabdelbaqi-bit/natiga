import { HttpStatus, Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { toPageRequest } from '../../../common/http/pagination';
import { paginated, type PaginatedResponse } from '../../../common/http/responses';
import { normalizeSearchText } from '../../../common/i18n/arabic-normalize';
import { AppException } from '../../../common/errors/app.exception';
import { ContentStatus, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { isValidContentSlug, slugFromTexts, uniqueSlug } from '../../articles/common/slug';
import { prepareArticleHtml } from '../../articles/domain/article-html';
import { ArticleMediaService } from '../../articles/services/article-media.service';
import { AuditService } from '../../audit';
import { MediaUrlService } from '../../vehicles';
import { conflict, fieldError, fieldErrors, notFound } from '../../search/common/discovery-http';
import { escapeLike } from '../../search/common/text-match';
import { ATTESTATION_TEXT, REVIEW_CHECKLIST, UNSAFE_PHRASES } from '../common/encyclopedia-rules';
import type {
  AdminCategoryViewDto,
  AdminEntryQueryDto,
  AdminEntryViewDto,
  CreateCategoryDto,
  CreateEntryDto,
  EntryTranslationInputDto,
  EntryTranslationsDto,
  RejectEntryDto,
  TechnicalReviewDto,
  UpdateCategoryDto,
  UpdateEntryDto,
} from '../dto/encyclopedia.dto';

const ADMIN_INCLUDE = { translations: true } satisfies Prisma.EncyclopediaEntryInclude;
type AdminRow = Prisma.EncyclopediaEntryGetPayload<{ include: typeof ADMIN_INCLUDE }>;

export const REVIEW_AUDIT_ACTION = 'encyclopedia.technical_review';

const ENTRY_NOT_FOUND = { ar: 'مادة الموسوعة غير موجودة.', en: 'Encyclopedia entry not found.' };

function invalidTransition(action: string, status: string) {
  return conflict(
    'ENCYCLOPEDIA_INVALID_TRANSITION',
    {
      ar: 'لا يمكن تنفيذ هذا الإجراء في الحالة الحالية للمادة.',
      en: 'This action is not possible in the entry’s current status.',
    },
    { action, status },
  );
}

type Actor = { id: string };

/**
 * Admin encyclopedia (REQUIREMENTS §15): entries CRUD and the review
 * workflow
 *   draft --submit--> in_review --review (checklist + attestation)--> in_review (approved)
 *   in_review --publish (encyclopedia.publish, needs approval)--> published
 *   in_review --reject (note)--> draft;  published --unpublish--> draft;  * --archive--> archived
 * Content can only be edited in `draft`: any change after an approval
 * requires a new technical review (unpublish / reject first). The reviewer
 * cannot be the author. The checklist + attestation are stored in the audit
 * record of the review action.
 */
interface TranslationData {
  locale: string;
  title: string;
  summary: string | null;
  bodyHtml: string;
  bodyText: string;
}

@Injectable()
export class EncyclopediaAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaUrlService,
    private readonly articleMedia: ArticleMediaService,
  ) {}

  // --- entries --------------------------------------------------------------------------

  async list(q: AdminEntryQueryDto): Promise<PaginatedResponse<AdminEntryViewDto>> {
    const page = toPageRequest(q);
    const and: Prisma.EncyclopediaEntryWhereInput[] = [{ deletedAt: null }];
    if (q.status) and.push({ status: q.status });
    if (q.category) and.push({ categoryKey: q.category });
    if (q.q) {
      const n = `%${escapeLike(normalizeSearchText(q.q))}%`;
      const ids = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT t."entry_id"::text AS id FROM "encyclopedia_entry_translations" t
         WHERE app_normalize_text(t."title") LIKE ${n}`;
      and.push({
        OR: [{ id: { in: ids.map((r) => r.id) } }, { slug: { contains: q.q.toLowerCase() } }],
      });
    }
    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.encyclopediaEntry.findMany({
        where,
        include: ADMIN_INCLUDE,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.encyclopediaEntry.count({ where }),
    ]);
    const checklists = await this.checklists(rows.map((r) => r.id));
    return paginated(
      rows.map((r) => this.view(r, checklists.get(r.id) ?? null)),
      total,
      page,
    );
  }

  async get(id: string): Promise<AdminEntryViewDto> {
    const row = await this.find(id);
    return this.view(row, (await this.checklists([id])).get(id) ?? null);
  }

  async create(dto: CreateEntryDto, actor: Actor): Promise<AdminEntryViewDto> {
    const translations = this.translationsInput(dto.translations, true);
    const prepared = await this.prepareTranslations(translations);
    await this.checkCategory(dto.categoryKey);
    await this.checkCover(dto.coverAssetId ?? null);
    const slug = await this.slugFor(
      dto.slug,
      [translations.en?.title, translations.ar?.title],
      null,
    );
    const row = await this.prisma.encyclopediaEntry.create({
      data: {
        slug,
        categoryKey: dto.categoryKey,
        sortOrder: dto.sortOrder ?? 0,
        coverAssetId: dto.coverAssetId ?? null,
        createdById: actor.id,
        status: ContentStatus.draft,
        translations: {
          create: [...prepared.values()],
        },
      },
      include: ADMIN_INCLUDE,
    });
    const view = this.view(row, null);
    this.audit.annotate({ entityId: row.id, after: view });
    return view;
  }

  async update(id: string, dto: UpdateEntryDto): Promise<AdminEntryViewDto> {
    const current = await this.find(id);
    const contentChange =
      dto.translations !== undefined || dto.categoryKey !== undefined || dto.slug !== undefined;
    if (contentChange && current.status !== ContentStatus.draft) {
      throw conflict(
        'ENCYCLOPEDIA_ENTRY_LOCKED',
        {
          ar: 'لا يمكن تعديل محتوى مادة قيد المراجعة أو منشورة؛ أعدها إلى المسودة أولًا (ستحتاج مراجعة تقنية جديدة).',
          en: 'Content of an entry in review or published cannot be changed; move it back to draft first (a new technical review is required).',
        },
        { status: current.status },
      );
    }
    const prepared = dto.translations
      ? await this.prepareTranslations(this.translationsInput(dto.translations, false))
      : new Map<string, TranslationData>();
    if (dto.categoryKey) await this.checkCategory(dto.categoryKey);
    if (dto.coverAssetId !== undefined) await this.checkCover(dto.coverAssetId);
    const data: Prisma.EncyclopediaEntryUpdateInput = {};
    if (dto.slug !== undefined) data.slug = await this.slugFor(dto.slug, [], id);
    if (dto.categoryKey !== undefined) data.category = { connect: { key: dto.categoryKey } };
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.coverAssetId !== undefined) {
      data.coverAsset = dto.coverAssetId
        ? { connect: { id: dto.coverAssetId } }
        : { disconnect: true };
    }
    await this.prisma.$transaction(async (tx) => {
      if (dto.translations) {
        const remaining = new Set(current.translations.map((t) => t.locale));
        for (const locale of ['ar', 'en'] as const) {
          const value = dto.translations[locale];
          if (value === undefined) continue;
          if (value === null) {
            remaining.delete(locale);
            await tx.encyclopediaEntryTranslation.deleteMany({ where: { entryId: id, locale } });
          } else {
            remaining.add(locale);
            const d = prepared.get(locale)!;
            await tx.encyclopediaEntryTranslation.upsert({
              where: { entryId_locale: { entryId: id, locale } },
              create: { entryId: id, ...d },
              update: d,
            });
          }
        }
        if (remaining.size === 0) {
          throw fieldError('translations', 'atLeastOne', {
            ar: 'يجب أن تبقى ترجمة واحدة على الأقل.',
            en: 'At least one translation must remain.',
          });
        }
      }
      await tx.encyclopediaEntry.update({ where: { id }, data });
    });
    const after = await this.get(id);
    this.audit.annotate({ entityId: id, before: this.view(current, null), after });
    return after;
  }

  async remove(id: string): Promise<void> {
    const current = await this.find(id);
    if (current.status === ContentStatus.published) {
      throw invalidTransition('delete', current.status);
    }
    await this.prisma.encyclopediaEntry.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    this.audit.annotate({ entityId: id, before: this.view(current, null) });
  }

  async submit(id: string): Promise<AdminEntryViewDto> {
    const row = await this.find(id);
    if (row.status !== ContentStatus.draft) throw invalidTransition('submit', row.status);
    this.assertComplete(row);
    this.assertSafe(row);
    return this.transition(row, 'submit', {
      status: ContentStatus.in_review,
      technicalReviewedAt: null,
      technicalReviewedBy: { disconnect: true },
    });
  }

  async review(id: string, dto: TechnicalReviewDto, actor: Actor): Promise<AdminEntryViewDto> {
    const row = await this.find(id);
    if (row.status !== ContentStatus.in_review) throw invalidTransition('review', row.status);
    if (row.createdById && row.createdById === actor.id) {
      throw conflict('ENCYCLOPEDIA_SELF_REVIEW', {
        ar: 'لا يمكن لكاتب المادة مراجعتها تقنيًا؛ يلزم مراجع آخر.',
        en: 'The author cannot technically review their own entry; another reviewer is required.',
      });
    }
    const missing = REVIEW_CHECKLIST.filter(
      (k) => (dto.checklist as unknown as Record<string, boolean>)[k] !== true,
    );
    if (missing.length > 0) {
      throw fieldErrors(
        missing.map((k) => ({
          field: `checklist.${k}`,
          rule: 'mustBeConfirmed',
          message: {
            ar: 'يجب تأكيد كل بند في قائمة المراجعة قبل الاعتماد.',
            en: 'Every checklist item must be confirmed before approval.',
          },
        })),
      );
    }
    this.assertSafe(row);
    const now = new Date();
    const updated = await this.prisma.encyclopediaEntry.update({
      where: { id },
      data: {
        technicalReviewedAt: now,
        technicalReviewedBy: { connect: { id: actor.id } },
        reviewNote: dto.note ?? null,
      },
      include: ADMIN_INCLUDE,
    });
    const checklist = Object.fromEntries(REVIEW_CHECKLIST.map((k) => [k, true]));
    this.audit.annotate({
      action: REVIEW_AUDIT_ACTION,
      entityId: id,
      after: {
        checklist,
        attestation: true,
        attestationText: ATTESTATION_TEXT,
        note: dto.note ?? null,
        reviewedAt: now.toISOString(),
      },
    });
    return this.view(updated, checklist);
  }

  async reject(id: string, dto: RejectEntryDto): Promise<AdminEntryViewDto> {
    const row = await this.find(id);
    if (row.status !== ContentStatus.in_review) throw invalidTransition('reject', row.status);
    return this.transition(row, 'reject', {
      status: ContentStatus.draft,
      reviewNote: dto.note,
      technicalReviewedAt: null,
      technicalReviewedBy: { disconnect: true },
    });
  }

  async publish(id: string): Promise<AdminEntryViewDto> {
    const row = await this.find(id);
    if (row.status !== ContentStatus.in_review) throw invalidTransition('publish', row.status);
    if (!row.technicalReviewedAt) {
      throw conflict('ENCYCLOPEDIA_REVIEW_REQUIRED', {
        ar: 'لا يمكن النشر قبل اكتمال المراجعة التقنية.',
        en: 'The entry cannot be published before its technical review is complete.',
      });
    }
    this.assertComplete(row);
    this.assertSafe(row);
    const now = new Date();
    const wasPublished = row.publishedAt !== null;
    return this.transition(row, 'publish', {
      status: ContentStatus.published,
      publishedAt: row.publishedAt ?? now,
      contentUpdatedAt: wasPublished ? now : row.contentUpdatedAt,
    });
  }

  async unpublish(id: string): Promise<AdminEntryViewDto> {
    const row = await this.find(id);
    if (row.status !== ContentStatus.published && row.status !== ContentStatus.archived) {
      throw invalidTransition('unpublish', row.status);
    }
    return this.transition(row, 'unpublish', {
      status: ContentStatus.draft,
      technicalReviewedAt: null,
      technicalReviewedBy: { disconnect: true },
    });
  }

  async archive(id: string): Promise<AdminEntryViewDto> {
    const row = await this.find(id);
    if (row.status === ContentStatus.archived) throw invalidTransition('archive', row.status);
    return this.transition(row, 'archive', { status: ContentStatus.archived });
  }

  // --- categories -----------------------------------------------------------------------

  async categories(): Promise<AdminCategoryViewDto[]> {
    const [cats, counts] = await Promise.all([
      this.prisma.encyclopediaCategory.findMany({
        orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      }),
      this.prisma.encyclopediaEntry.groupBy({
        by: ['categoryKey'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
    ]);
    const byKey = new Map(counts.map((c) => [c.categoryKey, c._count._all]));
    return cats.map((c) => ({
      key: c.key,
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      descriptionAr: c.descriptionAr,
      descriptionEn: c.descriptionEn,
      iconKey: c.iconKey,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      isSystem: c.isSystem,
      entryCount: byKey.get(c.key) ?? 0,
    }));
  }

  async createCategory(dto: CreateCategoryDto): Promise<AdminCategoryViewDto> {
    const exists = await this.prisma.encyclopediaCategory.findUnique({ where: { key: dto.key } });
    if (exists) {
      throw conflict('ENCYCLOPEDIA_CATEGORY_EXISTS', {
        ar: 'يوجد تصنيف بهذا المفتاح.',
        en: 'A category with this key already exists.',
      });
    }
    await this.prisma.encyclopediaCategory.create({
      data: {
        key: dto.key,
        nameAr: dto.nameAr,
        nameEn: dto.nameEn,
        descriptionAr: dto.descriptionAr ?? null,
        descriptionEn: dto.descriptionEn ?? null,
        iconKey: dto.iconKey ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
        isSystem: false,
      },
    });
    const view = (await this.categories()).find((c) => c.key === dto.key)!;
    this.audit.annotate({ entityId: dto.key, after: view });
    return view;
  }

  async updateCategory(key: string, dto: UpdateCategoryDto): Promise<AdminCategoryViewDto> {
    const before = (await this.categories()).find((c) => c.key === key);
    if (!before) throw this.categoryNotFound();
    await this.prisma.encyclopediaCategory.update({
      where: { key },
      data: {
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
        ...(dto.descriptionAr !== undefined ? { descriptionAr: dto.descriptionAr } : {}),
        ...(dto.descriptionEn !== undefined ? { descriptionEn: dto.descriptionEn } : {}),
        ...(dto.iconKey !== undefined ? { iconKey: dto.iconKey } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    const after = (await this.categories()).find((c) => c.key === key)!;
    this.audit.annotate({ entityId: key, before, after });
    return after;
  }

  async removeCategory(key: string): Promise<void> {
    const before = (await this.categories()).find((c) => c.key === key);
    if (!before) throw this.categoryNotFound();
    if (before.isSystem) {
      throw conflict('ENCYCLOPEDIA_CATEGORY_IS_SYSTEM', {
        ar: 'التصنيفات الأساسية لا تُحذف؛ عطّلها بدلًا من ذلك.',
        en: 'System categories cannot be deleted; deactivate it instead.',
      });
    }
    const used = await this.prisma.encyclopediaEntry.count({ where: { categoryKey: key } });
    if (used > 0) {
      throw conflict(
        'ENCYCLOPEDIA_CATEGORY_IN_USE',
        {
          ar: 'التصنيف مستخدم في مواد؛ انقلها أو عطّل التصنيف.',
          en: 'The category has entries; move them or deactivate the category.',
        },
        { entries: used },
      );
    }
    await this.prisma.encyclopediaCategory.delete({ where: { key } });
    this.audit.annotate({ entityId: key, before });
  }

  // --- helpers --------------------------------------------------------------------------

  private categoryNotFound() {
    return notFound('ENCYCLOPEDIA_CATEGORY_NOT_FOUND', {
      ar: 'التصنيف غير موجود.',
      en: 'Category not found.',
    });
  }

  private async find(id: string): Promise<AdminRow> {
    const row = await this.prisma.encyclopediaEntry.findFirst({
      where: { id, deletedAt: null },
      include: ADMIN_INCLUDE,
    });
    if (!row) throw notFound('ENCYCLOPEDIA_ENTRY_NOT_FOUND', ENTRY_NOT_FOUND);
    return row;
  }

  private async transition(
    row: AdminRow,
    action: string,
    data: Prisma.EncyclopediaEntryUpdateInput,
  ): Promise<AdminEntryViewDto> {
    const updated = await this.prisma.encyclopediaEntry.update({
      where: { id: row.id },
      data,
      include: ADMIN_INCLUDE,
    });
    const checklist = (await this.checklists([row.id])).get(row.id) ?? null;
    const view = this.view(updated, updated.technicalReviewedAt ? checklist : null);
    this.audit.annotate({
      action: `encyclopedia.${action}`,
      entityId: row.id,
      before: { status: row.status },
      after: { status: updated.status },
    });
    return view;
  }

  /** Last approval checklist per entry (from the audit log). */
  private async checklists(ids: string[]): Promise<Map<string, Record<string, boolean>>> {
    if (ids.length === 0) return new Map();
    const logs = await this.prisma.auditLog.findMany({
      where: { action: REVIEW_AUDIT_ACTION, entityId: { in: ids } },
      orderBy: { createdAt: 'desc' },
      select: { entityId: true, after: true },
    });
    const out = new Map<string, Record<string, boolean>>();
    for (const l of logs) {
      if (!l.entityId || out.has(l.entityId)) continue;
      const after = l.after as { checklist?: Record<string, boolean> } | null;
      if (after?.checklist) out.set(l.entityId, after.checklist);
    }
    return out;
  }

  private view(row: AdminRow, checklist: Record<string, boolean> | null): AdminEntryViewDto {
    const s = row.status;
    const allowed: string[] = [];
    if (s === ContentStatus.draft) allowed.push('edit', 'submit', 'archive', 'delete');
    if (s === ContentStatus.in_review) {
      allowed.push('review', 'reject', 'archive');
      if (row.technicalReviewedAt) allowed.push('publish');
    }
    if (s === ContentStatus.published) allowed.push('unpublish', 'archive');
    if (s === ContentStatus.archived) allowed.push('unpublish', 'delete');
    return {
      id: row.id,
      slug: row.slug,
      categoryKey: row.categoryKey,
      status: row.status,
      sortOrder: row.sortOrder,
      coverAssetId: row.coverAssetId,
      translations: row.translations
        .map((t) => ({
          locale: t.locale,
          title: t.title,
          summary: t.summary,
          bodyHtml: t.bodyHtml,
        }))
        .sort((a, b) => a.locale.localeCompare(b.locale)),
      review: {
        reviewedAt: row.technicalReviewedAt?.toISOString() ?? null,
        reviewedById: row.technicalReviewedById,
        checklist: row.technicalReviewedAt ? checklist : null,
        note: row.reviewNote,
      },
      publishedAt: row.publishedAt?.toISOString() ?? null,
      contentUpdatedAt: row.contentUpdatedAt?.toISOString() ?? null,
      isDemo: row.isDemo,
      createdById: row.createdById,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      allowedActions: allowed,
    };
  }

  private translationsInput(t: EntryTranslationsDto, requireOne: boolean) {
    const out: Partial<Record<SupportedLanguage, EntryTranslationInputDto>> = {};
    for (const locale of ['ar', 'en'] as const) {
      const v = t[locale];
      if (!v) continue;
      out[locale] = v;
    }
    if (requireOne && Object.keys(out).length === 0) {
      throw fieldError('translations', 'atLeastOne', {
        ar: 'أضف ترجمة عربية أو إنجليزية واحدة على الأقل.',
        en: 'Add at least one Arabic or English translation.',
      });
    }
    return out;
  }

  /**
   * Same HTML policy as articles (review 3, finding 4): embeds limited to
   * youtube-nocookie / Vimeo players (YouTube rewritten to nocookie) and every
   * inline image must be a ready, licensed media-library image, so no
   * third-party host sees readers (tracking pixels) and no unlicensed image is
   * published. Refuses with 422 instead of silently dropping content.
   */
  private async prepareTranslations(
    input: Partial<Record<SupportedLanguage, EntryTranslationInputDto>>,
  ): Promise<Map<string, TranslationData>> {
    const out = new Map<string, TranslationData>();
    const images: string[] = [];
    const embeds: string[] = [];
    for (const [locale, t] of Object.entries(input)) {
      if (!t) continue;
      const html = prepareArticleHtml(t.bodyHtml, {
        mediaOrigins: this.articleMedia.mediaOrigins(),
      });
      images.push(...html.imageSources);
      embeds.push(...html.rejectedEmbeds);
      out.set(locale, {
        locale,
        title: t.title,
        summary: t.summary ?? null,
        bodyHtml: html.html,
        bodyText: html.text,
      });
    }
    if (embeds.length) {
      throw new AppException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: 'ENCYCLOPEDIA_EMBED_NOT_ALLOWED',
        message: {
          ar: 'يُسمح فقط بتضمين فيديو من YouTube أو Vimeo.',
          en: 'Only YouTube or Vimeo video players can be embedded.',
        },
        details: { embeds: [...new Set(embeds)] },
      });
    }
    const bad = await this.articleMedia.unlicensedImages(images);
    if (bad.length) {
      throw new AppException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: 'ENCYCLOPEDIA_IMAGE_NOT_LICENSED',
        message: {
          ar: 'كل صورة داخل النص يجب أن تكون من مكتبة الوسائط ومعها ترخيص.',
          en: 'Every inline image must be a licensed image of the media library.',
        },
        details: { images: bad },
      });
    }
    return out;
  }

  private async slugFor(
    requested: string | undefined,
    texts: (string | undefined)[],
    selfId: string | null,
  ): Promise<string> {
    const taken = async (slug: string) =>
      !!(await this.prisma.encyclopediaEntry.findFirst({
        where: { slug, ...(selfId ? { id: { not: selfId } } : {}) },
        select: { id: true },
      }));
    if (requested !== undefined) {
      const slug = requested.toLowerCase();
      if (!isValidContentSlug(slug)) {
        throw fieldError('slug', 'slug', {
          ar: 'الرابط المختصر غير صالح (حروف صغيرة وأرقام وشرطات).',
          en: 'Invalid slug (lower-case letters, digits and dashes).',
        });
      }
      if (await taken(slug)) {
        throw conflict('ENCYCLOPEDIA_SLUG_TAKEN', {
          ar: 'الرابط المختصر مستخدم.',
          en: 'This slug is already used.',
        });
      }
      return slug;
    }
    return uniqueSlug(slugFromTexts(texts), taken);
  }

  private async checkCategory(key: string): Promise<void> {
    const c = await this.prisma.encyclopediaCategory.findUnique({ where: { key } });
    if (!c) {
      throw fieldError('categoryKey', 'exists', {
        ar: 'التصنيف غير موجود.',
        en: 'Unknown category.',
      });
    }
  }

  private async checkCover(assetId: string | null): Promise<void> {
    if (!assetId) return;
    const a = await this.prisma.mediaAsset.findUnique({ where: { id: assetId } });
    if (!a || !this.media.isPublishable(a)) {
      throw fieldError('coverAssetId', 'licensedReadyImage', {
        ar: 'الصورة يجب أن تكون جاهزة ومسجلة الترخيص.',
        en: 'The cover must be a processed image with a recorded licence.',
      });
    }
  }

  private assertComplete(row: AdminRow): void {
    const ok = row.translations.some((t) => t.title.trim() && (t.bodyText ?? '').trim());
    if (!ok) {
      throw fieldError('translations', 'bodyRequired', {
        ar: 'المادة تحتاج عنوانًا ونصًا في لغة واحدة على الأقل.',
        en: 'The entry needs a title and body in at least one language.',
      });
    }
  }

  /** Blocks obviously unsafe electrical instructions (the human checklist is the real control). */
  private assertSafe(row: AdminRow): void {
    const hits = new Set<string>();
    for (const t of row.translations) {
      const hay = normalizeSearchText([t.title, t.summary, t.bodyText].filter(Boolean).join(' '));
      for (const phrase of UNSAFE_PHRASES) {
        if (hay.includes(normalizeSearchText(phrase))) hits.add(phrase);
      }
    }
    if (hits.size > 0) {
      throw fieldError('translations', 'unsafeElectricalInstructions', {
        ar: `المادة تحتوي على تعليمات غير آمنة: ${[...hits].join('، ')}`,
        en: `The entry contains unsafe instructions: ${[...hits].join(', ')}`,
      });
    }
  }
}
