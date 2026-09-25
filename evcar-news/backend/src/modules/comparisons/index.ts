/**
 * Public API of the comparisons module for other modules (import
 * ComparisonsModule to inject the services):
 *
 *   import { ComparisonsService } from '../comparisons';
 *   const cards = await comparisons.featured('EG', 'ar', 6);   // home "مقارنات مختارة"
 *
 * The engine is pure (no DI) and can be used directly on CarFacts.
 */
export { ComparisonsService } from './services/comparisons.service';
export {
  ComparisonComputeService,
  NO_SPONSOR_DISCLOSURE,
} from './services/comparison-compute.service';
export { ItemResolverService, comparisonSignature } from './services/item-resolver.service';
export { compareCars } from './engine/compare';
export * from './engine/facts';
export type {
  CarFacts,
  Comparability,
  Metric,
  MetricGroup,
  MetricValue,
  SpecDefLite,
} from './engine/types';
export type { ComparisonDto, ComparisonResultDto } from './dto/comparison.dto';
