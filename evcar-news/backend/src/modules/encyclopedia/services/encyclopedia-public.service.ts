import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { toPageRequest } from '../../../common/http/pagination';
import { paginated, type PaginatedResponse } from '../../../common/http/responses';
import { normalizeSearchText } from '../../../common/i18n/arabic-normalize';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { isUuid } from '../../articles/common/slug';
import { IMAGE_ASSET_INCLUDE, MediaUrlService } from '../../vehicles';
import { notFound } from '../../search/common/discovery-http';
import { escapeLike } from '../../search/common/text-match';
import {
  PUBLIC_ENTRY_SQL_TEXT,
  REVIEWED_LABEL,
  publicEntryWhere,
  safetyNoticeFor,
} from '../common/encyclopedia-rules';
import type {
  EncyclopediaCategoryViewDto,
  EncyclopediaEntryDetailDto,
  EncyclopediaEntrySummaryDto,
  EncyclopediaListQueryDto,
} from '../dto/encyclopedia.dto';

export const ENTRY_INCLUDE = {
  translations: true,
  category: true,
  coverAsset: { include: IMAGE_ASSET_INCLUDE },
} satisfies Prisma.EncyclopediaEntryInclude;

export type EntryRow = Prisma.EncyclopediaEntryGetPayload<{ include: typeof ENTRY_INCLUDE }>;

const WORDS_PER_MINUTE = 200;

/** Categories shown first in the home "charging guides" section. */
export const CHARGING_CATEGORIES = ['home_charging', 'fast_charging', 'connectors'];

/**
 * Reader-facing encyclopedia (guests): only published entries that passed
 * the technical review are ever returned, each with the "reviewed" badge.
 */
