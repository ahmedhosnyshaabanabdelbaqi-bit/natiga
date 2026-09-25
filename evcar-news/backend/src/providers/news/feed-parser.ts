import { XMLParser } from 'fast-xml-parser';
import sanitizeHtml from 'sanitize-html';
import type { FeedFormat, FeedItem, FeedMeta } from './news.types';

export class FeedParseError extends Error {
  constructor(
    readonly reason: 'not_xml' | 'entity_declarations' | 'unknown_format' | 'malformed',
    message: string,
  ) {
    super(message);
    this.name = 'FeedParseError';
  }
}

const ARRAY_TAGS = new Set([
  'item',
  'entry',
  'link',
  'category',
  'media:content',
  'media:thumbnail',
  'enclosure',
]);
const EXCERPT_MAX = 500;

type Node = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: {
    enabled: true,
    maxEntityCount: 20,
    maxTotalExpansions: 500,
    maxExpandedLength: 50_000,
  },
  htmlEntities: true,
  isArray: (name) => ARRAY_TAGS.has(name),
});

/** Decodes the payload with the charset of the XML declaration / Content-Type (default UTF-8). */
export function decodeFeedBody(body: Buffer, contentType?: string): string {
  const head = body.subarray(0, 200).toString('latin1');
  const declared =
    /<\?xml[^>]*encoding=["']([A-Za-z0-9._-]+)["']/i.exec(head)?.[1] ??
    /charset=([A-Za-z0-9._-]+)/i.exec(contentType ?? '')?.[1] ??
    'utf-8';
  try {
    return new TextDecoder(declared.toLowerCase()).decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body);
  }
}

function textOf(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return textOf(value[0]);
  if (typeof value === 'object') return textOf((value as Node)['#text']);
  return null;
}

/** HTML → plain text (tags removed, entities decoded, whitespace collapsed). */
export function toPlainText(html: string | null, max = EXCERPT_MAX): string | null {
  if (!html) return null;
  const stripped = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  if (!stripped) return null;
  return stripped.length > max ? `${stripped.slice(0, max - 1).trimEnd()}…` : stripped;
}

