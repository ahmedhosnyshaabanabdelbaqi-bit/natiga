/**
 * Public API of the vehicles module for other modules (import VehiclesModule
 * in your module to inject the services):
 *
 *   import { CarPagesService, VehicleSearchIndexer } from '../vehicles';
 *   const sheet = await carPages.variantSheet(variantId, 'EG', 'ar', undefined, { related: false });
 *
 * Pure helpers (no DI): spec scoping / derived values, visibility filters,
 * price selection, unit canonicalisation.
 */
export { CarPagesService } from './public/car-pages.service';
export { MarketContextService } from './public/market-context';
export { MediaUrlService, IMAGE_ASSET_INCLUDE } from './common/media-urls';
export { VehicleSearchIndexer } from './search/vehicle-search-indexer';
export { pointsByKey, scopeSpecs, specPoint, buildSpecGroups } from './public/spec-sheet';
export {
  PUBLIC_BRAND_WHERE,
  PUBLIC_MODEL_WHERE,
  PUBLIC_VARIANT_WHERE,
  variantsInMarketWhere,
} from './common/visibility';
export { pickCurrentPrice, sortPriceHistory, priceView, rangeView } from './common/views';
export { toCanonical, normalizeUnit } from './common/catalog-units';
export type { VariantSheetDto, CarCardDto, CarDetailDto } from './dto/public.dto';
