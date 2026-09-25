import sanitizeHtml from 'sanitize-html';

/** Hosts whose players may be embedded in articles (video embeds allowlist). */
export const DEFAULT_IFRAME_HOSTS = [
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'player.vimeo.com',
] as const;

export interface ArticleSanitizeOptions {
  /**
   * Origins allowed for <img src> in addition to any https URL, e.g. the
   * local media base URL in development (http://localhost:3000).
   */
  extraImageOrigins?: string[];
  /** Override the iframe host allowlist. */
  iframeHosts?: readonly string[];
}

function isAllowedImageSrc(src: string | undefined, extraOrigins: string[]): boolean {
  if (!src) return false;
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  if (url.protocol === 'https:') return true;
  return extraOrigins.some((origin) => {
    try {
      return new URL(origin).origin === url.origin;
    } catch {
      return false;
    }
  });
}

/**
 * Sanitizes rich article / encyclopedia HTML before it is stored (contract:
 * "sanitize-html for article HTML"). Allows headings, lists, tables, links
 * (https/mailto), https images, figure captions, code and iframes from the
 * video allowlist only. Strips scripts, styles, event handlers, javascript:
 * and data: URLs, forms and unknown tags.
 */
export function sanitizeArticleHtml(html: string, opts: ArticleSanitizeOptions = {}): string {
  const extraOrigins = opts.extraImageOrigins ?? [];
  const iframeHosts = [...(opts.iframeHosts ?? DEFAULT_IFRAME_HOSTS)];
  return sanitizeHtml(html, {
    allowedTags: [
      'p',
      'br',
      'hr',
      'h2',
      'h3',
      'h4',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'sub',
      'sup',
      'blockquote',
      'ul',
      'ol',
      'li',
      'a',
      'img',
      'figure',
      'figcaption',
      'table',
      'thead',
      'tbody',
      'tfoot',
      'tr',
      'th',
      'td',
      'caption',
      'colgroup',
      'col',
      'code',
      'pre',
      'span',
      'mark',
      'iframe',
    ],
    allowedAttributes: {
      '*': ['dir', 'lang'],
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
      th: ['colspan', 'rowspan', 'scope'],
      td: ['colspan', 'rowspan'],
      col: ['span'],
      code: ['class'],
      iframe: [
        'src',
        'width',
        'height',
        'title',
        'allow',
        'allowfullscreen',
        'loading',
        'referrerpolicy',
        'sandbox',
      ],
      ol: ['start', 'reversed'],
    },
    allowedClasses: { code: ['language-*'] },
    allowedSchemes: ['https', 'mailto'],
    allowedSchemesByTag: { img: ['https', 'http'], iframe: ['https'] },
    allowedSchemesAppliedToAttributes: ['href', 'src', 'cite'],
    allowProtocolRelative: false,
    allowedIframeHostnames: iframeHosts,
    allowIframeRelativeUrls: false,
    disallowedTagsMode: 'discard',
    nonTextTags: [
      'style',
      'script',
      'textarea',
      'option',
      'noscript',
      'template',
      'object',
      'embed',
    ],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          ...(attribs.target === '_blank' || /^https:/i.test(attribs.href ?? '')
            ? { rel: 'noopener noreferrer nofollow' }
            : {}),
        },
      }),
      img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: 'lazy' } }),
      iframe: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          loading: 'lazy',
          referrerpolicy: 'strict-origin-when-cross-origin',
          sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups',
        },
      }),
    },
    exclusiveFilter: (frame) =>
      (frame.tag === 'img' && !isAllowedImageSrc(frame.attribs.src, extraOrigins)) ||
      (frame.tag === 'iframe' && !frame.attribs.src),
  });
}

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1]?.toLowerCase() === 'x'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return ENTITY_MAP[entity.toLowerCase()] ?? match;
  });
}

/** Plain-text projection of HTML (search index, snippets, share descriptions). */
export function htmlToPlainText(html: string): string {
  const withBreaks = html.replace(
    /<\/(p|h[1-6]|li|tr|blockquote|figcaption|pre)>|<br\s*\/?>/gi,
    '$& ',
  );
  const text = sanitizeHtml(withBreaks, {
    allowedTags: [],
    allowedAttributes: {},
    nonTextTags: ['style', 'script', 'textarea', 'noscript', 'template'],
  });
  return decodeEntities(text).replace(/\s+/g, ' ').trim();
}

// Control characters except \t \n \r, plus zero-width space, BOM and the
// Unicode line/paragraph separators.
const CONTROL_CHARS_RE = new RegExp(
  // eslint-disable-next-line no-control-regex -- intentionally matching control characters
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u200B\\u2028\\u2029\\uFEFF]',
  'g',
);

/**
 * For user/editor text that must never contain markup (hotspot text,
 * comments, reports): strips all tags, decodes entities, removes control
 * characters, normalizes to NFC and trims. Clients must still render it as
 * text (textContent), never as HTML.
 */
export function sanitizePlainText(input: string, maxLength?: number): string {
  const noTags = sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} });
  let text = decodeEntities(noTags)
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS_RE, '')
    .normalize('NFC')
    .trim();
  if (maxLength !== undefined && text.length > maxLength) text = text.slice(0, maxLength);
  return text;
}

/** Escapes text for safe interpolation into server-rendered HTML (share pages). */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
