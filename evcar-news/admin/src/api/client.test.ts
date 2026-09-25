import { describe, expect, it, vi } from 'vitest';
import { errorBody, json, mockFetch } from '@/test/mockFetch';
import { makeSession, makeUser } from '@/test/fixtures';
import { api, apiRequest, buildUrl, refreshSession, setRequestContext } from './client';
import { type ApiError, isApiError } from './errors';
import { onSessionEvent, type SessionEvent } from './session';
import { tokenStore } from './tokenStore';

function collectEvents() {
  const events: SessionEvent[] = [];
  const off = onSessionEvent((e) => events.push(e));
  return { events, off };
}

describe('buildUrl', () => {
  it('prefixes /api/v1, skips empty values and repeats arrays', () => {
    expect(
      buildUrl('/admin/users', { page: 2, q: '', role: null, tags: ['a', 'b'], x: undefined }),
    ).toBe('/api/v1/admin/users?page=2&tags=a&tags=b');
    expect(buildUrl('me')).toBe('/api/v1/me');
  });
});

describe('apiRequest basics', () => {
  it('sends web client headers, lang/market context, credentials and the bearer token', async () => {
    const m = mockFetch({ 'GET /me': json(200, { data: makeUser() }) });
    tokenStore.set('tok-123', 900);
    setRequestContext({ lang: 'ar', market: 'EG' });

    await api.get('/me');

    const call = m.calls[0]!;
    expect(call.headers['x-client-type']).toBe('web');
    expect(call.headers['accept-language']).toBe('ar');
    expect(call.headers['x-market']).toBe('EG');
    expect(call.headers.authorization).toBe('Bearer tok-123');
    expect(call.credentials).toBe('include');
  });

  it('does not attach the token to anonymous requests', async () => {
    const m = mockFetch({ 'POST /auth/forgot-password': json(202) });
    tokenStore.set('tok-123', 900);
    await api.post('/auth/forgot-password', { email: 'a@b.c' }, { auth: false });
    expect(m.calls[0]!.headers.authorization).toBeUndefined();
    expect(m.calls[0]!.headers['content-type']).toBe('application/json');
    expect(m.calls[0]!.body).toEqual({ email: 'a@b.c' });
  });

  it('parses the error envelope into ApiError', async () => {
    mockFetch({
      'PATCH /admin/markets/EG': json(
        422,
        errorBody('VALIDATION_FAILED', 'Invalid input', {
          details: [{ field: 'timezone', message: 'bad tz' }],
        }),
      ),
    });
    const error = await api.patch('/admin/markets/EG', {}).catch((e: unknown) => e);
    expect(isApiError(error)).toBe(true);
    const e = error as ApiError;
    expect(e.status).toBe(422);
    expect(e.code).toBe('VALIDATION_FAILED');
    expect(e.message).toBe('Invalid input');
    expect(e.requestId).toBe('req-test');
    expect(e.isValidation).toBe(true);
  });

  it('handles non-envelope error bodies (e.g. proxy HTML)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<html>Bad gateway</html>', {
            status: 502,
            headers: { 'content-type': 'text/html' },
          }),
      ),
    );
    const error = (await api
      .get('/app-config', undefined, { auth: false })
      .catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(502);
    expect(error.code).toBe('HTTP_502');
  });

  it('maps fetch failures to NETWORK_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const error = (await api.get('/me').catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.isNetworkError).toBe(true);
  });

  it('returns undefined for 204 responses', async () => {
    mockFetch({ 'DELETE /admin/translations/1': json(204) });
    await expect(api.delete('/admin/translations/1')).resolves.toBeUndefined();
  });
});

