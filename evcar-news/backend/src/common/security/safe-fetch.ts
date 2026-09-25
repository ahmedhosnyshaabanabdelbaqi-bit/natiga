import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, request, type Dispatcher } from 'undici';

/**
 * SSRF-safe server-side HTTP client for fetching untrusted URLs (RSS feeds,
 * provider endpoints configured by admins, link previews...).
 *
 * Guarantees (each redirect hop is re-checked):
 *  - https only (no credentials in the URL, only allowed ports — 443 by default);
 *  - the host is resolved with DNS and EVERY resolved address must be a public
 *    unicast address (loopback, private, link-local incl. 169.254.169.254
 *    metadata, CGNAT, unique-local, multicast, reserved, NAT64/6to4/Teredo and
 *    IPv4-mapped forms are all rejected); the socket connects to the vetted
 *    address (no DNS-rebinding window);
 *  - IP-literal hosts are checked the same way;
 *  - total time limit and max response size (streamed, aborts early);
 *  - bounded number of redirects; a redirect to ANOTHER origin (scheme, host
 *    or port) never carries the caller's credentials or body: only the
 *    headers in REDIRECT_SAFE_HEADERS survive and the request becomes a GET
 *    without a body (API keys, bearer tokens and message bodies are never
 *    sent to a host the caller did not choose). Callers sending secrets
 *    should additionally pass `maxRedirects: 0`.
 */
export type SafeFetchErrorCode =
  | 'INVALID_URL'
  | 'PROTOCOL_NOT_ALLOWED'
  | 'CREDENTIALS_IN_URL'
  | 'PORT_NOT_ALLOWED'
  | 'HOST_NOT_ALLOWED'
  | 'BLOCKED_ADDRESS'
  | 'DNS_FAILED'
  | 'TOO_MANY_REDIRECTS'
  | 'RESPONSE_TOO_LARGE'
  | 'TIMEOUT'
  | 'NETWORK_ERROR';

export class SafeFetchError extends Error {
  constructor(
    readonly code: SafeFetchErrorCode,
    message: string,
    readonly url?: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'SafeFetchError';
  }
}

export type AddressPolicy = (address: string) => boolean;
export type Resolver = (hostname: string) => Promise<LookupAddress[]>;

/** IPv6 global unicast (2000::/3); everything outside it is never public. */
const IPV6_GLOBAL_UNICAST = ipaddr.parseCIDR('2000::/3');

/** True only for globally routable unicast addresses (IPv4 or IPv6). */
export function isPublicUnicastAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  let parsed: ipaddr.IPv4 | ipaddr.IPv6 = ipaddr.parse(address);
  if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
    parsed = (parsed as ipaddr.IPv6).toIPv4Address();
  }
  if (parsed.kind() === 'ipv6') {
    // Only 2000::/3 is globally routed; this also rejects the deprecated
    // IPv4-compatible form ::a.b.c.d (::/96, e.g. [::127.0.0.1]) that
    // ipaddr.js classifies as plain "unicast".
    const v6 = parsed as ipaddr.IPv6;
    if (!v6.match(IPV6_GLOBAL_UNICAST)) return false;
  }
  return parsed.range() === 'unicast';
}

/** Request headers that may follow a redirect to another origin (everything else is dropped). */
export const REDIRECT_SAFE_HEADERS: ReadonlySet<string> = new Set([
  'accept',
  'accept-language',
  'if-none-match',
  'if-modified-since',
  'cache-control',
]);

function originOf(url: URL): string {
  return `${url.protocol}//${url.hostname.toLowerCase()}:${url.port || (url.protocol === 'https:' ? '443' : '80')}`;
}

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain', '.home.arpa'];

export interface SafeFetchDefaults {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  userAgent: string;
  allowedPorts?: number[];
  /** Address policy; defaults to public unicast only. Tests may inject a stricter/looser one. */
  addressPolicy?: AddressPolicy;
  /** DNS resolver; defaults to the OS resolver (all addresses). */
  resolver?: Resolver;
  /** Extra trusted CA certificates (PEM), e.g. for tests. */
  ca?: string | Buffer | Array<string | Buffer>;
}

export interface SafeFetchOptions {
  method?: 'GET' | 'HEAD' | 'POST';
  headers?: Record<string, string>;
  body?: string | Buffer;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Throw for non-2xx responses (default false: caller inspects `status`). */
  throwOnHttpError?: boolean;
}

