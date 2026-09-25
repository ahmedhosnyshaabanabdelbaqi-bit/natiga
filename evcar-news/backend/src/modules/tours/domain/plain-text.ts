/**
 * Hotspot texts are PLAIN TEXT in Arabic and English (REQUIREMENTS §19 "لا
 * تمرر HTML أو JavaScript غير موثوق من Hotspots"). Whatever an editor pastes
 * is reduced to text: tags (and the content of script / style / template
 * blocks) are removed, entities decoded, control and bidi-override
 * characters dropped, and any remaining "<" that could start markup is
 * separated from the next character (the database CHECK refuses "<" followed
 * by a letter, "/", "!" or "?"). The viewer still renders with textContent.
 * Pure — unit tested.
 */

const BLOCKS =
  /<(script|style|template|iframe|object|embed|noscript|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const COMMENTS = /<!--[\s\S]*?(-->|$)/g;
const BREAKS =
  /<\s*(br|p|div|li|h[1-6]|tr|hr)\b[^>]*>|<\s*\/\s*(p|div|h[1-6]|tr|ul|ol|table|blockquote)\s*>/gi;
const TAGS = /<\/?[A-Za-z][^>]*>|<![^>]*>|<\?[^>]*>/g;
const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,6});/gi, (all, ent: string) => {
    const lower = ent.toLowerCase();
    if (lower.startsWith('#x')) return safeChar(parseInt(lower.slice(2), 16), all);
    if (lower.startsWith('#')) return safeChar(parseInt(lower.slice(1), 10), all);
    return NAMED[lower] ?? all;
  });
}

function safeChar(code: number, fallback: string): string {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return fallback;
  if (code >= 0xd800 && code <= 0xdfff) return fallback;
  return String.fromCodePoint(code);
}

export interface PlainTextOptions {
  /** Keep line breaks (bodies) or collapse everything to one line (titles). */
  multiline: boolean;
}

/** Plain text of an editor input (see file doc). Returns '' for blank input. */
export function toPlainText(input: string, opts: PlainTextOptions): string {
  let text = input.replace(/\r\n?/g, '\n');
  text = text.replace(BLOCKS, ' ').replace(COMMENTS, ' ');
  text = text.replace(BREAKS, opts.multiline ? '\n' : ' ');
  // Repeat: removing one tag can join the pieces of another ("<scr<b>ipt>").
  for (let i = 0; i < 5; i++) {
    const next = text.replace(TAGS, '');
    if (next === text) break;
    text = next;
  }
  text = decodeEntities(text);
  // Decoded "&lt;b&gt;" is text now, but must not look like markup to any consumer.
  text = text.replace(/<(?=[A-Za-z/!?])/g, '< ');
  text = text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/[ \t\u00A0]+/g, ' ');
  if (opts.multiline) {
    text = text
      .split('\n')
      .map((l) => l.trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n');
  } else {
    text = text.replace(/\s+/g, ' ');
  }
  return text.trim();
}

/** Latin slug from free text ("Black / Red" → "black-red"). */
export function slugify(text: string, max = 60): string {
  return text
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}
