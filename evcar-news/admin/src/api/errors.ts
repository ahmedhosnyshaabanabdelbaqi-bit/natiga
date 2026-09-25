import type { ApiErrorEnvelope } from './types';

/** Client-side codes that never come from the server. */
export const CLIENT_ERROR_CODES = {
  network: 'NETWORK_ERROR',
  aborted: 'REQUEST_ABORTED',
  invalidResponse: 'INVALID_RESPONSE',
  sessionExpired: 'SESSION_EXPIRED',
} as const;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor(opts: {
    status: number;
    code: string;
    message: string;
    details?: unknown;
    requestId?: string | undefined;
  }) {
    super(opts.message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.details = opts.details;
    this.requestId = opts.requestId;
  }

  get isNetworkError(): boolean {
    return this.code === CLIENT_ERROR_CODES.network;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isValidation(): boolean {
    return this.status === 422 || this.code === 'VALIDATION_FAILED';
  }

  /** 503 INTEGRATION_NOT_CONFIGURED and similar. */
  get isNotConfigured(): boolean {
    return this.code === 'INTEGRATION_NOT_CONFIGURED';
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

function isEnvelope(body: unknown): body is ApiErrorEnvelope {
  if (typeof body !== 'object' || body === null || !('error' in body)) return false;
  const err = (body as { error: unknown }).error;
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { code?: unknown }).code === 'string' &&
    typeof (err as { message?: unknown }).message === 'string'
  );
}

/**
 * Builds an ApiError from a non-2xx response body. Falls back gracefully when the
 * body is not the standard envelope (e.g. an HTML 502 from a proxy).
 */
export function apiErrorFromBody(status: number, body: unknown, fallbackRequestId?: string | null) {
  if (isEnvelope(body)) {
    return new ApiError({
      status,
      code: body.error.code,
      message: body.error.message,
      details: body.error.details,
      requestId: body.error.requestId ?? fallbackRequestId ?? undefined,
    });
  }
  return new ApiError({
    status,
    code: `HTTP_${status}`,
    message: `HTTP ${status}`,
    details: body,
    requestId: fallbackRequestId ?? undefined,
  });
}

/**
 * Normalises the `details` of a 422 VALIDATION_FAILED error into `{ field: message }`.
 * Supports the shapes commonly produced by NestJS/class-validator based filters:
 * - `[{ field|property|path, message|messages|constraints }]`
 * - `{ fields: { name: string | string[] } }` or `{ name: string | string[] }`
 */
export function getFieldErrors(error: unknown): Record<string, string> {
  if (!isApiError(error) || !error.isValidation) return {};
  const out: Record<string, string> = {};
  const details = error.details;

  const firstMessage = (value: unknown): string | undefined => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(firstMessage).find(Boolean);
    if (value && typeof value === 'object')
      return Object.values(value).map(firstMessage).find(Boolean);
    return undefined;
  };

  const list = Array.isArray(details)
    ? details
    : details &&
        typeof details === 'object' &&
        Array.isArray((details as { errors?: unknown }).errors)
      ? (details as { errors: unknown[] }).errors
      : null;

  if (list) {
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const rawField = rec.field ?? rec.property ?? rec.path;
      const field = Array.isArray(rawField) ? rawField.join('.') : rawField;
      const message = firstMessage(rec.message ?? rec.messages ?? rec.constraints);
      if (typeof field === 'string' && message && !(field in out)) out[field] = message;
    }
    return out;
  }

  if (details && typeof details === 'object') {
    const source = (details as { fields?: unknown }).fields ?? details;
    if (source && typeof source === 'object') {
      for (const [field, value] of Object.entries(source as Record<string, unknown>)) {
        const message = firstMessage(value);
        if (message) out[field] = message;
      }
    }
  }
  return out;
}