@Injectable()
export class EncyclopediaPublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaUrlService,
  ) {}

  async categories(lang: SupportedLanguage): Promise<EncyclopediaCategoryViewDto[]> {
    const [cats, counts] = await Promise.all([
      this.prisma.encyclopediaCategory.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      }),
      this.prisma.encyclopediaEntry.groupBy({
        by: ['categoryKey'],
        where: publicEntryWhere(),
        _count: { _all: true },
      }),
    ]);
    const byKey = new Map(counts.map((c) => [c.categoryKey, c._count._all]));
    return cats.map((c) => ({
      key: c.key,
      name: lang === 'ar' ? c.nameAr : c.nameEn,
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      description: (lang === 'ar' ? c.descriptionAr : c.descriptionEn) ?? null,
      iconKey: c.iconKey,
      sortOrder: c.sortOrder,
      entryCount: byKey.get(c.key) ?? 0,
    }));
  }

  async list(
    q: EncyclopediaListQueryDto,
    lang: SupportedLanguage,
  ): Promise<PaginatedResponse<EncyclopediaEntrySummaryDto>> {
    const page = toPageRequest(q);
    const and: Prisma.EncyclopediaEntryWhereInput[] = [publicEntryWhere()];
    if (q.category) and.push({ categoryKey: q.category });
    if (q.q) {
      const needle = normalizeSearchText(q.q);
      if (needle) {
        const ids = await this.prisma.$queryRaw<{ id: string }[]>`
          SELECT DISTINCT e."id"::text AS id
            FROM "encyclopedia_entries" e
            JOIN "encyclopedia_categories" c ON c."key" = e."category_key"
            JOIN "encyclopedia_entry_translations" t ON t."entry_id" = e."id"
           WHERE ${Prisma.raw(PUBLIC_ENTRY_SQL_TEXT)}
             AND app_normalize_text(concat_ws(' ', t."title", t."summary", t."body_text")) LIKE ${`%${escapeLike(needle)}%`}`;
        and.push({ id: { in: ids.map((r) => r.id) } });
      }
    }
    const where: Prisma.EncyclopediaEntryWhereInput = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.encyclopediaEntry.findMany({
        where,
        include: ENTRY_INCLUDE,
        orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }, { id: 'asc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.encyclopediaEntry.count({ where }),
    ]);
    return paginated(
      rows.map((r) => this.summary(r, lang)).filter((x): x is EncyclopediaEntrySummaryDto => !!x),
      total,
      page,
    );
  }

  /** Home "charging guides": charging categories first, then the newest entries. */
  async guides(limit: number, lang: SupportedLanguage): Promise<EncyclopediaEntrySummaryDto[]> {
    const rows = await this.prisma.encyclopediaEntry.findMany({
      where: publicEntryWhere(),
      include: ENTRY_INCLUDE,
      orderBy: [{ isDemo: 'asc' }, { publishedAt: 'desc' }, { id: 'asc' }],
      take: 100,
    });
    const rank = (key: string) => {
      const i = CHARGING_CATEGORIES.indexOf(key);
      return i === -1 ? CHARGING_CATEGORIES.length : i;
    };
    return rows
      .map((r, i) => ({ r, i }))
      .sort((a, b) => rank(a.r.categoryKey) - rank(b.r.categoryKey) || a.i - b.i)
      .map(({ r }) => this.summary(r, lang))
      .filter((x): x is EncyclopediaEntrySummaryDto => !!x)
      .slice(0, limit);
  }

  async detail(ref: string, lang: SupportedLanguage): Promise<EncyclopediaEntryDetailDto> {
    const row = await this.prisma.encyclopediaEntry.findFirst({
      where: {
        ...publicEntryWhere(),
        ...(isUuid(ref) ? { id: ref } : { slug: ref.toLowerCase() }),
      },
      include: ENTRY_INCLUDE,
    });
    const summary = row ? this.summary(row, lang) : null;
    if (!row || !summary) {
      throw notFound('ENCYCLOPEDIA_ENTRY_NOT_FOUND', {
        ar: 'مادة الموسوعة غير موجودة.',
        en: 'Encyclopedia entry not found.',
      });
    }
    const t = this.pick(row, lang)!;
    const related = await this.prisma.encyclopediaEntry.findMany({
      where: { ...publicEntryWhere(), categoryKey: row.categoryKey, id: { not: row.id } },
      include: ENTRY_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }],
      take: 4,
    });
    return {
      ...summary,
      bodyHtml: t.bodyHtml,
      safetyNotice: safetyNoticeFor(row.categoryKey, lang),
      related: related
        .map((r) => this.summary(r, lang))
        .filter((x): x is EncyclopediaEntrySummaryDto => !!x),
    };
  }

  /** Summaries of the given ids that are publicly visible (favorites / home). */
  async summariesByIds(ids: string[], lang: SupportedLanguage) {
    if (ids.length === 0) return new Map<string, EncyclopediaEntrySummaryDto>();
    const rows = await this.prisma.encyclopediaEntry.findMany({
      where: { ...publicEntryWhere(), id: { in: ids } },
      include: ENTRY_INCLUDE,
    });
    const out = new Map<string, EncyclopediaEntrySummaryDto>();
    for (const r of rows) {
      const s = this.summary(r, lang);
      if (s) out.set(r.id, s);
    }
    return out;
  }

  private pick(row: EntryRow, lang: SupportedLanguage) {
    return (
      row.translations.find((t) => t.locale === lang) ??
      row.translations.find((t) => t.locale !== lang) ??
      null
    );
  }

  summary(row: EntryRow, lang: SupportedLanguage): EncyclopediaEntrySummaryDto | null {
    const t = this.pick(row, lang);
    if (!t || !row.technicalReviewedAt || !row.publishedAt) return null;
    const words = (t.bodyText ?? '').split(/\s+/).filter(Boolean).length;
    return {
      id: row.id,
      slug: row.slug,
      category: {
        key: row.category.key,
        name: lang === 'ar' ? row.category.nameAr : row.category.nameEn,
        iconKey: row.category.iconKey,
      },
      title: t.title,
      summary: t.summary ?? null,
      language: t.locale === 'en' ? 'en' : 'ar',
      isFallback: t.locale !== lang,
      availableLanguages: row.translations.map((x) => x.locale).sort(),
      coverImage: this.media.image(row.coverAsset, lang),
      readingMinutes: words > 0 ? Math.max(1, Math.round(words / WORDS_PER_MINUTE)) : null,
      review: {
        reviewed: true,
        reviewedAt: row.technicalReviewedAt.toISOString(),
        label: REVIEWED_LABEL[lang],
      },
      publishedAt: row.publishedAt.toISOString(),
      contentUpdatedAt: row.contentUpdatedAt?.toISOString() ?? null,
      isDemo: row.isDemo,
    };
  }
}
