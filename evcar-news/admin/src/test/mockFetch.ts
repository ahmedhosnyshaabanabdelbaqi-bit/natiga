import { vi } from 'vitest';

export interface RecordedCall {
  method: string;
  path: string;
  search: URLSearchParams;
  headers: Record<string, string>;
  body: unknown;
  /** The body as passed to fetch (FormData, Blob…), for non-JSON requests. */
  rawBody: BodyInit | null | undefined;
  credentials: RequestCredentials | undefined;
}

export type MockReply =
  | { status: number; body?: unknown; headers?: Record<string, string> }
  | ((
      call: RecordedCall,
    ) =>
      | { status: number; body?: unknown; headers?: Record<string, string> }
      | Promise<{ status: number; body?: unknown; headers?: Record<string, string> }>);

export function json(status: number, body?: unknown) {
  return { status, body };
}

export function errorBody(code: string, message = code, extra: Record<string, unknown> = {}) {
  return { error: { code, message, requestId: 'req-test', ...extra } };
}

/**
 * Minimal fetch mock keyed by "METHOD /path" (path relative to /api/v1).
 * Handlers may be a single reply or a queue of replies consumed in order
 * (the last one repeats).
 */
export function mockFetch(routes: Record<string, MockReply | MockReply[]>) {
  const calls: RecordedCall[] = [];
  const queues = new Map<string, MockReply[]>();
  for (const [k, v] of Object.entries(routes)) queues.set(k, Array.isArray(v) ? [...v] : [v]);

  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init?.headers as Record<string, string>) ?? {}))
      headers[k.toLowerCase()] = v;
    let body: unknown = undefined;
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const call: RecordedCall = {
      method,
      path,
      search: url.searchParams,
      headers,
      body,
      rawBody: init?.body,
      credentials: init?.credentials,
    };
    calls.push(call);

    const queue = queues.get(`${method} ${path}`);
    if (!queue || queue.length === 0) {
      return new Response(JSON.stringify(errorBody('NOT_FOUND', `No mock for ${method} ${path}`)), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    const reply = queue.length > 1 ? queue.shift()! : queue[0]!;
    const r = typeof reply === 'function' ? await reply(call) : reply;
    const hasBody = r.body !== undefined && r.status !== 204;
    return new Response(hasBody ? JSON.stringify(r.body) : null, {
      status: r.status,
      headers: { ...(hasBody ? { 'content-type': 'application/json' } : {}), ...r.headers },
    });
  });

  vi.stubGlobal('fetch', fn);
  return {
    fn,
    calls,
    callsTo: (method: string, path: string) =>
      calls.filter((c) => c.method === method && c.path === path),
  };
}
