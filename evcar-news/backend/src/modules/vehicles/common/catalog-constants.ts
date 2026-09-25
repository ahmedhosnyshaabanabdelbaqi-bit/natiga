/**
 * Enumerations and fixed rules of the vehicle catalog (REQUIREMENTS §6).
 * Values mirror the Prisma enums (src/generated/prisma/enums.ts) so DTOs
 * can list them in OpenAPI without importing Prisma types everywhere.
 */
import {
  BodyType,
  BetterDirection,
  ConsumptionKind,
  ConsumptionMode,
  ContentStatus,
  CurrentType,
  DriveType,
  MarketAvailability,
  PowertrainType,
  PriceType,
  RangeCycle,
  RangeType,
  Reliability,
  SourceType,
  SpecDataType,
  VehicleMediaKind,
} from '../../../generated/prisma/enums';

export const POWERTRAIN_TYPES = Object.values(PowertrainType);
export const BODY_TYPES = Object.values(BodyType);
export const DRIVE_TYPES = Object.values(DriveType);
export const RELIABILITIES = Object.values(Reliability);
export const RANGE_CYCLES = Object.values(RangeCycle);
export const RANGE_TYPES = Object.values(RangeType);
export const PRICE_TYPES = Object.values(PriceType);
export const SOURCE_TYPES = Object.values(SourceType);
export const AVAILABILITIES = Object.values(MarketAvailability);
export const CURRENT_TYPES = Object.values(CurrentType);
export const CONSUMPTION_KINDS = Object.values(ConsumptionKind);
export const CONSUMPTION_MODES = Object.values(ConsumptionMode);
export const VEHICLE_MEDIA_KINDS = Object.values(VehicleMediaKind);
export const SPEC_DATA_TYPES = Object.values(SpecDataType);
export const BETTER_DIRECTIONS = Object.values(BetterDirection);

/** Catalog entries use draft / published / archived only (no editorial review step). */
export const CATALOG_STATUSES = [
  ContentStatus.draft,
  ContentStatus.published,
  ContentStatus.archived,
] as const;
export type CatalogStatus = (typeof CATALOG_STATUSES)[number];

/** Lower-case latin slug (share links /cars/:slug). */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX = 160;
export const MARKET_CODE_RE = /^[A-Z]{2,8}$/;
export const CURRENCY_CODE_RE = /^[A-Z]{3}$/;
export const COUNTRY_CODE_RE = /^[A-Z]{2}$/;

/**
 * A variant is listed in a market's catalog when its row there says
 * "available" or "coming_soon" (announced). Discontinued variants are shown
 * on the model page (labelled) and in the list only on request.
 */
export const LISTED_AVAILABILITIES: MarketAvailability[] = [
  MarketAvailability.available,
  MarketAvailability.coming_soon,
];
export const MODEL_PAGE_AVAILABILITIES: MarketAvailability[] = [
  MarketAvailability.available,
  MarketAvailability.coming_soon,
  MarketAvailability.discontinued,
];

/** Current price preference: official MSRP, then dealer, then market estimate. */
export const PRICE_TYPE_RANK: Record<PriceType, number> = {
  official_msrp: 0,
  dealer: 1,
  market_estimate: 2,
};

/** Permission needed to mark data points as verified (reliability=verified or verifiedAt). */
export const VERIFY_PERMISSION = 'specs.verify';

/** Spec groups in display order (spec_definitions.group). */
export const SPEC_GROUP_ORDER = [
  'battery',
  'charging',
  'performance',
  'dimensions',
  'practicality',
  'safety',
  'comfort',
  'tech',
  'warranty',
] as const;

export const SPEC_GROUP_LABELS: Record<string, { ar: string; en: string }> = {
  general: { ar: 'عام', en: 'General' },
  battery: { ar: 'البطارية', en: 'Battery' },
  charging: { ar: 'الشحن', en: 'Charging' },
  performance: { ar: 'الأداء', en: 'Performance' },
  dimensions: { ar: 'الأبعاد والوزن', en: 'Dimensions & weight' },
  practicality: { ar: 'المساحة والتخزين', en: 'Space & cargo' },
  safety: { ar: 'الأمان', en: 'Safety' },
  comfort: { ar: 'الراحة', en: 'Comfort' },
  tech: { ar: 'التقنيات والبرمجيات', en: 'Technology & software' },
  warranty: { ar: 'الضمان', en: 'Warranty' },
};

export const NOT_AVAILABLE_LABEL = { ar: 'غير متوفر', en: 'Not available' } as const;
