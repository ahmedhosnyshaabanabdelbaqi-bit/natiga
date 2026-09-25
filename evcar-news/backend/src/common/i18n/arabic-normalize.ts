/**
 * Arabic-aware text normalization for search.
 *
 * `normalizeSearchText` MUST produce exactly the same output as the SQL
 * function `app_normalize_text()` defined in the initial migration (used by
 * triggers on search_documents / search_aliases / charging_stations), so the
 * same normalization is applied to indexed text and to user queries.
 * (An e2e test compares both on sample strings.)
 *
 * Steps: NFKD → remove combining marks (Latin accents, Arabic harakat/tanween/
 * shadda/sukun, hamza & madda marks, Quranic marks) and tatweel →
 * ٱ→ا, ى→ي, ة→ه, Persian ی→ي, ک→ك → Arabic-Indic digits → 0-9 →
 * lower-case → collapse whitespace → trim.
 * NFKD already decomposes أ/إ/آ/ؤ/ئ into the bare letter + a mark, and
 * presentation forms (e.g. ﻻ) into base letters.
 */
const MARKS_RE = /[\u0300-\u036F\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

const CHAR_MAP: Record<string, string> = {
  ٱ: 'ا',
  ى: 'ي',
  ة: 'ه',
  ی: 'ي',
  ک: 'ك',
};
const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;

function mapChar(ch: string): string {
  const mapped = CHAR_MAP[ch];
  if (mapped) return mapped;
  const code = ch.charCodeAt(0);
  if (code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9) {
    return String(code - ARABIC_INDIC_ZERO);
  }
  if (code >= EXTENDED_ARABIC_INDIC_ZERO && code <= EXTENDED_ARABIC_INDIC_ZERO + 9) {
    return String(code - EXTENDED_ARABIC_INDIC_ZERO);
  }
  return ch;
}

export function normalizeSearchText(input: string): string;
export function normalizeSearchText(input: string | null | undefined): string | null;
export function normalizeSearchText(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const stripped = input.normalize('NFKD').replace(MARKS_RE, '');
  let mapped = '';
  for (const ch of stripped) mapped += mapChar(ch);
  return mapped.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Arabic script detection (used e.g. to pick the display name language). */
export function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

/**
 * URL slug: normalized text where every run of characters that are not
 * letters/digits (any script) becomes "-". Arabic letters are kept (they are
 * valid in IRIs); callers may prefer a Latin slug when an English name exists.
 */
export function slugify(input: string, maxLength = 120): string {
  const normalized = normalizeSearchText(input);
  const slug = normalized
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  if (slug.length <= maxLength) return slug;
  return slug.slice(0, maxLength).replace(/-[^-]*$/, '') || slug.slice(0, maxLength);
}
