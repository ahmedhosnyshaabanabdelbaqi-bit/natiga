import type { ProviderCheckResult } from '../provider-check';
import type { StatusReporter } from '../provider-status';

export type PushProviderName = 'fcm' | 'apns';

export interface PushTarget {
  /** device_tokens.token */
  token: string;
  /** device_tokens.provider */
  provider: PushProviderName;
}

export interface PushMessage {
  title: string;
  body: string;
  /** String key/values delivered to the app (e.g. { type, entityId }). */
  data?: Record<string, string>;
  /** In-app route to open, e.g. "/news/some-slug" (added to data.deepLink). */
  deepLink?: string;
  /** Replaces an earlier notification with the same key on the device. */
  collapseKey?: string;
  /** Default 1 day. */
  ttlSeconds?: number;
  badge?: number;
}

/**
 * - sent: accepted by the push service (not a read receipt)
 * - invalid_token: the token is dead → revoke device_tokens row
 * - failed: transient/unknown failure (retry later)
 * - not_configured: provider has no credentials (delivery status "skipped")
 */
export type PushOutcomeStatus = 'sent' | 'invalid_token' | 'failed' | 'not_configured';

export interface PushSendOutcome {
  token: string;
  provider: PushProviderName;
  status: PushOutcomeStatus;
  providerMessageId?: string;
  error?: string;
  /** true when retrying later may succeed (429/5xx/network). */
  retryable?: boolean;
}

export interface PushChannel extends StatusReporter {
  readonly name: PushProviderName;
  readonly configured: boolean;
  send(tokens: string[], message: PushMessage): Promise<PushSendOutcome[]>;
  check(): Promise<ProviderCheckResult>;
}

export const DEFAULT_PUSH_TTL_SECONDS = 24 * 3600;
export const PUSH_CONCURRENCY = 8;

/** Runs `fn` over items with bounded concurrency, preserving order. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Reads a secret given inline, base64-encoded, or as a file path. */
export function readSecretMaterial(raw: string, readFile: (path: string) => string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith('{') || value.startsWith('-----BEGIN')) return value.replace(/\\n/g, '\n');
  if (value.startsWith('/') || value.startsWith('./') || /\.(json|p8|pem)$/i.test(value)) {
    try {
      return readFile(value);
    } catch {
      return null;
    }
  }
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8').trim();
    if (decoded.startsWith('{') || decoded.startsWith('-----BEGIN')) return decoded;
  } catch {
    /* not base64 */
  }
  return null;
}
