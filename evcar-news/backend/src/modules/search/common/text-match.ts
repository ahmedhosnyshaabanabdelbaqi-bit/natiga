import { normalizeSearchText } from '../../../common/i18n/arabic-normalize';

/** UTF-16 range inside a returned string (start inclusive, end exclusive). */
export interface TextRange {
  start: number;
  end: number;
}

/**
 * Normalized text (identical to normalizeSearchText / SQL app_normalize_text)
 * plus, for every normalized UTF-16 unit, the range of the original text it
 * came from. Lets the API highlight matches found in normalized text inside
 * the original (diacritics, hamza forms, tatweel, case…).
 */
export interface MappedText {
  text: string;
  starts: number[];
  ends: number[];
}

const WS_RE = /\s/;

/**
 * Character-by-character normalization with an offset map. Returns null in
 * the (rare) cases where per-character normalization differs from the
 * whole-string one (context-dependent lower-casing), so callers simply skip
 * highlighting instead of highlighting the wrong characters.
 */
export function normalizeWithMap(input: string): MappedText | null {
  let text = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let pendingSpace = false;
  let lastEnd = 0;
  let i = 0;
  for (const ch of input) {
    const at = i;
    i += ch.length;
    if (WS_RE.test(ch)) {
      if (text.length > 0) pendingSpace = true;
      continue;
    }
    const n = normalizeSearchText(ch);
    if (n === '') continue;
    if (pendingSpace) {
      text += ' ';
      starts.push(lastEnd);
      ends.push(at);
      pendingSpace = false;
    }
    for (let k = 0; k < n.length; k++) {
      starts.push(at);
      ends.push(at + ch.length);
    }
    text += n;
    lastEnd = at + ch.length;
  }
  if (text !== normalizeSearchText(input)) return null;
  return { text, starts, ends };
}

/** Letters/digits runs of a normalized string (any script). */
export function tokensOf(normalized: string): string[] {
  return normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Normalized text with punctuation turned into single spaces ("mercedes-benz" → "mercedes benz"). */
export function searchForm(normalized: string): string {
  return tokensOf(normalized).join(' ');
}

function mergeRanges(ranges: TextRange[]): TextRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: TextRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

const MAX_RANGES = 20;

/**
 * Ranges of `original` where any of the (normalized) needles occurs. Needles
 * shorter than 2 characters only match at a word start (avoids highlighting
 * every "a"). Overlapping ranges are merged.
 */
export function highlightRanges(original: string | null | undefined, needles: string[]): TextRange[] {
  if (!original) return [];
  const mapped = normalizeWithMap(original);
  if (!mapped || mapped.text.length === 0) return [];
  const found: TextRange[] = [];
  const unique = [...new Set(needles.filter((n) => n.length > 0))].sort(
    (a, b) => b.length - a.length,
  );
  for (const needle of unique) {
    let from = 0;
    for (;;) {
      const idx = mapped.text.indexOf(needle, from);
      if (idx === -1) break;
      from = idx + 1;
      const atWordStart = idx === 0 || !/[\p{L}\p{N}]/u.test(mapped.text[idx - 1]);
      if (needle.length < 2 && !atWordStart) continue;
      found.push({ start: mapped.starts[idx], end: mapped.ends[idx + needle.length - 1] });
      if (found.length >= MAX_RANGES * 3) break;
    }
  }
  return mergeRanges(found).slice(0, MAX_RANGES);
}

/**
 * Plain-text excerpt (≤ maxLength) around the first needle found in `text`;
 * when nothing matches, the beginning of the text. Cuts at word boundaries
 * and marks cuts with "…".
 */
export function snippetAround(
  text: string | null | undefined,
  needles: string[],
  maxLength = 200,
): string | null {
  if (!text) return null;
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length === 0) return null;
  if (clean.length <= maxLength) return clean;
  let hit = -1;
  const mapped = normalizeWithMap(clean);
  if (mapped) {
    for (const needle of needles.filter((n) => n.length >= 2)) {
      const idx = mapped.text.indexOf(needle);
      if (idx !== -1 && (hit === -1 || mapped.starts[idx] < hit)) hit = mapped.starts[idx];
    }
  }
  let start = hit <= 0 ? 0 : Math.max(0, hit - Math.floor(maxLength / 3));
  let end = Math.min(clean.length, start + maxLength);
  if (end - start < maxLength) start = Math.max(0, end - maxLength);
  if (start > 0) {
    const space = clean.indexOf(' ', start);
    if (space !== -1 && space < start + 20 && space < (hit === -1 ? end : hit)) start = space + 1;
  }
  if (end < clean.length) {
    const space = clean.lastIndexOf(' ', end);
    if (space > start + maxLength / 2) end = space;
  }
  return `${start > 0 ? '…' : ''}${clean.slice(start, end).trim()}${end < clean.length ? '…' : ''}`;
}

/** Escapes LIKE wildcards (default escape character is the backslash). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * tsquery text for the 'simple' configuration: every token must match, the
 * last one as a prefix ("tesla & mod:*"). Tokens contain letters/digits only,
 * so no tsquery syntax can be injected. Null when there is no token.
 */
export function prefixTsQuery(normalized: string): string | null {
  const tokens = tokensOf(normalized).slice(0, 8);
  if (tokens.length === 0) return null;
  return tokens.map((t, i) => (i === tokens.length - 1 ? `${t}:*` : t)).join(' & ');
}

/**
 * pg_trgm-compatible trigram similarity (words padded with two spaces in
 * front and one behind; |shared| / |union|). Used for small in-memory sets
 * (aliases) where a database round trip is not worth it.
 */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / (ta.size + tb.size - shared);
}

function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const word of tokensOf(s.toLowerCase())) {
    const padded = [...`  ${word} `];
    for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3).join(''));
  }
  return out;
}
