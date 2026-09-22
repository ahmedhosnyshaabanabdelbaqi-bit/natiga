/**
 * Minimal JSON client for the module's JSON endpoints (estimate, previews, unread count).
 * Sends the session CSRF token and returns Laravel validation errors as a flat field → message map.
 */
export type JsonResult<T> =
    | { ok: true; status: number; data: T }
    | {
          ok: false;
          status: number;
          errors: Record<string, string>;
          message: string | null;
      };

function csrfToken(): string | null {
    if (typeof document === 'undefined') {
        return null;
    }
    return (
        document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
            ?.content ?? null
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function flattenErrors(value: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (!isRecord(value)) {
        return out;
    }
    for (const [field, messages] of Object.entries(value)) {
        if (Array.isArray(messages) && typeof messages[0] === 'string') {
            out[field] = messages[0];
        } else if (typeof messages === 'string') {
            out[field] = messages;
        }
    }
    return out;
}

export async function requestJson<T>(
    method: 'get' | 'post' | 'put',
    url: string,
    body?: unknown,
    signal?: AbortSignal,
): Promise<JsonResult<T>> {
    const headers: Record<string, string> = {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
    };
    const token = csrfToken();
    if (token) {
        headers['X-CSRF-TOKEN'] = token;
    }
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }

    let response: Response;
    try {
        response = await fetch(url, {
            method: method.toUpperCase(),
            headers,
            credentials: 'same-origin',
            body: body === undefined ? undefined : JSON.stringify(body),
            signal,
        });
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw error;
        }
        return { ok: false, status: 0, errors: {}, message: null };
    }

    let payload: unknown = null;
    try {
        payload = await response.json();
    } catch {
        payload = null;
    }

    if (response.ok && isRecord(payload) && 'data' in payload) {
        return { ok: true, status: response.status, data: payload.data as T };
    }

    return {
        ok: false,
        status: response.status,
        errors: isRecord(payload) ? flattenErrors(payload.errors) : {},
        message:
            isRecord(payload) && typeof payload.message === 'string'
                ? payload.message
                : null,
    };
}
