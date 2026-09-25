import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../config/app-config';
import { toPageRequest } from '../../common/http/pagination';
import { paginated, type PaginatedResponse } from '../../common/http/responses';
import { normalizeSearchText } from '../../common/i18n/arabic-normalize';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit';
import { contentError, fieldError } from '../articles/common/content-errors';
import { pickName } from '../articles/common/localized';
import { isUuid, isValidContentSlug, slugFromTexts, uniqueSlug } from '../articles/common/slug';
import { visibleArticleWhere } from '../articles/common/visibility';
import type {
  AdminTagDto,
  AdminTagQueryDto,
  CreateTagDto,
  PublicTagDto,
  PublicTagQueryDto,
  UpdateTagDto,
} from './tags.dto';

type TagWithTranslations = Prisma.TagGetPayload<{ include: { translations: true } }>;

function names(t: TagWithTranslations): { ar: string | null; en: string | null } {
  return {
    ar: t.translations.find((x) => x.locale === 'ar')?.name ?? null,
    en: t.translations.find((x) => x.locale === 'en')?.name ?? null,
  };
}

/** Embedded view of a tag in `lang` (used by the articles module). */
export function toTagRef(
  t: TagWithTranslations,
  lang: SupportedLanguage,
): { id: string; slug: string; name: string } {
  const n = names(t);
  return { id: t.id, slug: t.slug, name: pickName(n.ar, n.en, lang) ?? t.slug };
}

function matches(t: TagWithTranslations, q: string | undefined): boolean {
  if (!q) return true;
  const needle = normalizeSearchText(q);
  const n = names(t);
  return [t.slug, n.ar, n.en].some((s) => !!s && normalizeSearchText(s).includes(needle));
}

/**
 * Article tags (+ ar/en names; at least one name). Public lists only show
 * tags used by visible articles; admins can merge duplicates and delete
 * unused tags (or force-remove a tag from its articles).
 */
