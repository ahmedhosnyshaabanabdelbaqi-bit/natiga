import axios, { AxiosError, type AxiosInstance } from 'axios';
import type { ApiError } from '@/types';

/**
 * API client.
 *
 * Distinguishes THREE states, because the POS reacts differently to each:
 *   - a normal response (success or a business rule refusal)
 *   - the server answering with an error
 *   - the server being unreachable  -> `isNetworkError`, which is what puts the
 *     till into degraded mode instead of showing a scary failure
 */

export const TOKEN_KEY = 'pos.token';
export const TERMINAL_KEY = 'pos.terminal';

export function readStorage(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null; // private mode / blocked storage
    }
}

export function writeStorage(key: string, value: string | null): void {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch {
        /* storage unavailable: the app still works, it just forgets the device */
    }
}

export const http: AxiosInstance = axios.create({
    baseURL: '/api/v1',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    timeout: 20000,
});

http.interceptors.request.use((config) => {
    const token = readStorage(TOKEN_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;

    const terminal = readStorage(TERMINAL_KEY);
    if (terminal) config.headers['X-POS-Terminal'] = terminal;

    return config;
});

export function isNetworkError(error: unknown): boolean {
    const e = error as AxiosError;
    return Boolean(e?.isAxiosError) && !e.response;
}

export function toApiError(error: unknown): ApiError {
    const e = error as AxiosError<ApiError>;

    if (isNetworkError(error)) {
        return { message: 'تعذر الوصول إلى الخادم.', error_code: 'network_unreachable' };
    }

    const data = e?.response?.data;

    return {
        message: data?.message ?? 'حدث خطأ غير متوقع.',
        error_code: data?.error_code,
        context: data?.context,
        errors: (data as { errors?: Record<string, string[]> } | undefined)?.errors,
        status: e?.response?.status,
    };
}

/** RFC 4122 v4, from the platform CSPRNG. Used for idempotency keys and
 *  offline operation ids, so a retry is always recognisable as the same work. */
export function uuid(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // Fallback for non-secure contexts (plain http on a shop LAN), still from
    // the platform CSPRNG.
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