export interface SafeFetchResponse {
  status: number;
  headers: Record<string, string>;
  /** Final URL after redirects. */
  url: string;
  redirects: string[];
  body: Buffer;
  contentType?: string;
  text(): string;
  json<T = unknown>(): T;
}

const defaultResolver: Resolver = (hostname) =>
  new Promise((resolve, reject) => {
    dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
      if (err) reject(err);
      else resolve(addresses);
    });
  });

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/** Aborts a response body without leaking an unhandled 'error' event. */
function discardBody(body: Dispatcher.ResponseData['body']): void {
  body.on('error', () => undefined);
  body.destroy();
}

function flattenHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
  }
  return out;
}

export class SafeFetcher {
  private readonly agent: Agent;
  private readonly policy: AddressPolicy;
  private readonly resolver: Resolver;
  private readonly allowedPorts: number[];

  constructor(private readonly defaults: SafeFetchDefaults) {
    this.policy = defaults.addressPolicy ?? isPublicUnicastAddress;
    this.resolver = defaults.resolver ?? defaultResolver;
    this.allowedPorts = defaults.allowedPorts ?? [443];
    const lookup = (hostname: string, options: { all?: boolean }, callback: LookupCallback) => {
      this.resolveVetted(hostname).then(
        (addresses) => {
          if (options?.all) callback(null, addresses);
          else callback(null, addresses[0].address, addresses[0].family);
        },
        (err: NodeJS.ErrnoException) => callback(err, ''),
      );
    };
    this.agent = new Agent({
      connect: {
        lookup,
        timeout: defaults.timeoutMs,
        ...(defaults.ca ? { ca: defaults.ca } : {}),
      },
      headersTimeout: defaults.timeoutMs,
      bodyTimeout: defaults.timeoutMs,
      keepAliveTimeout: 4_000,
    });
  }

  async close(): Promise<void> {
    await this.agent.close();
  }

