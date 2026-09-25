import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../../config/app-config';
import { Prisma, SearchEntityType } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { buildHit } from '../../common/hit-builder';
import {
  INDEX_ENTITY_OF,
  type RankedRow,
  type SearchGroupKey,
  type SearchHit,
  type SourceContext,
} from '../../common/search-types';
import {
  SCORE,
  anyOf,
  fuzzyMatch,
  fuzzyScore,
  titleScore,
  weighted,
  greatest,
  uuidList,
} from '../../common/sql-scoring';

const POWERTRAINS = ['BEV', 'PHEV', 'EREV', 'HEV'];

/**
 * Articles, brands, models and variants: the unified index
 * `search_documents` (one row per entity × language, kept in sync by the
 * articles / vehicles modules; normalized title + weighted tsvector by
 * trigger). Visibility is re-checked against the source tables at query
 * time, so a stale index row can never expose unpublished content.
 */
@Injectable()
export class DocumentsSource {
  constructor(private readonly prisma: PrismaService) {}

  /** Index-backed groups among the requested ones. */
  groupsOf(groups: SearchGroupKey[]): SearchGroupKey[] {
    return groups.filter((g) => INDEX_ENTITY_OF[g]);
  }

  rankSql(groups: SearchGroupKey[], ctx: SourceContext): Prisma.Sql | null {
    const entityTypes = groups.map((g) => INDEX_ENTITY_OF[g]!).filter(Boolean);
    if (entityTypes.length === 0) return null;
    const title = Prisma.sql`d."normalized_title"`;
    const matches: Prisma.Sql[] = [];
    const scores: Prisma.Sql[] = [];
    for (const p of ctx.variants) {
      const parts = [titleScore(title, p), fuzzyScore(title, p)];
      const m = [Prisma.sql`${title} LIKE ${p.contains}`, fuzzyMatch(title, p)];
      if (p.tsq) {
        const tsq = Prisma.sql`to_tsquery('simple', ${p.tsq})`;
        m.push(Prisma.sql`d."search_vector" @@ ${tsq}`);
        parts.push(
          Prisma.sql`(CASE WHEN d."search_vector" @@ ${tsq} THEN ${SCORE.text}::float8 + 0.1::float8 * ts_rank(d."search_vector", ${tsq})::float8 ELSE 0::float8 END)`,
        );
      }
      matches.push(anyOf(m));
      scores.push(weighted(p, parts));
    }
    const pinnedPairs = groups.flatMap((g) =>
      (ctx.pinned[g] ?? []).map((id) => ({ type: INDEX_ENTITY_OF[g]!, id })),
    );
    if (pinnedPairs.length > 0) {
      const pinned = Prisma.sql`(d."entity_type"::text, d."entity_id") IN (${Prisma.join(
        pinnedPairs.map((x) => Prisma.sql`(${x.type}, ${x.id}::uuid)`),
      )})`;
      matches.push(pinned);
      scores.push(Prisma.sql`(CASE WHEN ${pinned} THEN ${SCORE.pinned}::float8 ELSE 0::float8 END)`);
    }
    const market = ctx.market
      ? Prisma.sql`AND (cardinality(d."market_codes") = 0 OR ${ctx.market} = ANY(d."market_codes"))`
      : Prisma.empty;
    return Prisma.sql`
      WITH m AS (
        SELECT d."entity_type"::text AS grp, d."entity_id",
               max(${greatest(scores)} * d."boost") AS score
          FROM "search_documents" d
         WHERE d."is_published"
           AND d."entity_type"::text IN (${Prisma.join(entityTypes)})
           AND (d."published_at" IS NULL OR d."published_at" <= now())
           ${market}
           AND ${anyOf(matches)}
           AND ${VISIBLE_SQL}
         GROUP BY 1, 2
      ), r AS (
        SELECT grp, "entity_id", score,
               count(*) OVER (PARTITION BY grp) AS total,
               row_number() OVER (PARTITION BY grp ORDER BY score DESC, "entity_id") AS rn
          FROM m
      )
      SELECT grp, "entity_id"::text AS id, score::float8 AS score, total::int AS total
        FROM r
       WHERE rn > ${ctx.offset} AND rn <= ${ctx.offset + ctx.limit}
       ORDER BY grp, rn`;
  }

  /** SQL rows → ranked rows of the groups (entity type → group key). */
  toRanked(rows: { grp: string; id: string; score: number; total: number }[]): RankedRow[] {
    const groupOf: Record<string, SearchGroupKey> = {
      article: 'articles',
      brand: 'brands',
      model: 'models',
      variant: 'variants',
    };
    return rows.map((r) => ({
      group: groupOf[r.grp],
      id: r.id,
      score: Number(r.score),
      total: Number(r.total),
    }));
  }

