import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { SafeFetcher, type SafeFetchOptions, type SafeFetchResponse } from './safe-fetch';

/**
 * Injectable SSRF-safe fetcher configured from env (SAFE_FETCH_*,
 * OUTBOUND_USER_AGENT). Use it for EVERY server-side request to a URL that
 * an admin or user can influence (RSS feeds, provider URLs...).
 */
@Injectable()
export class SafeFetchService implements OnApplicationShutdown {
  private readonly fetcher: SafeFetcher;

  constructor(config: AppConfig) {
    this.fetcher = new SafeFetcher({
      timeoutMs: config.fetch.timeoutMs,
      maxBytes: config.fetch.maxBytes,
      maxRedirects: config.fetch.maxRedirects,
      userAgent: config.fetch.userAgent,
    });
  }

  fetch(url: string, opts?: SafeFetchOptions): Promise<SafeFetchResponse> {
    return this.fetcher.fetch(url, opts);
  }

  assertUrlAllowed(url: string): Promise<URL> {
    return this.fetcher.assertUrlAllowed(url);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.fetcher.close();
  }
}
