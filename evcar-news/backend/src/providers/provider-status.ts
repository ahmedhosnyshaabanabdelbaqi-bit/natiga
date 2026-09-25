/**
 * Status every provider adapter exposes (contract §4.6), surfaced at
 * GET /api/v1/admin/system/integrations.
 */
export type ProviderType =
  | 'storage'
  | 'mail'
  | 'stations'
  | 'availability'
  | 'routing'
  | 'geocoding'
  | 'news'
  | 'push'
  | 'oauth'
  | 'assistant';

export interface ProviderStatus {
  /** Provider type, e.g. "storage", "mail", "stations", "routing". */
  type: ProviderType | (string & {});
  /** Implementation name, e.g. "local", "s3", "smtp", "open_charge_map". */
  name: string;
  configured: boolean;
  /**
   * false when the adapter is configured but deliberately inactive (e.g. the
   * console mail driver in production only logs). Defaults to `configured`.
   */
  enabled?: boolean;
  /** Human-readable reason when not configured (never contains secrets). */
  reason?: string;
  /** Non-blocking notes for admins (usage policies, licences, limits). */
  notes?: string[];
  /** Attribution / licence text the provider requires to be displayed. */
  attribution?: string;
  lastSuccessAt?: string;
  lastError?: string;
  lastErrorAt?: string;
}

export interface StatusReporter {
  status(): ProviderStatus | Promise<ProviderStatus>;
}

/** Keeps the last success / error of an adapter in memory (never secrets). */
export class ProviderActivity {
  private lastSuccess?: Date;
  private lastFailure?: { at: Date; message: string };

  success(at = new Date()): void {
    this.lastSuccess = at;
  }

  failure(err: unknown, at = new Date()): void {
    this.lastFailure = { at, message: describeProviderError(err) };
  }

  /** Fields to spread into a ProviderStatus. */
  snapshot(): Pick<ProviderStatus, 'lastSuccessAt' | 'lastError' | 'lastErrorAt'> {
    return {
      ...(this.lastSuccess ? { lastSuccessAt: this.lastSuccess.toISOString() } : {}),
      ...(this.lastFailure
        ? { lastError: this.lastFailure.message, lastErrorAt: this.lastFailure.at.toISOString() }
        : {}),
    };
  }
}

const SECRETISH = /(key|token|secret|password|signature|sig|auth)=([^&\s]+)/gi;

/**
 * Short, secret-free description of an adapter error for admins (query
 * strings with keys are masked, long messages truncated).
 */
export function describeProviderError(err: unknown): string {
  const code = (err as { code?: unknown })?.code;
  const raw = err instanceof Error ? err.message : String(err);
  const masked = raw.replace(SECRETISH, '$1=***').replace(/\s+/g, ' ').trim();
  const text = typeof code === 'string' && !masked.includes(code) ? `${code}: ${masked}` : masked;
  return text.length > 300 ? `${text.slice(0, 297)}...` : text;
}
