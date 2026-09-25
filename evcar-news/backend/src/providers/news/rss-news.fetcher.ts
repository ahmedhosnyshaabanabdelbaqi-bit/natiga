import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { SafeFetchError } from '../../common/security/safe-fetch';
import type { OutboundHttp } from '../http/outbound-http';
import { upstreamException, UpstreamHttpError } from '../http/outbound-http';
import { ProviderActivity, type ProviderStatus } from '../provider-status';
import { decodeFeedBody, FeedParseError, parseFeed } from './feed-parser';
import type { FeedFetchOptions, FeedFetchResult, NewsFetcher } from './news.types';
import { serverMessage } from '../../modules/i18n/server-messages';

const FEED_MAX_BYTES = 5 * 1024 * 1024;

/**
 * RSS/Atom fetcher. The rss-import module owns feeds, schedules, dedupe and
 * the editorial policy (headline + link by default); this adapter only
 * fetches safely and parses.
 */
export class RssNewsFetcher implements NewsFetcher {
  private readonly activity = new ProviderActivity();

  constructor(private readonly http: OutboundHttp) {}

  status(): ProviderStatus {
    return {
      type: 'news',
      name: 'rss',
      configured: true,
      notes: [
        'Feeds are fetched server-side over https only; private/loopback addresses are blocked.',
        'Only titles, links and short excerpts are extracted; republishing full articles needs permission.',
      ],
      ...this.activity.snapshot(),
    };
  }

  /** Syntax + DNS/address validation without fetching (used when admins save a feed). */
  async validateFeedUrl(url: string): Promise<string> {
    try {
      return (await this.http.assertUrlAllowed(url)).toString();
    } catch (err) {
      if (err instanceof SafeFetchError && (isRefusal(err) || err.code === 'DNS_FAILED')) {
        throw feedUrlNotAllowed(err);
      }
      throw err;
    }
  }

  async fetchFeed(url: string, opts: FeedFetchOptions = {}): Promise<FeedFetchResult> {
    const headers: Record<string, string> = {
      accept:
        'application/rss+xml, application/atom+xml, application/rdf+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1',
    };
    if (opts.etag) headers['if-none-match'] = opts.etag;
    if (opts.lastModified) headers['if-modified-since'] = opts.lastModified;
    const fetchedAt = new Date().toISOString();
    let res;
    try {
      res = await this.http.fetch(url, { headers, maxBytes: FEED_MAX_BYTES });
    } catch (err) {
      this.activity.failure(err);
      if (err instanceof SafeFetchError && isRefusal(err)) throw feedUrlNotAllowed(err);
      throw upstreamException('news.rss', err);
    }
    const etag = res.headers.etag ?? null;
    const lastModified = res.headers['last-modified'] ?? null;
    if (res.status === 304) {
      this.activity.success();
      return {
        status: 'not_modified',
        url: res.url,
        etag: etag ?? opts.etag ?? null,
        lastModified: lastModified ?? opts.lastModified ?? null,
        fetchedAt,
      };
    }
    if (res.status < 200 || res.status >= 300) {
      const err = new UpstreamHttpError('news.rss', res.status, `Feed answered HTTP ${res.status}`);
      this.activity.failure(err);
      throw upstreamException('news.rss', err);
    }
    try {
      const { feed, items } = parseFeed(
        decodeFeedBody(res.body, res.headers['content-type']),
        opts.maxItems ?? 100,
      );
      this.activity.success();
      return { status: 'ok', url: res.url, etag, lastModified, fetchedAt, feed, items };
    } catch (err) {
      this.activity.failure(err);
      if (err instanceof FeedParseError) {
        throw new AppException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          code: 'FEED_INVALID',
          message: serverMessage('errors.FEED_INVALID'),
          details: { reason: err.reason },
        });
      }
      throw err;
    }
  }
}

const REFUSALS = new Set([
  'INVALID_URL',
  'PROTOCOL_NOT_ALLOWED',
  'CREDENTIALS_IN_URL',
  'PORT_NOT_ALLOWED',
  'HOST_NOT_ALLOWED',
  'BLOCKED_ADDRESS',
]);

function isRefusal(err: SafeFetchError): boolean {
  return REFUSALS.has(err.code);
}

function feedUrlNotAllowed(err: SafeFetchError): AppException {
  return new AppException({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    code: 'FEED_URL_NOT_ALLOWED',
    message: serverMessage('errors.FEED_URL_NOT_ALLOWED'),
    details: { reason: err.code },
  });
}
