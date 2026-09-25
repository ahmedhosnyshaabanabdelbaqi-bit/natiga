/**
 * What the rich text editor may embed. The backend sanitizer
 * (sanitize-html) is the real gate; this keeps editors from inserting
 * content the server would strip anyway.
 */

/** Video hosts supported by the embed extension (privacy-enhanced youtube-nocookie on output). */
export const VIDEO_EMBED_HOSTS = [
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtube-nocookie.com',
] as const;

function parse(url: string): URL | null {
  try {
    return new URL(url.trim());
  } catch {
    return null;
  }
}

/** Returns the normalized https URL when the video host is allow-listed, else null. */
export function allowedVideoUrl(url: string): string | null {
  const u = parse(url);
  if (!u || u.protocol !== 'https:') return null;
  if (!(VIDEO_EMBED_HOSTS as readonly string[]).includes(u.hostname)) return null;
  if (u.hostname === 'youtu.be') return u.pathname.length > 1 ? u.toString() : null;
  const isWatch = u.pathname === '/watch' && !!u.searchParams.get('v');
  const isEmbed = /^\/(embed|shorts)\/[\w-]+/.test(u.pathname);
  return isWatch || isEmbed ? u.toString() : null;
}

/** Images must be https URLs (uploads will come from the media library). No data: URIs. */
export function allowedImageUrl(url: string): string | null {
  const u = parse(url);
  return u && u.protocol === 'https:' ? u.toString() : null;
}

/** Links: https, http and mailto only (never javascript:, data:, …). */
export function isAllowedLink(url: string): boolean {
  const u = parse(url);
  return !!u && ['https:', 'http:', 'mailto:'].includes(u.protocol);
}
