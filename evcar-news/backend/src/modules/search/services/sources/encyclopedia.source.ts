import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../../config/app-config';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { IMAGE_ASSET_INCLUDE, MediaUrlService } from '../../../vehicles';
import {
  PUBLIC_ENTRY_SQL_TEXT,
  publicEntryWhere,
} from '../../../encyclopedia/common/encyclopedia-rules';
import { buildHit } from '../../common/hit-builder';
import type { RankedRow, SearchHit, SourceContext } from '../../common/search-types';
import { anyOf, greatest, pagedGroupSql, pinnedScore, tableRank } from '../../common/sql-scoring';

/**
 * Published, technically reviewed encyclopedia entries (both languages are
 * searched; the hit is shown in the requested language when it exists).
 */
@Injectable()
export class EncyclopediaSource {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaUrlService,
  ) {}

  rankSql(ctx: SourceContext): Prisma.Sql {
    const { score, match } = tableRank(
      [Prisma.sql`app_normalize_text(t."title")`],
      Prisma.sql`app_normalize_text(concat_ws(' ', t."title", t."summary", t."body_text", c."name_ar", c."name_en"))`,
      ctx.variants,
    );
    const pinned = pinnedScore(Prisma.sql`e."id"`, ctx.pinned.encyclopedia);
    return pagedGroupSql(
      'encyclopedia',
      Prisma.sql`SELECT e."id", ${greatest([score, pinned.score])} AS score
        FROM "encyclopedia_entries" e
        JOIN "encyclopedia_categories" c ON c."key" = e."category_key"
        JOIN "encyclopedia_entry_translations" t ON t."entry_id" = e."id"
       WHERE ${Prisma.raw(PUBLIC_ENTRY_SQL_TEXT)}
         AND ${anyOf([match, pinned.match])}`,
      ctx.limit,
      ctx.offset,
    );
  }

  async hydrate(rows: RankedRow[], ctx: SourceContext): Promise<SearchHit[]> {
    if (rows.length === 0) return [];
    const list = await this.prisma.encyclopediaEntry.findMany({
      where: { id: { in: rows.map((r) => r.id) }, ...publicEntryWhere() },
      include: {
        translations: true,
        category: true,
        coverAsset: { include: IMAGE_ASSET_INCLUDE },
      },
    });
    const byId = new Map(list.map((e) => [e.id, e]));
    const pinned = new Set(ctx.pinned.encyclopedia ?? []);
    const out: SearchHit[] = [];
    for (const r of rows) {
      const e = byId.get(r.id);
      if (!e) continue;
      const t =
        e.translations.find((x) => x.locale === ctx.lang) ??
        e.translations.find((x) => x.locale !== ctx.lang);
      if (!t) continue;
      const language: SupportedLanguage = t.locale === 'en' ? 'en' : 'ar';
      const categoryName = ctx.lang === 'ar' ? e.category.nameAr : e.category.nameEn;
      out.push(
        buildHit(ctx.plan, {
          type: 'encyclopedia',
          id: e.id,
          slug: e.slug,
          title: t.title,
          subtitle: categoryName,
          snippetSources: [t.summary, t.bodyText],
          imageUrl: this.media.image(e.coverAsset, ctx.lang)?.url ?? null,
          language,
          requested: ctx.lang,
          score: r.score,
          pinned: pinned.has(e.id),
          isDemo: e.isDemo,
          details: {
            categoryKey: e.categoryKey,
            categoryName,
            reviewedAt: e.technicalReviewedAt?.toISOString() ?? null,
          },
        }),
      );
    }
    return out;
  }
}
