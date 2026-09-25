import { Injectable } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { toPageRequest } from '../../../common/http/pagination';
import { PowertrainType, Reliability } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../prisma/prisma.service';
import { LISTED_AVAILABILITIES } from '../common/catalog-constants';
import { pickCurrentPrice } from '../common/views';
import { todayIn, toIsoDate } from '../common/values';
import { PUBLIC_VARIANT_WHERE } from '../common/visibility';
import { scopeSpecs } from '../public/spec-sheet';

export const QUALITY_ISSUES = [
  'missing_key_specs',
  'key_specs_without_source',
  'unverified_key_specs',
  'no_electric_range',
  'no_local_price',
  'stale_price',
  'no_images',
  'no_inlets',
] as const;
export type QualityIssue = (typeof QUALITY_ISSUES)[number];

export class DataQualityRowDto {
  @ApiProperty({ format: 'uuid' }) variantId!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: ['BEV', 'PHEV', 'EREV', 'HEV'] }) powertrainType!: string;
  @ApiProperty({ enum: QUALITY_ISSUES, isArray: true }) issues!: string[];
  @ApiProperty({ type: [String], description: 'Key spec keys without a value.' })
  missingKeySpecs!: string[];
  @ApiProperty({ nullable: true, type: String, format: 'date' })
  currentPriceSince!: string | null;
}

export class DataQualitySummaryDto {
  @ApiProperty() marketCode!: string;
  @ApiProperty({ description: 'Public trims listed in the market.' }) variants!: number;
  @ApiProperty({ description: 'Trims with at least one issue.' }) withIssues!: number;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'integer' } })
  byIssue!: Record<string, number>;
  @ApiProperty({ description: 'A current price older than this many days is "stale".' })
  stalePriceDays!: number;
}

const STALE_PRICE_DAYS = 365;

/**
 * Data-quality report of the public catalog in one market (REQUIREMENTS
 * §17 "البيانات المتقادمة"): trims listed in the market with missing key
 * specs, key specs without a source or not verified, no electric range
 * (plug-in powertrains), no current local price or a stale one, no images,
 * no charging inlets. Read-only; computed on request.
 */
@Injectable()
export class DataQualityService {
  constructor(private readonly prisma: PrismaService) {}

  async report(
    marketCode: string,
    issue: string | undefined,
    query: { page?: number; pageSize?: number },
  ) {
    const market = await this.prisma.market.findUnique({ where: { code: marketCode } });
    const today = todayIn(market?.timezone);
    const staleBefore = new Date(Date.now() - STALE_PRICE_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const keyDefs = await this.prisma.specDefinition.findMany({
      where: { isKeySpec: true },
      select: { key: true },
    });
    const keyKeys = keyDefs.map((d) => d.key);
    const variants = await this.prisma.vehicleVariant.findMany({
      where: {
        ...PUBLIC_VARIANT_WHERE,
        markets: { some: { marketCode, availability: { in: LISTED_AVAILABILITIES } } },
      },
      include: {
        modelYear: {
          include: {
            generation: {
              include: {
                _count: { select: { media: true } },
                model: { include: { brand: true, _count: { select: { media: true } } } },
              },
            },
          },
        },
        specifications: {
          where: { specKey: { in: keyKeys }, OR: [{ marketCode: null }, { marketCode }] },
        },
        rangeMeasurements: {
          where: { rangeType: 'electric', OR: [{ marketCode: null }, { marketCode }] },
          select: { id: true },
        },
        prices: { where: { marketCode } },
        markets: { where: { marketCode }, include: { inlets: { select: { id: true } } } },
        _count: { select: { media: true } },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });
    const rows: DataQualityRowDto[] = [];
    let withIssues = 0;
    const byIssue: Record<string, number> = Object.fromEntries(QUALITY_ISSUES.map((i) => [i, 0]));
    for (const v of variants) {
      const issues: QualityIssue[] = [];
      const scoped = scopeSpecs(v.specifications, marketCode);
      const missing = keyKeys.filter((k) => !scoped.has(k));
      const plugIn = v.powertrainType !== PowertrainType.HEV;
      if (missing.length) issues.push('missing_key_specs');
      const present = [...scoped.values()];
      if (present.some((s) => !s.sourceId)) issues.push('key_specs_without_source');
      if (
        present.some(
          (s) => s.reliability === Reliability.unverified || s.reliability === Reliability.disputed,
        )
      ) {
        issues.push('unverified_key_specs');
      }
      if (plugIn && v.rangeMeasurements.length === 0) issues.push('no_electric_range');
      const local = v.prices.filter((p) => p.currencyCode === market?.currencyCode);
      const current = pickCurrentPrice(local, today, market?.currencyCode ?? null);
      if (!current) issues.push('no_local_price');
      else if ((toIsoDate(current.effectiveFrom) as string) < staleBefore)
        issues.push('stale_price');
      const g = v.modelYear.generation;
      const galleryRows = v._count.media + g._count.media + g.model._count.media;
      if (galleryRows === 0 && !g.model.heroAssetId) issues.push('no_images');
      if (plugIn && (v.markets[0]?.inlets.length ?? 0) === 0) issues.push('no_inlets');
      issues.forEach((i) => (byIssue[i] += 1));
      if (issues.length > 0) withIssues += 1;
      if (issues.length === 0 || (issue && !issues.includes(issue as QualityIssue))) continue;
      const m = g.model;
      rows.push({
        variantId: v.id,
        slug: v.slug,
        title: `${m.brand.nameEn} ${m.nameEn} ${v.modelYear.year} ${v.nameEn}`,
        powertrainType: v.powertrainType,
        issues,
        missingKeySpecs: missing,
        currentPriceSince: current ? toIsoDate(current.effectiveFrom) : null,
      });
    }
    const page = toPageRequest(query);
    const summary: DataQualitySummaryDto = {
      marketCode,
      variants: variants.length,
      withIssues,
      byIssue,
      stalePriceDays: STALE_PRICE_DAYS,
    };
    return {
      items: rows.slice(page.skip, page.skip + page.take),
      total: rows.length,
      page,
      summary,
    };
  }
}
