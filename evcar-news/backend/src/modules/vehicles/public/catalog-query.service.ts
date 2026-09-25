import { Injectable } from '@nestjs/common';
import type { SupportedLanguage } from '../../../config/app-config';
import { Prisma } from '../../../generated/prisma/client';
import { MarketAvailability } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import { LISTED_AVAILABILITIES } from '../common/catalog-constants';
import { fieldError } from '../common/catalog-errors';
import type { CarListQueryDto } from '../dto/public.dto';
import type { MarketCtx } from './market-context';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

export interface ModelMatch {
  modelId: string;
  variantIds: string[];
}

/** Availabilities that list a trim in a market's catalog. */
export function listedAvailabilities(includeDiscontinued = false): MarketAvailability[] {
  return includeDiscontinued
    ? [...LISTED_AVAILABILITIES, MarketAvailability.discontinued]
    : [...LISTED_AVAILABILITIES];
}

/**
 * FROM/JOIN/WHERE fragment of public trims listed in `market` (aliases v,
 * my, g, m, b, vm). Visibility rules: see common/visibility.ts.
 */
export function listedVariantsSql(market: string, availabilities: MarketAvailability[]) {
  return Prisma.sql`
    FROM vehicle_variants v
    JOIN model_years my ON my.id = v.model_year_id
    JOIN generations g ON g.id = my.generation_id AND g.deleted_at IS NULL
    JOIN car_models m ON m.id = g.model_id AND m.status = 'published' AND m.deleted_at IS NULL
    JOIN brands b ON b.id = m.brand_id AND b.status = 'published' AND b.deleted_at IS NULL
    JOIN variant_markets vm ON vm.variant_id = v.id AND vm.market_code = ${market}
      AND vm.availability = ANY(${availabilities}::market_availability[])
    WHERE v.status = 'published' AND v.deleted_at IS NULL`;
}

/** Joins SQL fragments with spaces (an empty list is an empty fragment). */
export function joinSql(parts: Prisma.Sql[]): Prisma.Sql {
  return parts.length ? Prisma.join(parts, ' ') : Prisma.empty;
}

function likePattern(q: string): string {
  return q.replace(/[\\%_]/g, ' ').trim();
}

/**
 * The catalog list (/cars): trims are filtered with SQL (market listing,
 * brand / powertrain / body / drive / seats / year / text, current LOCAL
 * price range, minimum range in ONE cycle), then grouped per model and
 * paginated per model. Prices in another currency than the market's are
 * ignored for price filters and sorting (never converted).
 */
