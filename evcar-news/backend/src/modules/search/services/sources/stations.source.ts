import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../../config/app-config';
import { containsArabic } from '../../../../common/i18n/arabic-normalize';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { buildHit } from '../../common/hit-builder';
import type { RankedRow, SearchHit, SourceContext } from '../../common/search-types';
import { pagedGroupSql, pinnedScore, tableRank, greatest, anyOf } from '../../common/sql-scoring';

/**
 * Charging stations, queried directly (read-only): published, not deleted,
 * not merged into another station; names + address + city through the
 * trigger-maintained normalized `search_text` (trigram index).
 */
@Injectable()
export class StationsSource {
  constructor(private readonly prisma: PrismaService) {}

  rankSql(ctx: SourceContext): Prisma.Sql {
    const { score, match } = tableRank(
      [
        Prisma.sql`app_normalize_text(s."name")`,
        Prisma.sql`app_normalize_text(s."name_ar")`,
        Prisma.sql`app_normalize_text(s."name_en")`,
      ],
      Prisma.sql`s."search_text"`,
      ctx.variants,
    );
    const pinned = pinnedScore(Prisma.sql`s."id"`, ctx.pinned.stations);
    const market = ctx.market
      ? Prisma.sql`AND coalesce(s."market_code", s."country_code") = ${ctx.market}`
      : Prisma.empty;
    return pagedGroupSql(
      'stations',
      Prisma.sql`SELECT s."id", ${greatest([score, pinned.score])} AS score
        FROM "charging_stations" s
       WHERE s."publication_status" = 'published' AND s."deleted_at" IS NULL
         AND s."duplicate_of_id" IS NULL
         ${market}
         AND ${anyOf([match, pinned.match])}`,
      ctx.limit,
      ctx.offset,
    );
  }

  async hydrate(rows: RankedRow[], ctx: SourceContext): Promise<SearchHit[]> {
    if (rows.length === 0) return [];
    const list = await this.prisma.chargingStation.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      select: {
        id: true,
        name: true,
        nameAr: true,
        nameEn: true,
        city: true,
        addressLine: true,
        addressAr: true,
        addressEn: true,
        latitude: true,
        longitude: true,
        operationalStatus: true,
        countryCode: true,
        isDemo: true,
      },
    });
    const byId = new Map(list.map((s) => [s.id, s]));
    const pinned = new Set(ctx.pinned.stations ?? []);
    const out: SearchHit[] = [];
    for (const r of rows) {
      const s = byId.get(r.id);
      if (!s) continue;
      const localized = ctx.lang === 'ar' ? s.nameAr : s.nameEn;
      const title = localized ?? s.name;
      const language: SupportedLanguage = localized
        ? ctx.lang
        : containsArabic(s.name)
          ? 'ar'
          : 'en';
      const address = (ctx.lang === 'ar' ? s.addressAr : s.addressEn) ?? s.addressLine;
      out.push(
        buildHit(ctx.plan, {
          type: 'station',
          id: s.id,
          slug: null,
          title,
          subtitle: [s.city, address].filter(Boolean).join(' · ') || null,
          snippetSources: [address],
          imageUrl: null,
          language,
          requested: ctx.lang,
          score: r.score,
          pinned: pinned.has(s.id),
          isDemo: s.isDemo,
          details: {
            city: s.city ?? null,
            latitude: s.latitude,
            longitude: s.longitude,
            operationalStatus: s.operationalStatus,
            countryCode: s.countryCode,
          },
        }),
      );
    }
    return out;
  }
}
