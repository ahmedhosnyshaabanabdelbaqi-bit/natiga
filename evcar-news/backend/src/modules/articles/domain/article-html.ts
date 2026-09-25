import sanitizeHtml from 'sanitize-html';
import { htmlToPlainText, sanitizeArticleHtml } from '../../../common/sanitize/html-sanitizer';

/** Video players that may be embedded in articles (privacy-friendly hosts only). */
export const ARTICLE_IFRAME_HOSTS = ['www.youtube-nocookie.com', 'player.vimeo.com'] as const;

const YOUTUBE_EMBED_RE =
  /^https:\/\/(?:www\.)?(?:youtube\.com|youtube-nocookie\.com)\/embed\/([A-Za-z0-9_-]{6,20})\/?$/;
const VIMEO_EMBED_RE = /^https:\/\/player\.vimeo\.com\/video\/(\d{1,15})\/?$/;
/** Query parameters kept on embeds (everything else — tracking, autoplay tricks — is dropped). */
const YOUTUBE_PARAMS = new Set(['start', 'end', 'rel', 'controls', 'cc_lang_pref', 'hl']);
const VIMEO_PARAMS = new Set(['h', 'start', 'texttrack']);

/**
 * Normalizes a video embed URL: YouTube → youtube-nocookie.com, Vimeo →
 * player.vimeo.com with `dnt=1`. Returns null for any other URL.
 */
export function normalizeEmbedUrl(src: string | undefined): string | null {
  if (!src) return null;
  let url: URL;
  try {
    url = new URL(src.trim());
  } catch {
    return null;
  }
  const base = `${url.protocol}//${url.host}${url.pathname}`;
  const yt = YOUTUBE_EMBED_RE.exec(base);
  if (yt) {
    const out = new URL(`https://www.youtube-nocookie.com/embed/${yt[1]}`);
    for (const [k, v] of url.searchParams) if (YOUTUBE_PARAMS.has(k)) out.searchParams.set(k, v);
    return out.toString();
  }
  const vimeo = VIMEO_EMBED_RE.exec(base);
  if (vimeo) {
    const out = new URL(`https://player.vimeo.com/video/${vimeo[1]}`);
    for (const [k, v] of url.searchParams) if (VIMEO_PARAMS.has(k)) out.searchParams.set(k, v);
    out.searchParams.set('dnt', '1');
    return out.toString();
  }
  return null;
}

export interface PreparedArticleHtml {
  /** Sanitized HTML to store (article_translations.body_html). */
  html: string;
  /** Plain-text projection (search, snippets, reading time). */
  text: string;
  /** Every <img src> of the input, in order (the caller checks media rights). */
  imageSources: string[];
  /** iframe sources that are not an allowed video embed (the caller rejects them). */
  rejectedEmbeds: string[];
}

/**
 * Server-side HTML policy of article bodies (REQUIREMENTS §5, §19): the
 * shared sanitizer (headings, lists, tables, figure/figcaption, https
 * links, images) with iframes limited to youtube-nocookie / Vimeo players.
 * YouTube embeds are rewritten to youtube-nocookie.com. Images are returned
 * so the service can require that each one is a licensed media-library
 * image (media rights), and non-video iframes are reported instead of being
 * dropped silently.
 */
export function prepareArticleHtml(
  raw: string,
  opts: { mediaOrigins?: string[] } = {},
): PreparedArticleHtml {
  const imageSources: string[] = [];
  const rejectedEmbeds: string[] = [];
  // Pass 1 (no sanitation yet): normalize embeds and collect images.
  const normalized = sanitizeHtml(raw, {
    allowedTags: false,
    allowedAttributes: false,
    allowVulnerableTags: true,
    exclusiveFilter: (frame) => {
      if (frame.tag === 'img') imageSources.push((frame.attribs.src ?? '').trim());
      return frame.tag === 'iframe' && !frame.attribs.src;
    },
    transformTags: {
      iframe: (tagName, attribs) => {
        const src = normalizeEmbedUrl(attribs.src);
        if (!src) rejectedEmbeds.push(attribs.src ?? '');
        return { tagName, attribs: { ...attribs, src: src ?? '' } };
      },
    },
  });
  // Pass 2: the shared sanitizer with the embed allowlist.
  const html = sanitizeArticleHtml(normalized, {
    iframeHosts: ARTICLE_IFRAME_HOSTS,
    extraImageOrigins: opts.mediaOrigins ?? [],
  }).trim();
  return { html, text: htmlToPlainText(html), imageSources, rejectedEmbeds };
}

/** Rough reading time (≈ 200 words per minute, at least 1 minute for any text). */
export function readingMinutes(text: string): number | null {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words === 0) return null;
  return Math.max(1, Math.round(words / 200));
}