@Injectable()
export class CatalogQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async listModels(
    q: CarListQueryDto,
    market: MarketCtx,
    lang: SupportedLanguage,
    page: { skip: number; take: number },
  ): Promise<{ items: ModelMatch[]; total: number }> {
    if (q.minRange !== undefined && !q.rangeCycle) {
      throw fieldError('rangeCycle', 'required', {
        ar: 'اختر معيار قياس المدى (WLTP أو EPA أو CLTC أو NEDC) مع الحد الأدنى للمدى؛ لا تُقارن دورات مختلفة.',
        en: 'Choose the range cycle (WLTP, EPA, CLTC or NEDC) with a minimum range; cycles are never compared.',
      });
    }
    if (q.minPrice && q.maxPrice && Number(q.minPrice) > Number(q.maxPrice)) {
      throw fieldError('maxPrice', 'order', {
        ar: 'الحد الأقصى للسعر أقل من الحد الأدنى.',
        en: 'The maximum price is below the minimum price.',
      });
    }
    const filters: Prisma.Sql[] = [];
    if (q.brand) {
      const tokens = q.brand
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 50);
      const ids = tokens.filter(isUuid);
      const slugs = tokens.filter((t) => !isUuid(t)).map((t) => t.toLowerCase());
      filters.push(Prisma.sql`AND (b.slug = ANY(${slugs}::text[]) OR b.id = ANY(${ids}::uuid[]))`);
    }
    if (q.powertrain?.length) {
      filters.push(Prisma.sql`AND v.powertrain_type = ANY(${q.powertrain}::powertrain_type[])`);
    }
    if (q.body?.length) {
      filters.push(
        Prisma.sql`AND COALESCE(v.body_type, m.body_type) = ANY(${q.body}::body_type[])`,
      );
    }
    if (q.drive?.length) {
      filters.push(Prisma.sql`AND v.drive_type = ANY(${q.drive}::drive_type[])`);
    }
    if (q.seats !== undefined) filters.push(Prisma.sql`AND v.seats = ${q.seats}`);
    if (q.minSeats !== undefined) filters.push(Prisma.sql`AND v.seats >= ${q.minSeats}`);
    if (q.year !== undefined) filters.push(Prisma.sql`AND my.year = ${q.year}`);
    const text = q.q ? likePattern(q.q) : '';
    if (text) {
      filters.push(Prisma.sql`AND app_normalize_text(concat_ws(' ', b.name_en, b.name_ar, b.slug,
        m.name_en, m.name_ar, m.slug, v.name_en, v.name_ar, v.trim_code))
        LIKE '%' || app_normalize_text(${text}) || '%'`);
    }

    const cycle = q.rangeCycle ?? 'WLTP';
    const rangeType = q.rangeType ?? 'electric';
    const post: Prisma.Sql[] = [];
    if (q.minPrice) post.push(Prisma.sql`AND price.amount >= ${q.minPrice}::numeric`);
    if (q.maxPrice) post.push(Prisma.sql`AND price.amount <= ${q.maxPrice}::numeric`);
    if (q.minRange !== undefined) post.push(Prisma.sql`AND rng.km >= ${q.minRange}::numeric`);

    const nameCol = lang === 'en' ? Prisma.sql`name_en` : Prisma.sql`name_ar`;
    const order = (() => {
      switch (q.sort) {
        case 'price_asc':
          return Prisma.sql`MIN(mv.price) ASC NULLS LAST, MAX(mv.published_at) DESC`;
        case 'price_desc':
          return Prisma.sql`MAX(mv.price) DESC NULLS LAST, MAX(mv.published_at) DESC`;
        case 'range_desc':
          return Prisma.sql`MAX(mv.range_km) DESC NULLS LAST, MAX(mv.published_at) DESC`;
        case 'name':
          return Prisma.sql`MIN(mv.brand_name) ASC, MIN(mv.model_name) ASC`;
        default:
          return Prisma.sql`MAX(mv.published_at) DESC`;
      }
    })();

    const rows = await this.prisma.$queryRaw<{ model_id: string; ids: string[]; total: number }[]>(
      Prisma.sql`
      WITH base AS (
        SELECT v.id, g.model_id, COALESCE(v.published_at, v.created_at) AS published_at,
               lower(b.${nameCol}) AS brand_name, lower(m.${nameCol}) AS model_name
        ${listedVariantsSql(market.code, listedAvailabilities(q.includeDiscontinued))}
        ${joinSql(filters)}
      ),
      price AS (
        SELECT DISTINCT ON (p.variant_id) p.variant_id, p.amount
        FROM price_history p
        JOIN base ON base.id = p.variant_id
        WHERE p.market_code = ${market.code}
          AND p.currency_code = ${market.currencyCode}
          AND p.effective_from <= ${market.today}::date
          AND (p.effective_to IS NULL OR p.effective_to >= ${market.today}::date)
        ORDER BY p.variant_id,
          CASE p.price_type WHEN 'official_msrp' THEN 0 WHEN 'dealer' THEN 1 ELSE 2 END,
          p.effective_from DESC, p.created_at DESC
      ),
      rng AS (
        SELECT r.variant_id, MAX(r.value_km) AS km
        FROM range_measurements r
        JOIN base ON base.id = r.variant_id
        WHERE r.cycle = ${cycle}::range_cycle AND r.range_type = ${rangeType}::range_type
          AND (r.market_code IS NULL OR r.market_code = ${market.code})
        GROUP BY r.variant_id
      ),
      mv AS (
        SELECT base.*, price.amount AS price, rng.km AS range_km
        FROM base
        LEFT JOIN price ON price.variant_id = base.id
        LEFT JOIN rng ON rng.variant_id = base.id
        WHERE TRUE ${joinSql(post)}
      )
      SELECT mv.model_id, array_agg(mv.id::text ORDER BY mv.id) AS ids, (COUNT(*) OVER())::int AS total
      FROM mv
      GROUP BY mv.model_id
      ORDER BY ${order}, mv.model_id
      LIMIT ${page.take} OFFSET ${page.skip}`,
    );
    if (rows.length === 0 && page.skip > 0) {
      // Page past the end: still report the total.
      const count = await this.countOnly(q, market, lang);
      return { items: [], total: count };
    }
    return {
      items: rows.map((r) => ({ modelId: r.model_id, variantIds: r.ids })),
      total: rows[0]?.total ?? 0,
    };
  }

  private async countOnly(
    q: CarListQueryDto,
    market: MarketCtx,
    lang: SupportedLanguage,
  ): Promise<number> {
    const res = await this.listModels(q, market, lang, { skip: 0, take: 1 });
    return res.total;
  }

  /** Listed trims per model in a market (for cards of known models). */
  async listedVariantsByModel(
    modelIds: string[],
    market: string,
    includeDiscontinued = false,
  ): Promise<Map<string, string[]>> {
    if (modelIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<{ model_id: string; ids: string[] }[]>(Prisma.sql`
      SELECT g.model_id, array_agg(v.id::text ORDER BY v.id) AS ids
      ${listedVariantsSql(market, listedAvailabilities(includeDiscontinued))}
      AND g.model_id = ANY(${modelIds}::uuid[])
      GROUP BY g.model_id`);
    return new Map(rows.map((r) => [r.model_id, r.ids]));
  }

  /** Number of models with at least one listed trim, per brand. */
  async carCountsByBrand(market: string, brandIds?: string[]): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<{ brand_id: string; n: number }[]>(Prisma.sql`
      SELECT m.brand_id, COUNT(DISTINCT m.id)::int AS n
      ${listedVariantsSql(market, listedAvailabilities())}
      ${brandIds ? Prisma.sql`AND m.brand_id = ANY(${brandIds}::uuid[])` : Prisma.empty}
      GROUP BY m.brand_id`);
    return new Map(rows.map((r) => [r.brand_id, r.n]));
  }
}
