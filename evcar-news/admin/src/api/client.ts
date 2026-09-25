import { ApiError, apiErrorFromBody, CLIENT_ERROR_CODES } from './errors';
import { emitSessionEvent } from './session';
import { tokenStore } from './tokenStore';
import type { AuthSession, ItemResponse } from './types';

/**
 * Thin fetch wrapper for the EV Car News API (ARCHITECTURE.md §4.3/§4.4.1).
 *
 * - Base URL `/api/v1` (proxied to the backend by Vite in dev) or VITE_API_BASE_URL.
 * - Always sends `X-Client-Type: web` so the refresh token travels only as the
 *   httpOnly `evcar_rt` cookie; the access token is kept in memory.
 * - On `401 TOKEN_EXPIRED` it refreshes once (single-flight, shared by all
 *   concurrent requests, serialised across tabs with the Web Locks API) and
 *   retries the original request once.
 * - Non-2xx responses are thrown as `ApiError` parsed from the error envelope.
 */

function normalizeBase(base: string): string {
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

export const API_BASE_URL = normalizeBase(import.meta.env.VITE_API_BASE_URL || '/api/v1');

interface RequestContext {
  lang: string;
  market: string | null;
}

const requestContext: RequestContext = { lang: 'ar', market: null };

/** Called by the i18n/market providers so every request carries lang/market. */
export function setRequestContext(partial: Partial<RequestContext>): void {
  Object.assign(requestContext, partial);
}

export function getRequestContext(): Readonly<RequestContext> {
  return requestContext;
}

export type QueryPrimitive = string | number | boolean | null | undefined;
export type QueryValue = QueryPrimitive | QueryPrimitive[];
export type QueryParams = Record<string, QueryValue>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: QueryParams | undefined;
  /** JSON-serialised unless it is FormData/Blob. */
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal | undefined;
  /**
   * `true` (default): attach the bearer token and handle TOKEN_EXPIRED.
   * `false`: anonymous request (login, forgot password, app-config...).
   */
  auth?: boolean;
  /** Set to false to attach the token without the refresh/retry dance (logout). */
  refreshOnExpired?: boolean;
}

export function buildUrl(path: string, query?: QueryParams): string {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      if (v === undefined || v === null || v === '') continue;
      params.append(key, String(v));
    }
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

function isBinaryBody(body: unknown): body is BodyInit {
  return (
    (typeof FormData !== 'undefined' && body instanceof FormData) ||
    (typeof Blob !== 'undefined' && body instanceof Blob) ||
    (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams)
  );
}

async function send(path: string, opts: RequestOptions, token: string | null): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Client-Type': 'web',
    'Accept-Language': requestContext.lang,
    ...(requestContext.market ? { 'X-Market': requestContext.market } : {}),
    ...opts.headers,
  };
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    if (isBinaryBody(opts.body)) {
      body = opts.body;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    return await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body: body ?? null,
      credentials: 'include',
      signal: opts.signal ?? null,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError({
      status: 0,
      code: CLIENT_ERROR_CODES.network,
      message: error instanceof Error ? error.message : 'Network error',
    });
  }
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('json')) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  return text;
}

async function handle<T>(response: Response): Promise<T> {
  if (response.status === 204 || response.status === 205) return undefined as T;
  const body = await readBody(response);
  if (!response.ok) {
    throw apiErrorFromBody(response.status, body, response.headers.get('x-request-id'));
  }
  return body as T;
}

// ---------------------------------------------------------------------------
// Refresh (single-flight)
// ---------------------------------------------------------------------------

const REFRESH_LOCK = 'evcar-admin-auth-refresh';
let inflightRefresh: Promise<AuthSession | null> | null = null;

function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<AuthSession>;
  return typeof v.accessToken === 'string' && !!v.user && typeof v.user === 'object';
}

/** Stores a login/refresh result and notifies listeners. */
export function applySession(session: AuthSession): AuthSession {
  tokenStore.set(session.accessToken, session.accessTokenExpiresIn);
  emitSessionEvent({ type: 'refreshed', user: session.user });
  return session;
}

