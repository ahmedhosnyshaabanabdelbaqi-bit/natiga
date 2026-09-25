import { Prisma } from '../../../generated/prisma/client';
import type { QueryVariant } from '../domain/query-plan';
import { escapeLike, prefixTsQuery, tokensOf } from './text-match';

/** Typo tolerance (pg_trgm word_similarity) only for variants at least this long. */
export const FUZZY_MIN_LENGTH = 4;
/** word_similarity needed for a typo match (e.g. "tesal" ~ "tesla model 3" = 0.5). */
export const WORD_SIMILARITY_THRESHOLD = 0.45;

/** Relevance of each kind of match before the variant weight / document boost. */
export const SCORE = {
  exact: 1,
  prefix: 0.85,
  wordPrefix: 0.75,
  contains: 0.65,
  /** every token found in the text (title, summary, body…) */
  text: 0.45,
  /** multiplied by word_similarity (0.45..1) */
  fuzzy: 0.6,
  /** entity bound to a matched alias */
  pinned: 0.95,
} as const;

export interface VariantSql {
  v: string;
  weight: number;
  prefix: string;
  wordPrefix: string;
  contains: string;
  tsq: string | null;
  tokens: string[];
  fuzzy: boolean;
}

export function variantSql(variants: QueryVariant[]): VariantSql[] {
  return variants.map((x) => {
    const esc = escapeLike(x.text);
    const tokens = tokensOf(x.text).slice(0, 8);
    return {
      v: x.text,
      weight: x.weight,
      prefix: `${esc}%`,
      wordPrefix: `% ${esc}%`,
      contains: `%${esc}%`,
      tsq: prefixTsQuery(x.text),
      tokens,
      fuzzy: x.text.length >= FUZZY_MIN_LENGTH && tokens.length > 0,
    };
  });
}

const f = (n: number) => Prisma.raw(`${n}::float8`);

/** exact > prefix > word prefix > contains on a normalized title expression. */
export function titleScore(title: Prisma.Sql, p: VariantSql): Prisma.Sql {
  return Prisma.sql`(CASE WHEN ${title} = ${p.v} THEN ${f(SCORE.exact)}
    WHEN ${title} LIKE ${p.prefix} THEN ${f(SCORE.prefix)}
    WHEN ${title} LIKE ${p.wordPrefix} THEN ${f(SCORE.wordPrefix)}
    WHEN ${title} LIKE ${p.contains} THEN ${f(SCORE.contains)}
    ELSE ${f(0)} END)`;
}

/** Every token of the variant occurs in the (normalized) text. */
export function allTokensIn(text: Prisma.Sql, p: VariantSql): Prisma.Sql {
  if (p.tokens.length === 0) return Prisma.sql`false`;
  return Prisma.sql`(${Prisma.join(
    p.tokens.map((t) => Prisma.sql`strpos(${text}, ${t}) > 0`),
    ' AND ',
  )})`;
}

/**
 * Typo-tolerant match (`<%` = word_similarity above the transaction's
 * pg_trgm.word_similarity_threshold; uses trigram GIN indexes).
 */
export function fuzzyMatch(text: Prisma.Sql, p: VariantSql): Prisma.Sql {
  return p.fuzzy ? Prisma.sql`(${p.v} <% ${text})` : Prisma.sql`false`;
}

export function fuzzyScore(text: Prisma.Sql, p: VariantSql): Prisma.Sql {
  if (!p.fuzzy) return f(0);
  return Prisma.sql`(CASE WHEN ${p.v} <% ${text} THEN ${f(SCORE.fuzzy)} * word_similarity(${p.v}, ${text})::float8 ELSE ${f(0)} END)`;
}

export function weighted(p: VariantSql, parts: Prisma.Sql[]): Prisma.Sql {
  return Prisma.sql`(${f(p.weight)} * GREATEST(${Prisma.join(parts, ', ')}))`;
}

export function greatest(parts: Prisma.Sql[]): Prisma.Sql {
  return parts.length === 1 ? parts[0] : Prisma.sql`GREATEST(${Prisma.join(parts, ', ')})`;
}

export function anyOf(parts: Prisma.Sql[]): Prisma.Sql {
  return parts.length === 0 ? Prisma.sql`false` : Prisma.sql`(${Prisma.join(parts, ' OR ')})`;
}

export function uuidList(ids: string[]): Prisma.Sql {
  return Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));
}

/** Sets the typo threshold for `<%` for the current transaction only. */
export function setWordSimilarityThreshold(): Prisma.Sql {
  return Prisma.sql`SELECT set_config('pg_trgm.word_similarity_threshold', ${String(WORD_SIMILARITY_THRESHOLD)}, true)`;
}
