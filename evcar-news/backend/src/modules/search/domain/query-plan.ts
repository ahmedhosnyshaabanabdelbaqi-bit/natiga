import { normalizeSearchText } from '../../../common/i18n/arabic-normalize';
import { tokensOf, trigramSimilarity } from '../common/text-match';

/** One active search alias prepared for matching (see AliasIndexService). */
export interface AliasEntry {
  id: string;
  term: string;
  canonical: string;
  /** normalizeSearchText(term) / (canonical) */
  termNormalized: string;
  canonicalNormalized: string;
  entityType: string | null;
  entityId: string | null;
}

export type VariantSource = 'query' | 'alias' | 'fuzzy_alias';

export interface QueryVariant {
  /** Normalized text matched against normalized titles / texts. */
  text: string;
  /** Multiplies the relevance of matches of this variant. */
  weight: number;
  via: VariantSource;
}

export interface QueryPlan {
  query: string;
  normalized: string;
  variants: QueryVariant[];
  expansions: { term: string; canonical: string }[];
  /** Entities bound to a matched alias (always part of the results when visible). */
  pinned: { entityType: string; entityId: string }[];
  /** Normalized strings to highlight (tokens + phrases of every variant). */
  needles: string[];
}

export const MAX_VARIANTS = 8;
export const ALIAS_WEIGHT = 0.95;
export const FUZZY_ALIAS_WEIGHT = 0.8;
export const FUZZY_ALIAS_MIN_SIMILARITY = 0.5;

interface Tok {
  text: string;
  start: number;
  end: number;
}

function tokenSpans(normalized: string): Tok[] {
  return [...normalized.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({
    text: m[0],
    start: m.index,
    end: m.index + m[0].length,
  }));
}

/**
 * Where the token sequence `needle` occurs in `hay` (consecutive tokens):
 * list of [firstTokenIndex] positions.
 */
function findTokenRuns(hay: Tok[], needle: string[]): number[] {
  const out: number[] = [];
  if (needle.length === 0 || needle.length > hay.length) return out;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let ok = true;
    for (let k = 0; k < needle.length; k++) {
      if (hay[i + k].text !== needle[k]) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(i);
  }
  return out;
}

/** Replaces the character span of tokens [i, i+len) of `normalized` by `replacement`. */
function replaceRun(normalized: string, toks: Tok[], i: number, len: number, replacement: string) {
  return (
    normalized.slice(0, toks[i].start) + replacement + normalized.slice(toks[i + len - 1].end)
  ).trim();
}

interface AliasGroup {
  /** canonical display text */
  canonical: string;
  /** every spelling of the group, normalized (canonical first) */
  members: { normalized: string; tokens: string[]; display: string }[];
  entries: AliasEntry[];
}

function groupAliases(aliases: AliasEntry[]): AliasGroup[] {
  const groups = new Map<string, AliasGroup>();
  for (const a of aliases) {
    if (!a.canonicalNormalized || !a.termNormalized) continue;
    let g = groups.get(a.canonicalNormalized);
    if (!g) {
      g = {
        canonical: a.canonical,
        members: [
          {
            normalized: a.canonicalNormalized,
            tokens: tokensOf(a.canonicalNormalized),
            display: a.canonical,
          },
        ],
        entries: [],
      };
      groups.set(a.canonicalNormalized, g);
    }
    g.entries.push(a);
    if (!g.members.some((m) => m.normalized === a.termNormalized)) {
      g.members.push({
        normalized: a.termNormalized,
        tokens: tokensOf(a.termNormalized),
        display: a.term,
      });
    }
  }
  return [...groups.values()];
}

/**
 * Builds the query variants of a search (REQUIREMENTS §4, ARCHITECTURE §4.7):
 * the normalized query, plus one variant per alternative spelling when a
 * spelling of an alias group (canonical + all its terms, e.g. BYD ↔
 * "بي واي دي" ↔ "بى واى دى") occurs in the query as whole tokens. When no
 * alias matches exactly, a single-phrase query close to a spelling
 * (trigram similarity ≥ 0.5, e.g. "زيكرر") uses that group with a lower weight.
 */
export function buildQueryPlan(query: string, aliases: AliasEntry[]): QueryPlan {
  const normalized = normalizeSearchText(query);
  const variants = new Map<string, QueryVariant>();
  const add = (text: string, weight: number, via: VariantSource) => {
    const t = text.replace(/\s+/g, ' ').trim();
    if (!t) return;
    const prev = variants.get(t);
    if (!prev || prev.weight < weight) variants.set(t, { text: t, weight, via });
  };
  add(normalized, 1, 'query');

  const toks = tokenSpans(normalized);
  const expansions = new Map<string, { term: string; canonical: string }>();
  const pinned = new Map<string, { entityType: string; entityId: string }>();
  const groups = groupAliases(aliases);
  let exactHit = false;

  const expandGroup = (
    g: AliasGroup,
    member: AliasGroup['members'][number],
    runs: number[],
    weight: number,
    via: VariantSource,
  ) => {
    for (const other of g.members) {
      if (other.normalized === member.normalized) continue;
      if (runs.length > 0) {
        add(replaceRun(normalized, toks, runs[0], member.tokens.length, other.normalized), weight, via);
      } else {
        add(other.normalized, weight, via);
      }
    }
    expansions.set(`${member.normalized}→${g.canonical}`, {
      term: member.display,
      canonical: g.canonical,
    });
    for (const e of g.entries) {
      if (e.entityType && e.entityId) {
        pinned.set(`${e.entityType}:${e.entityId}`, {
          entityType: e.entityType,
          entityId: e.entityId,
        });
      }
    }
  };

  for (const g of groups) {
    for (const member of g.members) {
      const runs = findTokenRuns(
        toks,
        member.tokens,
      );
      if (runs.length === 0) continue;
      exactHit = true;
      expandGroup(g, member, runs, ALIAS_WEIGHT, 'alias');
    }
  }

  if (!exactHit && toks.length > 0 && toks.length <= 3 && normalized.length >= 4) {
    const scored = groups
      .flatMap((g) =>
        g.members.map((m) => ({ g, m, sim: trigramSimilarity(normalized, m.normalized) })),
      )
      .filter((x) => x.sim >= FUZZY_ALIAS_MIN_SIMILARITY)
      .sort((a, b) => b.sim - a.sim);
    const seen = new Set<AliasGroup>();
    for (const s of scored) {
      if (seen.has(s.g) || seen.size >= 2) continue;
      seen.add(s.g);
      add(s.m.normalized, FUZZY_ALIAS_WEIGHT, 'fuzzy_alias');
      expandGroup(s.g, s.m, [], FUZZY_ALIAS_WEIGHT, 'fuzzy_alias');
    }
  }

  const list = [...variants.values()]
    .sort((a, b) => (a.via === 'query' ? -1 : b.via === 'query' ? 1 : b.weight - a.weight))
    .slice(0, MAX_VARIANTS);
  const needles = new Set<string>();
  for (const v of list) {
    needles.add(v.text);
    for (const t of tokensOf(v.text)) needles.add(t);
  }
  return {
    query,
    normalized,
    variants: list,
    expansions: [...expansions.values()],
    pinned: [...pinned.values()],
    needles: [...needles],
  };
}