describe('token refresh', () => {
  it('refreshes once on 401 TOKEN_EXPIRED and retries with the new token', async () => {
    tokenStore.set('old', 900);
    const m = mockFetch({
      'GET /admin/users': [
        json(401, errorBody('TOKEN_EXPIRED')),
        json(200, { data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }),
      ],
      'POST /auth/refresh': json(200, makeSession(makeUser(), 'new')),
    });
    const { events, off } = collectEvents();

    const res = await api.get<{ data: unknown[] }>('/admin/users');

    expect(res.data).toEqual([]);
    expect(m.callsTo('POST', '/auth/refresh')).toHaveLength(1);
    const userCalls = m.callsTo('GET', '/admin/users');
    expect(userCalls).toHaveLength(2);
    expect(userCalls[0]!.headers.authorization).toBe('Bearer old');
    expect(userCalls[1]!.headers.authorization).toBe('Bearer new');
    // The refresh call relies on the httpOnly cookie: no bearer, no body token.
    const refreshCall = m.callsTo('POST', '/auth/refresh')[0]!;
    expect(refreshCall.headers.authorization).toBeUndefined();
    expect(refreshCall.headers['x-client-type']).toBe('web');
    expect(refreshCall.body).toEqual({});
    expect(refreshCall.credentials).toBe('include');
    expect(tokenStore.get()).toBe('new');
    expect(events).toEqual([{ type: 'refreshed', user: makeUser() }]);
    off();
  });

  it('shares a single refresh between concurrent requests (single-flight)', async () => {
    tokenStore.set('old', 900);
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((r) => (releaseRefresh = r));
    const m = mockFetch({
      'GET /a': (call) =>
        call.headers.authorization === 'Bearer new'
          ? json(200, { data: 'a' })
          : json(401, errorBody('TOKEN_EXPIRED')),
      'GET /b': (call) =>
        call.headers.authorization === 'Bearer new'
          ? json(200, { data: 'b' })
          : json(401, errorBody('TOKEN_EXPIRED')),
      'GET /c': (call) =>
        call.headers.authorization === 'Bearer new'
          ? json(200, { data: 'c' })
          : json(401, errorBody('TOKEN_EXPIRED')),
      'POST /auth/refresh': async () => {
        await refreshGate;
        return json(200, makeSession(makeUser(), 'new'));
      },
    });

    const pending = Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);
    await vi.waitFor(() => expect(m.callsTo('POST', '/auth/refresh')).toHaveLength(1));
    releaseRefresh();
    const results = await pending;

    expect(results).toEqual([{ data: 'a' }, { data: 'b' }, { data: 'c' }]);
    expect(m.callsTo('POST', '/auth/refresh')).toHaveLength(1);
  });

  it('ends the session when the refresh is rejected', async () => {
    tokenStore.set('old', 900);
    const m = mockFetch({
      'GET /admin/users': json(401, errorBody('TOKEN_EXPIRED')),
      'POST /auth/refresh': json(401, errorBody('INVALID_REFRESH_TOKEN')),
    });
    const { events, off } = collectEvents();

    const error = (await api.get('/admin/users').catch((e: unknown) => e)) as ApiError;

    expect(error.code).toBe('SESSION_EXPIRED');
    expect(error.status).toBe(401);
    expect(tokenStore.get()).toBeNull();
    expect(events).toEqual([{ type: 'expired' }]);
    expect(m.callsTo('GET', '/admin/users')).toHaveLength(1);
    off();
  });

  it('retries only once: a second 401 after refresh is surfaced, not looped', async () => {
    tokenStore.set('old', 900);
    const m = mockFetch({
      'GET /admin/users': json(401, errorBody('TOKEN_EXPIRED')),
      'POST /auth/refresh': json(200, makeSession(makeUser(), 'new')),
    });
    const error = (await api.get('/admin/users').catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('TOKEN_EXPIRED');
    expect(m.callsTo('POST', '/auth/refresh')).toHaveLength(1);
    expect(m.callsTo('GET', '/admin/users')).toHaveLength(2);
  });

  it('does not refresh on other 401 codes but ends a live session', async () => {
    tokenStore.set('tok', 900);
    const m = mockFetch({ 'GET /me': json(401, errorBody('SESSION_REVOKED')) });
    const { events, off } = collectEvents();
    const error = (await api.get('/me').catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('SESSION_REVOKED');
    expect(m.callsTo('POST', '/auth/refresh')).toHaveLength(0);
    expect(tokenStore.get()).toBeNull();
    expect(events).toEqual([{ type: 'expired' }]);
    off();
  });

  it('does not refresh when a 401 comes from an anonymous request (e.g. wrong password)', async () => {
    const m = mockFetch({ 'POST /auth/login': json(401, errorBody('INVALID_CREDENTIALS')) });
    const error = (await api
      .post('/auth/login', {}, { auth: false })
      .catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('INVALID_CREDENTIALS');
    expect(m.callsTo('POST', '/auth/refresh')).toHaveLength(0);
  });

  it('refreshes proactively when the in-memory token is already expired', async () => {
    tokenStore.set('stale', 900, Date.now() - 3_600_000);
    const m = mockFetch({
      'GET /me': (call) =>
        json(call.headers.authorization === 'Bearer fresh' ? 200 : 401, { data: makeUser() }),
      'POST /auth/refresh': json(200, makeSession(makeUser(), 'fresh')),
    });
    await apiRequest('/me');
    expect(m.callsTo('POST', '/auth/refresh')).toHaveLength(1);
    expect(m.callsTo('GET', '/me')).toHaveLength(1);
    expect(m.callsTo('GET', '/me')[0]!.headers.authorization).toBe('Bearer fresh');
  });

  it('refreshSession resolves null (no event) when there was no session', async () => {
    mockFetch({ 'POST /auth/refresh': json(401, errorBody('NO_REFRESH_TOKEN')) });
    const { events, off } = collectEvents();
    await expect(refreshSession()).resolves.toBeNull();
    expect(events).toEqual([]);
    off();
  });

  it('refreshSession rejects with a network error and keeps the token when the server is unreachable', async () => {
    tokenStore.set('tok', 900);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const error = (await refreshSession().catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('NETWORK_ERROR');
    expect(tokenStore.get()).toBe('tok');
  });
});
