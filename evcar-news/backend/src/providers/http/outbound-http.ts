import { HttpStatus, Injectable } from '@nestjs/common';
import { request } from 'undici';
import { AppConfig } from '../../config/app-config';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { SafeFetchError } from '../../common/security/safe-fetch';
import { SafeFetchService } from '../../common/security/safe-fetch.service';

export interface OutboundRequest {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  /** Objects are JSON-encoded (content-type application/json is added). */
  body?: string | Buffer | Record<string, unknown> | unknown[];
  timeoutMs?: number;
  maxBytes?: number;
  /**
   * false = a 3xx answer is an error (TOO_MANY_REDIRECTS → upstream error).
   * Use it for every request carrying an API key or bearer token.
   */
  followRedirects?: boolean;
}

export interface OutboundResponse {
  status: number;
  headers: Record<string, string>;
  url: string;
  body: Buffer;
  text(): string;
  json<T = unknown>(): T;
}

/** Thrown for HTTP-level failures of an upstream (non-2xx or unparsable body). */
export class UpstreamHttpError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'UpstreamHttpError';
  }
}

/**
 * Outbound HTTP for provider adapters.
 *
 * - `fetch()`: every URL goes through the SSRF-safe fetcher (https only,
 *   public addresses only after DNS resolution, redirects re-validated,
 *   size + time limits). Use it for anything an admin or user can influence
 *   (RSS feeds) and for public SaaS APIs (Open Charge Map, ORS, FCM...).
 * - `fetchOperatorEndpoint()`: for endpoints configured by the operator in
 *   environment variables (OSRM_BASE_URL, GEOCODING_BASE_URL,
 *   ASSISTANT_BASE_URL). https URLs still use the SSRF-safe fetcher; a
 *   plain-http URL (self-hosted service on a private network) is allowed
 *   only for the exact configured origin, never follows redirects and keeps
 *   the same size/time limits.
 */
@Injectable()
export class OutboundHttp {
  constructor(
    private readonly safeFetch: SafeFetchService,
    private readonly config: AppConfig,
  ) {}

  /** SSRF validation (syntax, protocol, port, DNS → public addresses) without fetching. */
  assertUrlAllowed(url: string): Promise<URL> {
    return this.safeFetch.assertUrlAllowed(url);
  }

  async fetch(url: string, req: OutboundRequest = {}): Promise<OutboundResponse> {
    const { headers, body } = encodeBody(req);
    const res = await this.safeFetch.fetch(url, {
      method: req.method ?? 'GET',
      headers: { ...headers, ...(req.headers ?? {}) },
      body,
      timeoutMs: req.timeoutMs,
      maxBytes: req.maxBytes,
      ...(req.followRedirects === false ? { maxRedirects: 0 } : {}),
    });
    return wrap(res.status, res.headers, res.url, res.body);
  }

  async fetchOperatorEndpoint(
    configuredBaseUrl: string,
    url: string,
    req: OutboundRequest = {},
  ): Promise<OutboundResponse> {
    const base = new URL(configuredBaseUrl);
    const target = new URL(url);
    if (target.origin !== base.origin) {
      throw new SafeFetchError(
        'HOST_NOT_ALLOWED',
        'URL does not match the configured endpoint',
        url,
      );
    }
    if (target.protocol === 'https:') return this.fetch(url, req);
    if (target.protocol !== 'http:') {
      throw new SafeFetchError('PROTOCOL_NOT_ALLOWED', 'Only http(s) endpoints are supported', url);
    }
    const timeoutMs = req.timeoutMs ?? this.config.fetch.timeoutMs;
    const maxBytes = req.maxBytes ?? this.config.fetch.maxBytes;
    const { headers, body } = encodeBody(req);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await request(target, {
        method: req.method ?? 'GET',
        headers: {
          'user-agent': this.config.fetch.userAgent,
          accept: 'application/json',
          ...headers,
          ...(req.headers ?? {}),
        },
        body,
        signal: controller.signal,
        headersTimeout: timeoutMs,
        bodyTimeout: timeoutMs,
      });
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of res.body) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        size += buf.length;
        if (size > maxBytes) {
          res.body.destroy();
          throw new SafeFetchError('RESPONSE_TOO_LARGE', `Response exceeds ${maxBytes} bytes`, url);
        }
        chunks.push(buf);
      }
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(res.headers)) {
        if (v !== undefined) flat[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
      }
      return wrap(res.statusCode, flat, url, Buffer.concat(chunks));
    } catch (err) {
      if (err instanceof SafeFetchError) throw err;
      if (controller.signal.aborted) {
        throw new SafeFetchError('TIMEOUT', 'Request timed out', url, { cause: err });
      }
      throw new SafeFetchError('NETWORK_ERROR', (err as Error)?.message ?? 'Network error', url, {
        cause: err,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

function encodeBody(req: OutboundRequest): {
  headers: Record<string, string>;
  body?: string | Buffer;
} {
  if (req.body === undefined) return { headers: {} };
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body))
    return { headers: {}, body: req.body };
  return { headers: { 'content-type': 'application/json' }, body: JSON.stringify(req.body) };
}

function wrap(
  status: number,
  headers: Record<string, string>,
  url: string,
  body: Buffer,
): OutboundResponse {
  return {
    status,
    headers,
    url,
    body,
    text: () => body.toString('utf8'),
    json: <T>() => JSON.parse(body.toString('utf8')) as T,
  };
}

/** Parses a JSON body of a 2xx response or throws UpstreamHttpError. */
export function expectJson<T>(provider: string, res: OutboundResponse): T {
  if (res.status < 200 || res.status >= 300) {
    throw new UpstreamHttpError(provider, res.status, `${provider} answered HTTP ${res.status}`);
  }
  try {
    return res.json<T>();
  } catch {
    throw new UpstreamHttpError(provider, res.status, `${provider} returned invalid JSON`);
  }
}

/**
 * Maps adapter failures to the API error envelope: 502 UPSTREAM_ERROR with
 * a secret-free reason (SSRF refusals keep their code, e.g. BLOCKED_ADDRESS).
 */
export function upstreamException(provider: string, err: unknown): AppException {
  if (err instanceof AppException) return err;
  const reason =
    err instanceof SafeFetchError
      ? err.code
      : err instanceof UpstreamHttpError
        ? `HTTP_${err.status ?? 'ERROR'}`
        : 'ERROR';
  // No free-text message in the response: it could reveal internal host names.
  return new AppException({
    status: HttpStatus.BAD_GATEWAY,
    code: ErrorCode.UPSTREAM_ERROR,
    details: { provider, reason },
    cause: err,
  });
}
