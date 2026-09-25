import type { StatusReporter } from '../provider-status';

export type FeedFormat = 'rss2' | 'atom' | 'rdf';

export interface FeedItem {
  /** RSS guid / Atom id / RDF about (null when absent: dedupe by url). */
  guid: string | null;
  /** Canonical link to the original article (http/https only). */
  url: string | null;
  title: string;
  /**
   * Plain-text excerpt (HTML stripped, max 500 chars). Full article bodies
   * (content:encoded) are deliberately NOT extracted: an RSS feed is not a
   * licence to republish full articles.
   */
  excerpt: string | null;
  author: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  categories: string[];
  imageUrl: string | null;
}

export interface FeedMeta {
  format: FeedFormat;
  title: string | null;
  link: string | null;
  language: string | null;
}

export interface FeedFetchOptions {
  /** Values from the previous fetch for conditional GET. */
  etag?: string | null;
  lastModified?: string | null;
  /** Default 100. */
  maxItems?: number;
}

export type FeedFetchResult =
  | {
      status: 'not_modified';
      url: string;
      etag: string | null;
      lastModified: string | null;
      fetchedAt: string;
    }
  | {
      status: 'ok';
      url: string;
      etag: string | null;
      lastModified: string | null;
      fetchedAt: string;
      feed: FeedMeta;
      items: FeedItem[];
    };

/**
 * Server-side RSS/Atom fetching (contract §4.6 "news"). Every request goes
 * through the SSRF-safe fetcher (https only, public IPs only after DNS
 * resolution, redirects re-validated, size + time limits).
 */
export interface NewsFetcher extends StatusReporter {
  /** Validates a feed URL when an admin saves it (throws 422 FEED_URL_NOT_ALLOWED). */
  validateFeedUrl(url: string): Promise<string>;
  fetchFeed(url: string, opts?: FeedFetchOptions): Promise<FeedFetchResult>;
}
