import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../config/app-config';
import { normalizeSearchText } from '../../common/i18n/arabic-normalize';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit';
import { contentError, fieldError } from '../articles/common/content-errors';
import { pickName } from '../articles/common/localized';
import { isUuid, isValidContentSlug, slugFromTexts, uniqueSlug } from '../articles/common/slug';
import { visibleArticleWhere } from '../articles/common/visibility';
import type {
  AdminCategoryDto,
  AdminCategoryQueryDto,
  CreateCategoryDto,
  PublicCategoryDto,
  UpdateCategoryDto,
} from './categories.dto';

const CATEGORY_INCLUDE = {
  translations: true,
  _count: {
    select: {
      articles: true,
      children: true,
      rssFeeds: true,
      notificationSubscriptions: true,
      userInterests: true,
    },
  },
} satisfies Prisma.CategoryInclude;

type CategoryRow = Prisma.CategoryGetPayload<{ include: typeof CATEGORY_INCLUDE }>;
type CategoryWithTranslations = Prisma.CategoryGetPayload<{ include: { translations: true } }>;

function translation(c: CategoryWithTranslations, locale: string) {
  return c.translations.find((t) => t.locale === locale);
}

/** Public / embedded view of a category in `lang` (used by the articles module too). */
export function toCategoryRef(
  c: CategoryWithTranslations,
  lang: SupportedLanguage,
): { id: string; slug: string; name: string } {
  const ar = translation(c, 'ar')?.name;
  const en = translation(c, 'en')?.name;
  return { id: c.id, slug: c.slug, name: pickName(ar, en, lang) ?? c.slug };
}

