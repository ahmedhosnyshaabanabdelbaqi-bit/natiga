/**
 * Latin slugs for share links (https://evcar.news/cars/<slug>). Generated
 * from the English name when the client sends none; an explicit slug must
 * match SLUG_RE. Uniqueness is checked before writing (409 SLUG_TAKEN) and
 * generated slugs get a numeric suffix instead.
 */
import { slugify } from '../../../common/i18n/arabic-normalize';
import { CatalogErrors, fieldError } from './catalog-errors';
import { SLUG_MAX, SLUG_RE } from './catalog-constants';

/** ASCII-only slug from free text ("Model 3 Long Range" → "model-3-long-range"). */
export function latinSlug(...parts: (string | number | null | undefined)[]): string {
  const text = parts
    .filter((p) => p !== null && p !== undefined && String(p).trim() !== '')
    .join(' ');
  return slugify(text, SLUG_MAX)
    .normalize('NFKD')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-$/, '');
}

export function assertSlugFormat(slug: string, field = 'slug'): void {
  if (!SLUG_RE.test(slug) || slug.length > SLUG_MAX) {
    throw fieldError(field, 'slug', {
      ar: 'المعرّف النصي يجب أن يتكون من حروف لاتينية صغيرة وأرقام وشرطات فقط.',
      en: 'The slug may only contain lower-case latin letters, digits and dashes.',
    });
  }
}

/**
 * Returns a free slug: the explicit one (409 when taken by another row) or
 * a generated one with "-2", "-3"... when needed.
 */
export async function resolveSlug(
  explicit: string | null | undefined,
  generatedFrom: string,
  isTaken: (slug: string) => Promise<boolean>,
  maxLength = SLUG_MAX,
): Promise<string> {
  if (explicit) {
    assertSlugFormat(explicit);
    if (await isTaken(explicit)) throw CatalogErrors.slugTaken(explicit);
    return explicit;
  }
  const base = (generatedFrom || 'item').slice(0, maxLength - 4).replace(/-$/, '') || 'item';
  if (!(await isTaken(base))) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  throw CatalogErrors.slugTaken(base);
}