/** Only absolute http(s) URLs survive (no javascript:, data:, relative junk). */
export function safeHttpUrl(value: string | null, base?: string | null): string | null {
  if (!value) return null;
  try {
    const url = base ? new URL(value, base) : new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function isoDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function asArray(value: unknown): Node[] {
  if (Array.isArray(value)) return value.filter((v): v is Node => !!v && typeof v === 'object');
  return value && typeof value === 'object' ? [value as Node] : [];
}

function categoriesOf(node: Node): string[] {
  const raw = node.category;
  const list = Array.isArray(raw) ? raw : raw !== undefined ? [raw] : [];
  const out = list
    .map((c) => textOf(c) ?? (c && typeof c === 'object' ? textOf((c as Node)['@_term']) : null))
    .filter((c): c is string => !!c)
    .map((c) => c.slice(0, 100));
  return [...new Set(out)].slice(0, 20);
}

function imageOf(node: Node, base: string | null): string | null {
  for (const enc of asArray(node.enclosure)) {
    const type = textOf(enc['@_type']) ?? '';
    if (type.startsWith('image/')) return safeHttpUrl(textOf(enc['@_url']), base);
  }
  for (const tag of ['media:content', 'media:thumbnail']) {
    for (const m of asArray(node[tag])) {
      const medium = textOf(m['@_medium']);
      const type = textOf(m['@_type']) ?? '';
      if (tag === 'media:thumbnail' || medium === 'image' || type.startsWith('image/')) {
        const url = safeHttpUrl(textOf(m['@_url']), base);
        if (url) return url;
      }
    }
  }
  return null;
}

function atomLink(node: Node, base: string | null): string | null {
  const links = asArray(node.link);
  const preferred =
    links.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') ?? links[0] ?? undefined;
  if (preferred) return safeHttpUrl(textOf(preferred['@_href']), base);
  return safeHttpUrl(textOf(node.link), base);
}

function rssItem(node: Node, base: string | null): FeedItem | null {
  const title = toPlainText(textOf(node.title), 500);
  const url = safeHttpUrl(textOf(node.link), base);
  const guid = textOf(node.guid)?.slice(0, 500) ?? null;
  if (!title && !url) return null;
  return {
    guid,
    url: url ?? (guid && /^https?:\/\//i.test(guid) ? safeHttpUrl(guid) : null),
    title: title ?? url ?? '',
    excerpt: toPlainText(textOf(node.description)),
    author: toPlainText(textOf(node.author) ?? textOf(node['dc:creator']), 200),
    publishedAt: isoDate(textOf(node.pubDate) ?? textOf(node['dc:date'])),
    updatedAt: null,
    categories: categoriesOf(node),
    imageUrl: imageOf(node, base),
  };
}

function atomEntry(node: Node, base: string | null): FeedItem | null {
  const title = toPlainText(textOf(node.title), 500);
  const url = atomLink(node, base);
  if (!title && !url) return null;
  const author = asArray(node.author)[0];
  return {
    guid: textOf(node.id)?.slice(0, 500) ?? null,
    url,
    title: title ?? url ?? '',
    excerpt: toPlainText(textOf(node.summary) ?? textOf(node.content)),
    author: toPlainText(author ? textOf(author.name) : null, 200),
    publishedAt: isoDate(textOf(node.published) ?? textOf(node.updated)),
    updatedAt: isoDate(textOf(node.updated)),
    categories: categoriesOf(node),
    imageUrl: imageOf(node, base),
  };
}

/**
 * Parses RSS 2.0, Atom 1.0 and RSS 1.0 (RDF). Documents declaring XML
 * entities are rejected outright (entity-expansion attacks); external
 * entities are never resolved by the parser.
 */
export function parseFeed(xml: string, maxItems = 100): { feed: FeedMeta; items: FeedItem[] } {
  const head = xml.slice(0, 2000).trimStart();
  if (!head.startsWith('<')) throw new FeedParseError('not_xml', 'Response is not XML');
  if (/<!ENTITY/i.test(xml)) {
    throw new FeedParseError('entity_declarations', 'XML entity declarations are not allowed');
  }
  if (/^<!doctype\s+html|^<html/i.test(head)) {
    throw new FeedParseError('not_xml', 'Response is an HTML page, not a feed');
  }
  let doc: Node;
  try {
    doc = parser.parse(xml) as Node;
  } catch (err) {
    throw new FeedParseError('malformed', `Malformed XML: ${(err as Error).message.slice(0, 200)}`);
  }

  let format: FeedFormat;
  let channel: Node;
  let rawItems: Node[];
  if (doc.rss && typeof doc.rss === 'object') {
    format = 'rss2';
    channel = asArray((doc.rss as Node).channel)[0] ?? {};
    rawItems = asArray(channel.item);
  } else if (doc.feed && typeof doc.feed === 'object') {
    format = 'atom';
    channel = doc.feed as Node;
    rawItems = asArray(channel.entry);
  } else if (doc['rdf:RDF'] && typeof doc['rdf:RDF'] === 'object') {
    format = 'rdf';
    const rdf = doc['rdf:RDF'] as Node;
    channel = asArray(rdf.channel)[0] ?? {};
    rawItems = asArray(rdf.item);
  } else {
    throw new FeedParseError('unknown_format', 'Not an RSS, Atom or RDF feed');
  }

  const link = format === 'atom' ? atomLink(channel, null) : safeHttpUrl(textOf(channel.link));
  const feed: FeedMeta = {
    format,
    title: toPlainText(textOf(channel.title), 300),
    link,
    language: (textOf(channel.language) ?? textOf(channel['@_xml:lang']))?.slice(0, 20) ?? null,
  };
  const items: FeedItem[] = [];
  for (const node of rawItems) {
    if (items.length >= maxItems) break;
    const item = format === 'atom' ? atomEntry(node, link) : rssItem(node, link);
    if (item) items.push(item);
  }
  return { feed, items };
}
