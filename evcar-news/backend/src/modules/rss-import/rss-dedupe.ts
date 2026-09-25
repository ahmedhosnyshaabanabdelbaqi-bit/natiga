import { createHash } from 'node:crypto';
import { normalizeSearchText } from '../../common/i18n/arabic-normalize';
import { RssUsagePolicy } from '../../generated/prisma/enums';

/**
 * De-duplication keys of RSS items (docs/decisions/phase2-schema.md §5):
 *   urlHash     = sha256(canonical URL)  — unique over all feeds
 *   guidHash    = sha256(guid)           — unique per feed
 *   contentHash = sha256(normalized title + "\n" + normalized summary)
 *                 — same story from another URL / feed → status "duplicate"
 */
export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Query parameters that only track clicks (removed from canonical URLs). */
const TRACKING_PARAMS =
  /^(utm_[a-z0-9_]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|_ga|ref_src)$/i;

/**
 * Canonical form of an article URL: lower-case scheme and host, no
 * fragment, no default port, tracking parameters removed, remaining
 * parameters sorted, trailing slash of non-root paths removed. Returns null
 * for anything but http(s).
 */
export function canonicalizeUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.hash = '';
  url.username = '';
  url.password = '';
  if (
    (url.protocol === 'https:' && url.port === '443') ||
    (url.protocol === 'http:' && url.port === '80')
  ) {
    url.port = '';
  }
  const params = [...url.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAMS.test(k))
    .sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv));
  url.search = '';
  for (const [k, v] of params) url.searchParams.append(k, v);
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString();
}

export function contentHashOf(title: string, summary: string | null | undefined): string {
  return sha256Hex(`${normalizeSearchText(title)}\n${normalizeSearchText(summary ?? '')}`);
}

export interface DedupeKeys {
  canonicalUrl: string;
  urlHash: string;
  guidHash: string | null;
  contentHash: string;
}

export function dedupeKeys(item: {
  url: string;
  guid: string | null;
  title: string;
  summary: string | null;
}): DedupeKeys | null {
  const canonicalUrl = canonicalizeUrl(item.url);
  if (!canonicalUrl) return null;
  return {
    canonicalUrl,
    urlHash: sha256Hex(canonicalUrl),
    guidHash: item.guid ? sha256Hex(item.guid) : null,
    contentHash: contentHashOf(item.title, item.summary),
  };
}

/** API names of the licence modes ↔ database enum. */
export const LICENSE_MODES = ['link_only', 'summary_only', 'full_permitted'] as const;
export type LicenseMode = (typeof LICENSE_MODES)[number];

export function toUsagePolicy(mode: LicenseMode): RssUsagePolicy {
  switch (mode) {
    case 'summary_only':
      return RssUsagePolicy.summary_with_link;
    case 'full_permitted':
      return RssUsagePolicy.full_content_licensed;
    default:
      return RssUsagePolicy.headline_link_only;
  }
}

export function toLicenseMode(policy: RssUsagePolicy): LicenseMode {
  switch (policy) {
    case RssUsagePolicy.summary_with_link:
      return 'summary_only';
    case RssUsagePolicy.full_content_licensed:
      return 'full_permitted';
    default:
      return 'link_only';
  }
}

/** Anything beyond headline + link (or showing feed images) needs a recorded permission. */
export function needsPermission(mode: LicenseMode, allowImages: boolean): boolean {
  return mode !== 'link_only' || allowImages;
}

/** What a draft created from an item may contain under the feed licence. */
export interface DraftContentPolicy {
  /** Copy the feed excerpt as the article summary. */
  summary: boolean;
  /** Copy the excerpt into the body (the parser never extracts full articles). */
  body: boolean;
  /** Keep the feed image URL for the editor (never used as a cover automatically). */
  image: boolean;
}

export function draftPolicy(mode: LicenseMode, allowImages: boolean): DraftContentPolicy {
  return {
    summary: mode !== 'link_only',
    body: mode === 'full_permitted',
    image: allowImages,
  };
}

/** "en-US" → "en"; anything but ar/en → null. */
export function normalizeLanguage(value: string | null | undefined): 'ar' | 'en' | null {
  const primary = value?.trim().toLowerCase().split(/[-_]/)[0];
  return primary === 'ar' || primary === 'en' ? primary : null;
}