/**
 * News categories (+ ar/en translations). Seeded categories carry a
 * `systemKey`: they can be renamed or deactivated, never deleted (the
 * reference seed would re-create them). Categories referenced by articles,
 * feeds, subscriptions or interests are deactivated instead of deleted.
 */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- public ---------------------------------------------------------------------

  async listPublic(lang: SupportedLanguage, market: string): Promise<PublicCategoryDto[]> {
    const [rows, counts] = await Promise.all([
      this.prisma.category.findMany({
        where: { isActive: true },
        include: { translations: true },
        orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
      }),
      this.prisma.article.groupBy({
        by: ['categoryId'],
        where: { ...visibleArticleWhere(market), categoryId: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const countOf = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    const active = new Set(rows.map((r) => r.id));
    return (
      rows
        // A child of an inactive parent is hidden with it.
        .filter((r) => !r.parentId || active.has(r.parentId))
        .map((r) => this.toPublic(r, lang, countOf.get(r.id) ?? 0))
    );
  }

  async getPublic(
    slugOrId: string,
    lang: SupportedLanguage,
    market: string,
  ): Promise<PublicCategoryDto> {
    const row = await this.prisma.category.findFirst({
      where: { isActive: true, ...(isUuid(slugOrId) ? { id: slugOrId } : { slug: slugOrId }) },
      include: { translations: true, parent: { select: { isActive: true } } },
    });
    if (!row || (row.parent && !row.parent.isActive)) throw contentError('CATEGORY_NOT_FOUND');
    const count = await this.prisma.article.count({
      where: { ...visibleArticleWhere(market), categoryId: row.id },
    });
    return this.toPublic(row, lang, count);
  }

  private toPublic(
    c: CategoryWithTranslations,
    lang: SupportedLanguage,
    articleCount: number,
  ): PublicCategoryDto {
    const ar = translation(c, 'ar');
    const en = translation(c, 'en');
    const localized = lang === 'en' ? (en ?? ar) : (ar ?? en);
    return {
      id: c.id,
      slug: c.slug,
      name: pickName(ar?.name, en?.name, lang) ?? c.slug,
      nameAr: ar?.name ?? en?.name ?? c.slug,
      nameEn: en?.name ?? ar?.name ?? c.slug,
      description: localized?.description ?? null,
      parentId: c.parentId,
      defaultArticleType: c.defaultArticleType,
      sortOrder: c.sortOrder,
      articleCount,
      isDemo: c.isDemo,
    };
  }

  // --- admin ----------------------------------------------------------------------

  private toAdmin(c: CategoryRow): AdminCategoryDto {
    const ar = translation(c, 'ar');
    const en = translation(c, 'en');
    return {
      id: c.id,
      slug: c.slug,
      systemKey: c.systemKey,
      nameAr: ar?.name ?? '',
      nameEn: en?.name ?? '',
      descriptionAr: ar?.description ?? null,
      descriptionEn: en?.description ?? null,
      parentId: c.parentId,
      defaultArticleType: c.defaultArticleType,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      isDemo: c.isDemo,
      usage: { ...c._count },
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }

  async listAdmin(query: AdminCategoryQueryDto): Promise<AdminCategoryDto[]> {
    const where: Prisma.CategoryWhereInput = {};
    if (query.active) where.isActive = query.active === 'true';
    const rows = await this.prisma.category.findMany({
      where,
      include: CATEGORY_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    });
    let views = rows.map((r) => this.toAdmin(r));
    if (query.q) {
      const q = normalizeSearchText(query.q);
      views = views.filter((v) =>
        [v.slug, v.nameAr, v.nameEn].some((s) => normalizeSearchText(s).includes(q)),
      );
    }
    return views;
  }

  private async load(id: string): Promise<CategoryRow> {
    const row = await this.prisma.category.findUnique({
      where: { id },
      include: CATEGORY_INCLUDE,
    });
    if (!row) throw contentError('CATEGORY_NOT_FOUND');
    return row;
  }

  getAdmin(id: string): Promise<AdminCategoryDto> {
    return this.load(id).then((r) => this.toAdmin(r));
  }

  private assertSlug(slug: string): void {
    if (!isValidContentSlug(slug, 120)) {
      throw fieldError('slug', 'slug', {
        ar: 'استخدم حروفًا صغيرة وأرقامًا وشرطات فقط.',
        en: 'Use lower-case letters, digits and single hyphens only.',
      });
    }
  }

  private async slugTaken(slug: string, exceptId?: string): Promise<boolean> {
    const row = await this.prisma.category.findUnique({ where: { slug }, select: { id: true } });
    return !!row && row.id !== exceptId;
  }

  /**
   * The tree has two levels (root + children): the parent must exist, be a
   * root and not be the category itself; a category with children stays a root.
   */
  private async assertParent(parentId: string | null, selfId?: string): Promise<void> {
    if (!parentId) return;
    const invalid = () => contentError('CATEGORY_PARENT_INVALID', { parentId });
    if (parentId === selfId) throw invalid();
    const parent = await this.prisma.category.findUnique({
      where: { id: parentId },
      select: { id: true, parentId: true },
    });
    if (!parent) throw invalid();
    if (parent.parentId) throw invalid();
    if (selfId && (await this.prisma.category.count({ where: { parentId: selfId } })) > 0) {
      throw invalid();
    }
  }

  async create(dto: CreateCategoryDto): Promise<AdminCategoryDto> {
    let slug = dto.slug?.trim().toLowerCase();
    if (slug) {
      this.assertSlug(slug);
      if (await this.slugTaken(slug)) throw contentError('CATEGORY_SLUG_TAKEN', { slug });
    } else {
      slug = await uniqueSlug(slugFromTexts([dto.nameEn, dto.nameAr]), (s) => this.slugTaken(s));
    }
    await this.assertParent(dto.parentId ?? null);
    const created = await this.prisma.category.create({
      data: {
        slug,
        parentId: dto.parentId ?? null,
        defaultArticleType: dto.defaultArticleType ?? null,
        sortOrder: dto.sortOrder ?? 100,
        isActive: dto.isActive ?? true,
        translations: {
          create: [
            { locale: 'ar', name: dto.nameAr, description: dto.descriptionAr?.trim() || null },
            { locale: 'en', name: dto.nameEn, description: dto.descriptionEn?.trim() || null },
          ],
        },
      },
      include: CATEGORY_INCLUDE,
    });
    const view = this.toAdmin(created);
    this.audit.annotate({ entityType: 'category', entityId: created.id, after: view });
    return view;
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<AdminCategoryDto> {
    const before = await this.load(id);
    const data: Prisma.CategoryUpdateInput = {};
    if (dto.slug !== undefined) {
      const slug = dto.slug.trim().toLowerCase();
      if (slug !== before.slug) {
        this.assertSlug(slug);
        if (await this.slugTaken(slug, id)) throw contentError('CATEGORY_SLUG_TAKEN', { slug });
        data.slug = slug;
      }
    }
    if (dto.parentId !== undefined) {
      await this.assertParent(dto.parentId, id);
      data.parent = dto.parentId ? { connect: { id: dto.parentId } } : { disconnect: true };
    }
    if (dto.defaultArticleType !== undefined) data.defaultArticleType = dto.defaultArticleType;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const texts: Array<{ locale: 'ar' | 'en'; name?: string; description?: string | null }> = [
      { locale: 'ar', name: dto.nameAr, description: dto.descriptionAr },
      { locale: 'en', name: dto.nameEn, description: dto.descriptionEn },
    ];
    const updated = await this.prisma.$transaction(async (tx) => {
      for (const t of texts) {
        if (t.name === undefined && t.description === undefined) continue;
        const existing = translation(before, t.locale);
        const description = t.description === undefined ? undefined : t.description?.trim() || null;
        if (existing) {
          await tx.categoryTranslation.update({
            where: { id: existing.id },
            data: {
              ...(t.name !== undefined ? { name: t.name } : {}),
              ...(description !== undefined ? { description } : {}),
            },
          });
        } else {
          await tx.categoryTranslation.create({
            data: {
              categoryId: id,
              locale: t.locale,
              name: t.name ?? before.slug,
              description: description ?? null,
            },
          });
        }
      }
      return tx.category.update({ where: { id }, data, include: CATEGORY_INCLUDE });
    });
    const view = this.toAdmin(updated);
    this.audit.annotate({
      entityType: 'category',
      entityId: id,
      before: this.toAdmin(before),
      after: view,
    });
    return view;
  }

  async remove(id: string): Promise<void> {
    const row = await this.load(id);
    if (row.systemKey) throw contentError('CATEGORY_IS_SYSTEM', { systemKey: row.systemKey });
    const usage = row._count;
    const total = Object.values(usage).reduce((s, n) => s + n, 0);
    if (total > 0) throw contentError('CATEGORY_IN_USE', { usage });
    this.audit.annotate({ entityType: 'category', entityId: id, before: this.toAdmin(row) });
    try {
      await this.prisma.category.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw contentError('CATEGORY_IN_USE', { usage });
      }
      throw err;
    }
  }
}
