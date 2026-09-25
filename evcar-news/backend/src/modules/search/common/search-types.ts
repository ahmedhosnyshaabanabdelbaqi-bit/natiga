import type { SupportedLanguage } from '../../../config/app-config';
import type { QueryPlan } from '../domain/query-plan';
import type { TextRange } from './text-match';
import type { VariantSql } from './sql-scoring';

/** Result groups of GET /search (fixed order). */
export const SEARCH_GROUPS = [
  'articles',
  'brands',
  'models',
  'variants',
  'stations',
  'encyclopedia',
  'services',
] as const;
export type SearchGroupKey = (typeof SEARCH_GROUPS)[number];

export type HitType =
  | 'article'
  | 'brand'
  | 'model'
  | 'variant'
  | 'station'
  | 'encyclopedia'
  | 'service';

export const HIT_TYPE_OF: Record<SearchGroupKey, HitType> = {
  articles: 'article',
  brands: 'brand',
  models: 'model',
  variants: 'variant',
  stations: 'station',
  encyclopedia: 'encyclopedia',
  services: 'service',
};

/** search_documents.entity_type of the index-backed groups. */
export const INDEX_ENTITY_OF: Partial<Record<SearchGroupKey, string>> = {
  articles: 'article',
  brands: 'brand',
  models: 'model',
  variants: 'variant',
};

/** search_aliases.entity_type → group (aliases bound to one entity). */
export const GROUP_OF_ALIAS_ENTITY: Record<string, SearchGroupKey> = {
  article: 'articles',
  brand: 'brands',
  model: 'models',
  variant: 'variants',
  station: 'stations',
  encyclopedia: 'encyclopedia',
  service_provider: 'services',
};

export type MatchKind = 'exact' | 'prefix' | 'text' | 'alias' | 'fuzzy';

export interface SearchHit {
  type: HitType;
  id: string;
  slug: string | null;
  title: string;
  subtitle: string | null;
  snippet: string | null;
  imageUrl: string | null;
  language: SupportedLanguage;
  isFallback: boolean;
  highlights: { title: TextRange[]; snippet: TextRange[] };
  matchedBy: MatchKind;
  score: number;
  isDemo: boolean;
  details: Record<string, unknown>;
}

export interface SearchGroupResult {
  type: SearchGroupKey;
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  items: SearchHit[];
}

/** Ranked id of one group (SQL result). */
export interface RankedRow {
  group: SearchGroupKey;
  id: string;
  score: number;
  total: number;
}

export interface SourceContext {
  plan: QueryPlan;
  variants: VariantSql[];
  lang: SupportedLanguage;
  /** null = every market */
  market: string | null;
  limit: number;
  offset: number;
  /** ids bound to matched aliases, per group */
  pinned: Partial<Record<SearchGroupKey, string[]>>;
}