async function doRefresh(): Promise<AuthSession | null> {
  const hadSession = tokenStore.get() !== null;
  const response = await send('/auth/refresh', { method: 'POST', body: {} }, null);
  if (response.ok) {
    const body = (await readBody(response)) as ItemResponse<AuthSession> | undefined;
    if (!body || !isAuthSession(body.data)) {
      throw new ApiError({
        status: response.status,
        code: CLIENT_ERROR_CODES.invalidResponse,
        message: 'Invalid refresh response',
      });
    }
    return applySession(body.data);
  }
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    // The refresh cookie is missing, expired, rotated elsewhere or revoked.
    tokenStore.clear();
    if (hadSession) emitSessionEvent({ type: 'expired' });
    return null;
  }
  throw apiErrorFromBody(
    response.status,
    await readBody(response),
    response.headers.get('x-request-id'),
  );
}

function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks && typeof locks.request === 'function') {
    return locks.request(REFRESH_LOCK, { mode: 'exclusive' }, fn) as Promise<T>;
  }
  return fn();
}

/**
 * Exchanges the httpOnly refresh cookie for a new access token.
 * Resolves `null` when the server rejects the refresh (user must sign in again),
 * rejects with an ApiError for network/server failures.
 * Concurrent callers share one request.
 */
export function refreshSession(): Promise<AuthSession | null> {
  if (!inflightRefresh) {
    inflightRefresh = withRefreshLock(doRefresh).finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

/**
 * Resolves once any in-flight refresh has settled. Used by logout so a refresh
 * that started earlier cannot re-authenticate the user after signing out.
 */
export async function waitForPendingRefresh(): Promise<void> {
  if (inflightRefresh) await inflightRefresh.catch(() => null);
}

// ---------------------------------------------------------------------------
// Public request API
// ---------------------------------------------------------------------------

export async function apiRequest<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const useAuth = opts.auth !== false;
  const allowRefresh = useAuth && opts.refreshOnExpired !== false;

  if (allowRefresh && tokenStore.isExpired()) {
    // Proactive refresh saves a round-trip; errors fall through to the 401 path.
    await refreshSession().catch(() => null);
  }

  const response = await send(path, opts, useAuth ? tokenStore.get() : null);
  if (response.status !== 401 || !useAuth) return handle<T>(response);

  const error = apiErrorFromBody(
    401,
    await readBody(response),
    response.headers.get('x-request-id'),
  );

  if (allowRefresh && error.code === 'TOKEN_EXPIRED') {
    const session = await refreshSession();
    if (!session) {
      throw new ApiError({
        status: 401,
        code: CLIENT_ERROR_CODES.sessionExpired,
        message: 'Session expired',
        requestId: error.requestId,
      });
    }
    // Retry exactly once; a second 401 is surfaced as-is.
    return handle<T>(await send(path, opts, tokenStore.get()));
  }

  if (tokenStore.get() !== null && allowRefresh) {
    // Any other 401 while we believed we were signed in (revoked session,
    // disabled account...) ends the session.
    tokenStore.clear();
    emitSessionEvent({ type: 'expired' });
  }
  throw error;
}

export const api = {
  get<T>(path: string, query?: QueryParams, opts: Omit<RequestOptions, 'method' | 'query'> = {}) {
    return apiRequest<T>(path, { ...opts, method: 'GET', query });
  },
  post<T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return apiRequest<T>(path, { ...opts, method: 'POST', body });
  },
  put<T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return apiRequest<T>(path, { ...opts, method: 'PUT', body });
  },
  patch<T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return apiRequest<T>(path, { ...opts, method: 'PATCH', body });
  },
  delete<T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return apiRequest<T>(path, { ...opts, method: 'DELETE', body });
  },
};

/** Unwraps `{ data }` of a single-resource response. */
export async function getData<T>(
  path: string,
  query?: QueryParams,
  opts?: Omit<RequestOptions, 'method' | 'query'>,
): Promise<T> {
  const res = await api.get<ItemResponse<T>>(path, query, opts);
  return res.data;
}

/** Test helper: reset module state between tests. */
export function __resetClientStateForTests(): void {
  inflightRefresh = null;
  tokenStore.clear();
  requestContext.lang = 'ar';
  requestContext.market = null;
}
