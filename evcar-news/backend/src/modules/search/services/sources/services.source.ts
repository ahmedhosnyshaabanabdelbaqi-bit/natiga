import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { IMAGE_ASSET_INCLUDE, MediaUrlService } from '../../../vehicles';
import {
  serviceTypeLabel,
  sponsorLabelOf,
  sponsoredNow,
} from '../../../services-directory/common/labels';
import { buildHit } from '../../common/hit-builder';
import type { RankedRow, SearchHit, SourceContext } from '../../common/search-types';
import { anyOf, greatest, pagedGroupSql, pinnedScore, tableRank } from '../../common/sql-scoring';

/**
 * Services directory (published providers of the market). Ranked by
 * relevance only: sponsorship gives no boost; sponsored hits carry
 * `details.isSponsored` + a label.
 */
@Injectable()
export class ServicesSource {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaUrlService,
  ) {}

  rankSql(ctx: SourceContext): Prisma.Sql {
    const { score, match } = tableRank(
      [Prisma.sql`app_normalize_text(p."name_ar")`, Prisma.sql`app_normalize_text(p."name_en")`],
      Prisma.sql`app_normalize_text(concat_ws(' ', p."name_ar", p."name_en", p."description_ar", p."description_en", p."city", p."address_ar", p."address_en", array_to_string(p."services", ' ')))`,
      ctx.variants,
    );
    const pinned = pinnedScore(Prisma.sql`p."id"`, ctx.pinned.services);
    const market = ctx.market ? Prisma.sql`AND p."market_code" = ${ctx.market}` : Prisma.empty;
    return pagedGroupSql(
      'services',
      Prisma.sql`SELECT p."id", ${greatest([score, pinned.score])} AS score
        FROM "service_providers" p
       WHERE p."status" = 'published' AND p."deleted_at" IS NULL
         ${market}
         AND ${anyOf([match, pinned.match])}`,
      ctx.limit,
      ctx.offset,
    );
  }

  async hydrate(rows: RankedRow[], ctx: SourceContext): Promise<SearchHit[]> {
    if (rows.length === 0) return [];
    const list = await this.prisma.serviceProvider.findMany({
      where: { id: { in: rows.map((r) => r.id) }, status: 'published', deletedAt: null },
      include: { logo: { include: IMAGE_ASSET_INCLUDE } },
    });
    const byId = new Map(list.map((p) => [p.id, p]));
    const pinned = new Set(ctx.pinned.services ?? []);
    const now = new Date();
    const out: SearchHit[] = [];
    for (const r of rows) {
      const p = byId.get(r.id);
      if (!p) continue;
      const title = ctx.lang === 'ar' ? p.nameAr : p.nameEn;
      const description = ctx.lang === 'ar' ? p.descriptionAr : p.descriptionEn;
      const address = ctx.lang === 'ar' ? p.addressAr : p.addressEn;
      out.push(
        buildHit(ctx.plan, {
          type: 'service',
          id: p.id,
          slug: p.slug,
          title,
          subtitle: [serviceTypeLabel(p.type, ctx.lang), p.city].filter(Boolean).join(' · '),
          snippetSources: [description, address],
          imageUrl: this.media.image(p.logo, ctx.lang)?.url ?? null,
          language: ctx.lang,
          requested: ctx.lang,
          score: r.score,
          pinned: pinned.has(p.id),
          isDemo: p.isDemo,
          details: {
            serviceType: p.type,
            serviceTypeLabel: serviceTypeLabel(p.type, ctx.lang),
            city: p.city ?? null,
            isSponsored: sponsoredNow(p, now),
            sponsorLabel: sponsorLabelOf(p, ctx.lang, now),
            contactVerified: p.contactVerifiedAt !== null,
          },
        }),
      );
    }
    return out;
  }
}
