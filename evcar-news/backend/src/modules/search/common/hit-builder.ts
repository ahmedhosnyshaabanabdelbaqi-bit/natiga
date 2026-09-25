import type { SupportedLanguage } from '../../../config/app-config';
import { normalizeSearchText } from '../../../common/i18n/arabic-normalize';
import type { QueryPlan } from '../domain/query-plan';
import type { HitType, MatchKind, SearchHit } from './search-types';
import { highlightRanges, snippetAround, tokensOf } from './text-match';

const containsWord = (hay: string, needle: string) =>
  hay.startsWith(needle) || hay.includes(` ${needle}`);

/**
 * How a hit matched (for the UI "matched via alternative spelling" hint and
 * tests): exact / prefix on the title, text (every token somewhere in the
 * texts), alias (through an alternative spelling or an alias bound to the
 * entity) or fuzzy (typo tolerance).
 */
export function matchKind(
  plan: QueryPlan,
  title: string,
  otherTexts: (string | null | undefined)[],
  pinned: boolean,
): MatchKind {
  const t = normalizeSearchText(title);
  for (const v of plan.variants) {
    const viaAlias = v.via !== 'query';
    if (t === v.text) return viaAlias ? 'alias' : 'exact';
    if (containsWord(t, v.text)) return viaAlias ? 'alias' : 'prefix';
  }
  const hay = normalizeSearchText([title, ...otherTexts].filter(Boolean).join(' '));
  for (const v of plan.variants) {
    const tokens = tokensOf(v.text);
    if (tokens.length > 0 && tokens.every((tok) => hay.includes(tok))) {
      return v.via === 'query' ? 'text' : 'alias';
    }
  }
  if (pinned) return 'alias';
  return 'fuzzy';
}

export interface HitInput {
  type: HitType;
  id: string;
  slug: string | null;
  title: string;
  subtitle: string | null;
  /** Texts a snippet may be taken from, in order of preference. */
  snippetSources: (string | null | undefined)[];
  imageUrl: string | null;
  language: SupportedLanguage;
  requested: SupportedLanguage;
  score: number;
  pinned: boolean;
  isDemo: boolean;
  details: Record<string, unknown>;
}

const SNIPPET_MAX = 200;

/** Builds the API hit: snippet around the match + highlight ranges. */
export function buildHit(plan: QueryPlan, input: HitInput): SearchHit {
  const needles = plan.needles;
  const sources = input.snippetSources.filter((s): s is string => !!s && s.trim().length > 0);
  const normalizedNeedles = needles.filter((n) => n.length >= 2);
  const withMatch = sources.find((s) => {
    const n = normalizeSearchText(s);
    return normalizedNeedles.some((needle) => n.includes(needle));
  });
  const snippet = snippetAround(withMatch ?? sources[0] ?? null, needles, SNIPPET_MAX);
  return {
    type: input.type,
    id: input.id,
    slug: input.slug,
    title: input.title,
    subtitle: input.subtitle,
    snippet,
    imageUrl: input.imageUrl,
    language: input.language,
    isFallback: input.language !== input.requested,
    highlights: {
      title: highlightRanges(input.title, needles),
      snippet: highlightRanges(snippet, needles),
    },
    matchedBy: matchKind(plan, input.title, [input.subtitle, ...sources], input.pinned),
    score: Math.round(input.score * 1000) / 1000,
    isDemo: input.isDemo,
    details: input.details,
  };
}
