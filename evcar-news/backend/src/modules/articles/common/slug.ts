import { randomBytes } from 'node:crypto';
import { slugify } from '../../../common/i18n/arabic-normalize';

/**
 * Slugs of news content (articles, categories, tags): lower-case letters of
 * any script (Arabic slugs are valid IRIs), digits and single hyphens.
 * UUID-shaped slugs are refused because every public `:slug` route also
 * accepts the id.
 */
export const CONTENT_SLUG_RE = /^[\p{Ll}\p{Lo}\p{Nd}]+(?:-[\p{Ll}\p{Lo}\p{Nd}]+)*$/u;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Path words that would collide with fixed public routes (/articles/preview/...). */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set(['preview', 'new', 'feed', 'rss']);

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function isValidContentSlug(slug: string, maxLength = 200): boolean {
  return (
    slug.length >= 1 &&
    slug.length <= maxLength &&
    CONTENT_SLUG_RE.test(slug) &&
    !isUuid(slug) &&
    !RESERVED_SLUGS.has(slug)
  );
}

/**
 * Builds a slug from the first usable text (e.g. English title, then the
 * original title). Falls back to a short random slug when nothing usable
 * remains (e.g. a title made only of punctuation).
 */
export function slugFromTexts(texts: Array<string | null | undefined>, maxLength = 120): string {
  for (const text of texts) {
    if (!text) continue;
    const slug = slugify(text, maxLength);
    if (slug && isValidContentSlug(slug, maxLength)) return slug;
  }
  return `n-${randomBytes(4).toString('hex')}`;
}

/** `base`, `base-2`, `base-3`… / random suffix: first candidate for which `taken` is false. */
export async function uniqueSlug(
  base: string,
  taken: (candidate: string) => Promise<boolean>,
  maxLength = 200,
): Promise<string> {
  const trimmed = base.slice(0, maxLength - 8).replace(/-+$/, '') || 'n';
  if (!(await taken(trimmed)) && isValidContentSlug(trimmed, maxLength)) return trimmed;
  for (let i = 2; i <= 20; i++) {
    const candidate = `${trimmed}-${i}`;
    if (!(await taken(candidate))) return candidate;
  }
  for (;;) {
    const candidate = `${trimmed}-${randomBytes(3).toString('hex')}`;
    if (!(await taken(candidate))) return candidate;
  }
}
