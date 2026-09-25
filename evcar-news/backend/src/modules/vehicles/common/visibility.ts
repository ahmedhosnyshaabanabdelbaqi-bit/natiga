/**
 * Public visibility of catalog entries (decisions phase2-schema §5):
 * a variant is public when the variant, its model and its brand are
 * `published` and none of them (nor the generation) is soft-deleted; it is
 * listed in a market when its variant_markets row there is available or
 * coming soon (discontinued trims appear on the model page, labelled).
 */
import { ContentStatus, MarketAvailability } from '../../../generated/prisma/enums';
import type { Prisma } from '../../../generated/prisma/client';
import { LISTED_AVAILABILITIES } from './catalog-constants';

export const PUBLIC_BRAND_WHERE = {
  status: ContentStatus.published,
  deletedAt: null,
} satisfies Prisma.BrandWhereInput;

export const PUBLIC_MODEL_WHERE = {
  status: ContentStatus.published,
  deletedAt: null,
  brand: PUBLIC_BRAND_WHERE,
} satisfies Prisma.CarModelWhereInput;

export const PUBLIC_VARIANT_WHERE = {
  status: ContentStatus.published,
  deletedAt: null,
  modelYear: { generation: { deletedAt: null, model: PUBLIC_MODEL_WHERE } },
} satisfies Prisma.VehicleVariantWhereInput;

/** Public variants listed in `market` with one of `availabilities`. */
export function variantsInMarketWhere(
  market: string,
  availabilities: MarketAvailability[] = LISTED_AVAILABILITIES,
): Prisma.VehicleVariantWhereInput {
  return {
    ...PUBLIC_VARIANT_WHERE,
    markets: { some: { marketCode: market, availability: { in: availabilities } } },
  };
}

/** Why an entry is not public (admin hint). */
export type VisibilityBlocker =
  | 'brand_not_published'
  | 'brand_deleted'
  | 'model_not_published'
  | 'model_deleted'
  | 'generation_deleted'
  | 'variant_not_published'
  | 'variant_deleted'
  | 'no_market_listing';

export interface VisibilityInput {
  brand?: { status: ContentStatus; deletedAt: Date | null } | null;
  model?: { status: ContentStatus; deletedAt: Date | null } | null;
  generation?: { deletedAt: Date | null } | null;
  variant?: { status: ContentStatus; deletedAt: Date | null } | null;
  /** Availabilities of the variant's market rows (variant checks only). */
  marketAvailabilities?: MarketAvailability[];
}

export function visibilityBlockers(v: VisibilityInput): VisibilityBlocker[] {
  const out: VisibilityBlocker[] = [];
  if (v.brand) {
    if (v.brand.status !== ContentStatus.published) out.push('brand_not_published');
    if (v.brand.deletedAt) out.push('brand_deleted');
  }
  if (v.model) {
    if (v.model.status !== ContentStatus.published) out.push('model_not_published');
    if (v.model.deletedAt) out.push('model_deleted');
  }
  if (v.generation?.deletedAt) out.push('generation_deleted');
  if (v.variant) {
    if (v.variant.status !== ContentStatus.published) out.push('variant_not_published');
    if (v.variant.deletedAt) out.push('variant_deleted');
    if (
      v.marketAvailabilities &&
      !v.marketAvailabilities.some((a) => LISTED_AVAILABILITIES.includes(a))
    ) {
      out.push('no_market_listing');
    }
  }
  return out;
}