@Injectable()
export class TagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- public ---------------------------------------------------------------------

  private toPublic(t: TagWithTranslations, lang: SupportedLanguage, count: number): PublicTagDto {
    const n = names(t);
    return {
      id: t.id,
      slug: t.slug,
      name: pickName(n.ar, n.en, lang) ?? t.slug,
      nameAr: n.ar,
      nameEn: n.en,
      articleCount: count,
      isDemo: t.isDemo,
    };
  }

  async listPublic(
    query: PublicTagQueryDto,
    lang: SupportedLanguage,
    market: string,
  ): Promise<PaginatedResponse<PublicTagDto>> {
    const page = toPageRequest(query);
    const counts = await this.prisma.articleTag.groupBy({
      by: ['tagId'],
      where: { article: visibleArticleWhere(market) },
      _count: { _all: true },
    });
    const countOf = new Map(counts.map((c) => [c.tagId, c._count._all]));
    const tags = await this.prisma.tag.findMany({
      where: { id: { in: [...countOf.keys()] } },
      include: { translations: true },
    });
    const filtered = tags
      .filter((t) => matches(t, query.q))
      .map((t) => this.toPublic(t, lang, countOf.get(t.id) ?? 0))
      .sort((a, b) => b.articleCount - a.articleCount || a.slug.localeCompare(b.slug));
    return paginated(filtered.slice(page.skip, page.skip + page.take), filtered.length, page);
  }

  async getPublic(
    slugOrId: string,
    lang: SupportedLanguage,
    market: string,
  ): Promise<PublicTagDto> {
    const tag = await this.prisma.tag.findFirst({
      where: isUuid(slugOrId) ? { id: slugOrId } : { slug: slugOrId },
      include: { translations: true },
    });
    if (!tag) throw contentError('TAG_NOT_FOUND');
    const count = await this.prisma.articleTag.count({
      where: { tagId: tag.id, article: visibleArticleWhere(market) },
    });
    return this.toPublic(tag, lang, count);
  }

  // --- admin ----------------------------------------------------------------------

  private async adminView(t: TagWithTranslations, count?: number): Promise<AdminTagDto> {
    const n = names(t);
    return {
      id: t.id,
      slug: t.slug,
      nameAr: n.ar,
      nameEn: n.en,
      articleCount: count ?? (await this.prisma.articleTag.count({ where: { tagId: t.id } })),
      isDemo: t.isDemo,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }

  async listAdmin(query: AdminTagQueryDto): Promise<PaginatedResponse<AdminTagDto>> {
    const page = toPageRequest(query);
    const [tags, counts] = await Promise.all([
      this.prisma.tag.findMany({ include: { translations: true } }),
      this.prisma.articleTag.groupBy({ by: ['tagId'], _count: { _all: true } }),
    ]);
    const countOf = new Map(counts.map((c) => [c.tagId, c._count._all]));
    const views = await Promise.all(
      tags.filter((t) => matches(t, query.q)).map((t) => this.adminView(t, countOf.get(t.id) ?? 0)),
    );
    const sort = query.sort ?? 'name';
    views.sort((a, b) => {
      if (sort === 'usage') return b.articleCount - a.articleCount || a.slug.localeCompare(b.slug);
      if (sort === 'created') return b.createdAt.localeCompare(a.createdAt);
      return (a.nameEn ?? a.nameAr ?? a.slug).localeCompare(b.nameEn ?? b.nameAr ?? b.slug);
    });
    return paginated(views.slice(page.skip, page.skip + page.take), views.length, page);
  }

  private async load(id: string): Promise<TagWithTranslations> {
    const tag = await this.prisma.tag.findUnique({
      where: { id },
      include: { translations: true },
    });
    if (!tag) throw contentError('TAG_NOT_FOUND');
    return tag;
  }

  async getAdmin(id: string): Promise<AdminTagDto> {
    return this.adminView(await this.load(id));
  }

  private async slugTaken(slug: string, exceptId?: string): Promise<boolean> {
    const row = await this.prisma.tag.findUnique({ where: { slug }, select: { id: true } });
    return !!row && row.id !== exceptId;
  }

  private assertSlug(slug: string): void {
    if (!isValidContentSlug(slug, 120)) {
      throw fieldError('slug', 'slug', {
        ar: 'استخدم حروفًا صغيرة وأرقامًا وشرطات فقط.',
        en: 'Use lower-case letters, digits and single hyphens only.',
      });
    }
  }

  private assertHasName(nameAr: string | null | undefined, nameEn: string | null | undefined) {
    if (!nameAr?.trim() && !nameEn?.trim()) {
      throw fieldError('nameAr', 'isNotEmpty', {
        ar: 'أدخل اسم الوسم بالعربية أو الإنجليزية على الأقل.',
        en: 'Enter the tag name in Arabic or English (at least one).',
      });
    }
  }

  async create(dto: CreateTagDto): Promise<AdminTagDto> {
    this.assertHasName(dto.nameAr, dto.nameEn);
    let slug = dto.slug?.trim().toLowerCase();
    if (slug) {
      this.assertSlug(slug);
      if (await this.slugTaken(slug)) throw contentError('TAG_SLUG_TAKEN', { slug });
    } else {
      slug = await uniqueSlug(slugFromTexts([dto.nameEn, dto.nameAr]), (s) => this.slugTaken(s));
    }
    const tag = await this.prisma.tag.create({
      data: {
        slug,
        translations: {
          create: [
            ...(dto.nameAr?.trim() ? [{ locale: 'ar', name: dto.nameAr.trim() }] : []),
            ...(dto.nameEn?.trim() ? [{ locale: 'en', name: dto.nameEn.trim() }] : []),
          ],
        },
      },
      include: { translations: true },
    });
    const view = await this.adminView(tag, 0);
    this.audit.annotate({ entityType: 'tag', entityId: tag.id, after: view });
    return view;
  }

  async update(id: string, dto: UpdateTagDto): Promise<AdminTagDto> {
    const before = await this.load(id);
    const current = names(before);
    const nextAr = dto.nameAr === undefined ? current.ar : dto.nameAr?.trim() || null;
    const nextEn = dto.nameEn === undefined ? current.en : dto.nameEn?.trim() || null;
    this.assertHasName(nextAr, nextEn);
    let slug: string | undefined;
    if (dto.slug !== undefined && dto.slug.trim().toLowerCase() !== before.slug) {
      slug = dto.slug.trim().toLowerCase();
      this.assertSlug(slug);
      if (await this.slugTaken(slug, id)) throw contentError('TAG_SLUG_TAKEN', { slug });
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      for (const [locale, value] of [
        ['ar', nextAr],
        ['en', nextEn],
      ] as const) {
        if (value) {
          await tx.tagTranslation.upsert({
            where: { tagId_locale: { tagId: id, locale } },
            create: { tagId: id, locale, name: value },
            update: { name: value },
          });
        } else {
          await tx.tagTranslation.deleteMany({ where: { tagId: id, locale } });
        }
      }
      return tx.tag.update({
        where: { id },
        data: slug ? { slug } : { updatedAt: new Date() },
        include: { translations: true },
      });
    });
    const view = await this.adminView(updated);
    this.audit.annotate({
      entityType: 'tag',
      entityId: id,
      before: await this.adminView(before, view.articleCount),
      after: view,
    });
    return view;
  }

  async remove(id: string, force: boolean): Promise<void> {
    const tag = await this.load(id);
    const used = await this.prisma.articleTag.count({ where: { tagId: id } });
    if (used > 0 && !force) throw contentError('TAG_IN_USE', { articleCount: used });
    this.audit.annotate({
      entityType: 'tag',
      entityId: id,
      before: await this.adminView(tag, used),
    });
    // article_tags rows cascade; article revisions keep the tag id in their
    // snapshots and a later restore simply skips tags that no longer exist.
    await this.prisma.tag.delete({ where: { id } });
  }

  /** Moves every article of `sourceId` to `targetId` and deletes the source tag. */
  async merge(sourceId: string, targetId: string): Promise<AdminTagDto> {
    if (sourceId === targetId) throw contentError('TAG_MERGE_SELF');
    const [source, target] = await Promise.all([this.load(sourceId), this.load(targetId)]);
    const moved = await this.prisma.$transaction(async (tx) => {
      const links = await tx.articleTag.findMany({
        where: { tagId: sourceId },
        select: { articleId: true },
      });
      if (links.length) {
        await tx.articleTag.createMany({
          data: links.map((l) => ({ articleId: l.articleId, tagId: targetId })),
          skipDuplicates: true,
        });
      }
      await tx.tag.delete({ where: { id: sourceId } });
      return links.length;
    });
    const view = await this.adminView(target);
    this.audit.annotate({
      action: 'tags.merge',
      entityType: 'tag',
      entityId: sourceId,
      before: await this.adminView(source, moved),
      after: { mergedInto: view, movedArticles: moved },
    });
    return view;
  }
}