  async hydrate(group: SearchGroupKey, rows: RankedRow[], ctx: SourceContext): Promise<SearchHit[]> {
    if (rows.length === 0) return [];
    const entityType = INDEX_ENTITY_OF[group] as SearchEntityType;
    const ids = rows.map((r) => r.id);
    const docs = await this.prisma.searchDocument.findMany({
      where: { entityType, entityId: { in: ids } },
      select: {
        entityId: true,
        locale: true,
        title: true,
        subtitle: true,
        body: true,
        keywords: true,
        slug: true,
        imageUrl: true,
      },
    });
    const details = await this.details(group, ids);
    const pinned = new Set(ctx.pinned[group] ?? []);
    const out: SearchHit[] = [];
    for (const r of rows) {
      const own = docs.filter((d) => d.entityId === r.id);
      const doc =
        own.find((d) => d.locale === ctx.lang) ?? own.find((d) => d.locale !== ctx.lang);
      if (!doc) continue;
      const info = details.get(r.id);
      if (!info) continue; // no longer visible
      const language: SupportedLanguage = doc.locale === 'en' ? 'en' : 'ar';
      out.push(
        buildHit(ctx.plan, {
          type: groupHitType(group),
          id: r.id,
          slug: doc.slug,
          title: doc.title,
          subtitle: doc.subtitle,
          snippetSources: group === 'articles' ? [doc.subtitle, doc.body] : [doc.body],
          imageUrl: doc.imageUrl,
          language,
          requested: ctx.lang,
          score: r.score,
          pinned: pinned.has(r.id),
          isDemo: info.isDemo,
          details: info.details,
        }),
      );
    }
    return out;
  }

  private async details(
    group: SearchGroupKey,
    ids: string[],
  ): Promise<Map<string, { isDemo: boolean; details: Record<string, unknown> }>> {
    const out = new Map<string, { isDemo: boolean; details: Record<string, unknown> }>();
    if (group === 'articles') {
      const rows = await this.prisma.article.findMany({
        where: { id: { in: ids } },
        select: { id: true, isDemo: true, type: true, publishedAt: true },
      });
      for (const a of rows) {
        out.set(a.id, {
          isDemo: a.isDemo,
          details: { articleType: a.type, publishedAt: a.publishedAt?.toISOString() ?? null },
        });
      }
    } else if (group === 'brands') {
      const rows = await this.prisma.brand.findMany({
        where: { id: { in: ids } },
        select: { id: true, isDemo: true },
      });
      for (const b of rows) out.set(b.id, { isDemo: b.isDemo, details: {} });
    } else if (group === 'models') {
      const rows = await this.prisma.carModel.findMany({
        where: { id: { in: ids } },
        select: { id: true, isDemo: true, brand: { select: { nameAr: true, nameEn: true } } },
      });
      for (const m of rows) {
        out.set(m.id, {
          isDemo: m.isDemo,
          details: { brandNameAr: m.brand.nameAr, brandNameEn: m.brand.nameEn },
        });
      }
    } else if (group === 'variants') {
      const rows = await this.prisma.vehicleVariant.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          isDemo: true,
          powertrainType: true,
          modelYear: { select: { year: true, generation: { select: { model: { select: { slug: true } } } } } },
        },
      });
      for (const v of rows) {
        out.set(v.id, {
          isDemo: v.isDemo,
          details: {
            modelSlug: v.modelYear.generation.model.slug,
            modelYear: v.modelYear.year,
            powertrainType: POWERTRAINS.includes(v.powertrainType) ? v.powertrainType : null,
          },
        });
      }
    }
    return out;
  }
}

function groupHitType(group: SearchGroupKey) {
  return ({ articles: 'article', brands: 'brand', models: 'model', variants: 'variant' } as const)[
    group as 'articles' | 'brands' | 'models' | 'variants'
  ];
}

/**
 * Source-table visibility of index rows (decisions phase2-schema §5):
 * articles published + publication time reached, catalog chain published
 * and not soft-deleted.
 */
const VISIBLE_SQL = Prisma.sql`(
  (d."entity_type" = 'article' AND EXISTS (
     SELECT 1 FROM "articles" a
      WHERE a."id" = d."entity_id" AND a."status" = 'published'
        AND a."deleted_at" IS NULL AND a."published_at" <= now()))
  OR (d."entity_type" = 'brand' AND EXISTS (
     SELECT 1 FROM "brands" b
      WHERE b."id" = d."entity_id" AND b."status" = 'published' AND b."deleted_at" IS NULL))
  OR (d."entity_type" = 'model' AND EXISTS (
     SELECT 1 FROM "car_models" m JOIN "brands" b ON b."id" = m."brand_id"
      WHERE m."id" = d."entity_id" AND m."status" = 'published' AND m."deleted_at" IS NULL
        AND b."status" = 'published' AND b."deleted_at" IS NULL))
  OR (d."entity_type" = 'variant' AND EXISTS (
     SELECT 1 FROM "vehicle_variants" v
       JOIN "model_years" y ON y."id" = v."model_year_id"
       JOIN "generations" g ON g."id" = y."generation_id"
       JOIN "car_models" m ON m."id" = g."model_id"
       JOIN "brands" b ON b."id" = m."brand_id"
      WHERE v."id" = d."entity_id" AND v."status" = 'published' AND v."deleted_at" IS NULL
        AND g."deleted_at" IS NULL AND m."status" = 'published' AND m."deleted_at" IS NULL
        AND b."status" = 'published' AND b."deleted_at" IS NULL))
)`;

export { uuidList };