  /** Validates a URL without fetching it (useful when admins save feed URLs). */
  async assertUrlAllowed(rawUrl: string): Promise<URL> {
    const url = this.checkUrlSyntax(rawUrl);
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(host)) {
      if (!this.policy(host)) {
        throw new SafeFetchError('BLOCKED_ADDRESS', `Address ${host} is not allowed`, rawUrl);
      }
    } else {
      await this.resolveVetted(host);
    }
    return url;
  }

  async fetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResponse> {
    const timeoutMs = opts.timeoutMs ?? this.defaults.timeoutMs;
    const maxBytes = opts.maxBytes ?? this.defaults.maxBytes;
    const maxRedirects = opts.maxRedirects ?? this.defaults.maxRedirects;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const redirects: string[] = [];
    let method = opts.method ?? 'GET';
    let body = opts.body;
    let headers: Record<string, string> = { ...(opts.headers ?? {}) };
    let current = rawUrl;
    let firstOrigin: string | undefined;

    try {
      for (;;) {
        const url = await this.assertUrlAllowed(current);
        firstOrigin ??= originOf(url);
        if (originOf(url) !== firstOrigin) {
          // Cross-origin hop: never forward credentials, API keys or the body.
          headers = Object.fromEntries(
            Object.entries(headers).filter(([k]) => REDIRECT_SAFE_HEADERS.has(k.toLowerCase())),
          );
          if (method !== 'GET' && method !== 'HEAD') method = 'GET';
          body = undefined;
        }
        let res: Dispatcher.ResponseData;
        try {
          res = await request(url, {
            dispatcher: this.agent,
            method,
            body: method === 'GET' || method === 'HEAD' ? undefined : body,
            headers: {
              'user-agent': this.defaults.userAgent,
              accept: '*/*',
              ...headers,
            },
            signal: controller.signal,
          });
        } catch (err) {
          throw this.wrapNetworkError(err, current, controller.signal.aborted);
        }

        const resHeaders = flattenHeaders(res.headers);
        const location = resHeaders.location;
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && location) {
          await res.body.dump().catch(() => undefined);
          if (redirects.length >= maxRedirects) {
            throw new SafeFetchError(
              'TOO_MANY_REDIRECTS',
              `More than ${maxRedirects} redirects`,
              current,
            );
          }
          const next = new URL(location, url).toString();
          redirects.push(next);
          if (
            res.statusCode === 303 ||
            ((res.statusCode === 301 || res.statusCode === 302) && method === 'POST')
          ) {
            method = 'GET';
            body = undefined;
            headers = Object.fromEntries(
              Object.entries(headers).filter(([k]) => k.toLowerCase() !== 'content-type'),
            );
          }
          current = next;
          continue;
        }

        const declared = Number(resHeaders['content-length']);
        if (Number.isFinite(declared) && declared > maxBytes) {
          discardBody(res.body);
          throw new SafeFetchError(
            'RESPONSE_TOO_LARGE',
            `Response exceeds ${maxBytes} bytes`,
            current,
          );
        }
        const chunks: Buffer[] = [];
        let size = 0;
        try {
          for await (const chunk of res.body) {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
            size += buf.length;
            if (size > maxBytes) {
              discardBody(res.body);
              throw new SafeFetchError(
                'RESPONSE_TOO_LARGE',
                `Response exceeds ${maxBytes} bytes`,
                current,
              );
            }
            chunks.push(buf);
          }
        } catch (err) {
          if (err instanceof SafeFetchError) throw err;
          throw this.wrapNetworkError(err, current, controller.signal.aborted);
        }
        const payload = Buffer.concat(chunks);
        if (opts.throwOnHttpError && (res.statusCode < 200 || res.statusCode >= 300)) {
          throw new SafeFetchError('NETWORK_ERROR', `HTTP ${res.statusCode}`, current);
        }
        return {
          status: res.statusCode,
          headers: resHeaders,
          url: current,
          redirects,
          body: payload,
          contentType: resHeaders['content-type'],
          text: () => payload.toString('utf8'),
          json: <T>() => JSON.parse(payload.toString('utf8')) as T,
        };
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private checkUrlSyntax(rawUrl: string): URL {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new SafeFetchError('INVALID_URL', 'Invalid URL', rawUrl);
    }
    if (url.protocol !== 'https:') {
      throw new SafeFetchError(
        'PROTOCOL_NOT_ALLOWED',
        `Only https is allowed (got ${url.protocol})`,
        rawUrl,
      );
    }
    if (url.username || url.password) {
      throw new SafeFetchError('CREDENTIALS_IN_URL', 'Credentials in URLs are not allowed', rawUrl);
    }
    const port = url.port ? Number(url.port) : 443;
    if (!this.allowedPorts.includes(port)) {
      throw new SafeFetchError('PORT_NOT_ALLOWED', `Port ${port} is not allowed`, rawUrl);
    }
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
      throw new SafeFetchError('HOST_NOT_ALLOWED', `Host ${host} is not allowed`, rawUrl);
    }
    return url;
  }

  private async resolveVetted(hostname: string): Promise<LookupAddress[]> {
    let addresses: LookupAddress[];
    try {
      addresses = await this.resolver(hostname);
    } catch (err) {
      throw new SafeFetchError('DNS_FAILED', `DNS lookup failed for ${hostname}`, undefined, {
        cause: err,
      });
    }
    if (addresses.length === 0) {
      throw new SafeFetchError('DNS_FAILED', `No addresses for ${hostname}`);
    }
    const blocked = addresses.find((a) => !this.policy(a.address));
    if (blocked) {
      throw new SafeFetchError('BLOCKED_ADDRESS', `${hostname} resolves to a non-public address`);
    }
    return addresses;
  }

  private wrapNetworkError(err: unknown, url: string, aborted: boolean): SafeFetchError {
    if (err instanceof SafeFetchError) return err;
    const cause = (err as { cause?: unknown })?.cause;
    if (cause instanceof SafeFetchError) return cause;
    const code = (err as { code?: string })?.code;
    if (
      aborted ||
      code === 'UND_ERR_HEADERS_TIMEOUT' ||
      code === 'UND_ERR_BODY_TIMEOUT' ||
      code === 'UND_ERR_CONNECT_TIMEOUT'
    ) {
      return new SafeFetchError('TIMEOUT', 'Request timed out', url, { cause: err });
    }
    return new SafeFetchError('NETWORK_ERROR', (err as Error)?.message ?? 'Network error', url, {
      cause: err,
    });
  }
}
