import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MarketContextService, PUBLIC_VARIANT_WHERE } from '../../vehicles';
import { fieldErrors, ITEM_MESSAGES, type FieldProblem } from '../common/errors';
import { carKey } from '../engine/facts';

export interface ItemInput {
  variantId: string;
  modelYearId?: string;
  modelYear?: number;
  market: string;
}

/** A validated comparison item: public trim + its model year + a market it has a record in. */
export interface ResolvedItem {
  position: number;
  key: string;
  variantId: string;
  variantSlug: string;
  modelYearId: string;
  modelYear: number;
  marketCode: string;
  availability: string;
  isDemo: boolean;
}

/**
 * `signature = sha256("variantId@MARKET,variantId@MARKET,…")` in item order
 * (docs/decisions/phase2-schema.md §5): identical anonymous shares are reused.
 */
export function comparisonSignature(items: { variantId: string; marketCode: string }[]): string {
  return createHash('sha256')
    .update(
      items.map((i) => `${i.variantId.toLowerCase()}@${i.marketCode.toUpperCase()}`).join(','),
    )
    .digest('hex');
}

/**
 * Validates comparison items against the catalog: 2–4 distinct (trim,
 * market) pairs, trim public, model year given and matching, market known
 * and enabled, and a variant_markets record for the pair (§7: year, trim and
 * market are mandatory). All problems are reported at once (422 with fields).
 */
@Injectable()
export class ItemResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly markets: MarketContextService,
  ) {}

  async resolve(items: ItemInput[], field = 'items'): Promise<ResolvedItem[]> {
    const problems: FieldProblem[] = [];
    const seen = new Set<string>();
    const normalized = items.map((it, i) => {
      const variantId = it.variantId.toLowerCase();
      const market = it.market.toUpperCase();
      const key = carKey(variantId, market);
      if (seen.has(key)) {
        problems.push({
          field: `${field}.${i}`,
          rule: 'duplicate',
          message: ITEM_MESSAGES.duplicate,
        });
      }
      seen.add(key);
      if (!it.modelYearId && it.modelYear === undefined) {
        problems.push({
          field: `${field}.${i}.modelYear`,
          rule: 'required',
          message: ITEM_MESSAGES.yearRequired,
        });
      }
      return { ...it, variantId, market, key };
    });

    const [allMarkets, variants] = await Promise.all([
      this.markets.all(),
      this.prisma.vehicleVariant.findMany({
        where: {
          ...PUBLIC_VARIANT_WHERE,
          id: { in: [...new Set(normalized.map((n) => n.variantId))] },
        },
        select: {
          id: true,
          slug: true,
          isDemo: true,
          modelYearId: true,
          modelYear: { select: { year: true } },
          markets: { select: { marketCode: true, availability: true } },
        },
      }),
    ]);
    const byId = new Map(variants.map((v) => [v.id, v]));

    const resolved: ResolvedItem[] = [];
    normalized.forEach((it, i) => {
      const at = `${field}.${i}`;
      if (!allMarkets.get(it.market)?.enabled) {
        problems.push({
          field: `${at}.market`,
          rule: 'unknownMarket',
          message: ITEM_MESSAGES.unknownMarket,
        });
      }
      const v = byId.get(it.variantId);
      if (!v) {
        problems.push({
          field: `${at}.variantId`,
          rule: 'notFound',
          message: ITEM_MESSAGES.variantNotFound,
        });
        return;
      }
      if (it.modelYearId && it.modelYearId.toLowerCase() !== v.modelYearId) {
        problems.push({
          field: `${at}.modelYearId`,
          rule: 'mismatch',
          message: ITEM_MESSAGES.yearMismatch,
        });
      }
      if (it.modelYear !== undefined && it.modelYear !== v.modelYear.year) {
        problems.push({
          field: `${at}.modelYear`,
          rule: 'mismatch',
          message: ITEM_MESSAGES.yearMismatch,
        });
      }
      const row = v.markets.find((m) => m.marketCode === it.market);
      if (!row) {
        if (allMarkets.get(it.market)?.enabled) {
          problems.push({
            field: `${at}.market`,
            rule: 'notInMarket',
            message: ITEM_MESSAGES.notInMarket,
          });
        }
        return;
      }
      resolved.push({
        position: i + 1,
        key: it.key,
        variantId: v.id,
        variantSlug: v.slug,
        modelYearId: v.modelYearId,
        modelYear: v.modelYear.year,
        marketCode: it.market,
        availability: row.availability,
        isDemo: v.isDemo,
      });
    });
    if (problems.length > 0) throw fieldErrors(problems);
    return resolved;
  }
}
