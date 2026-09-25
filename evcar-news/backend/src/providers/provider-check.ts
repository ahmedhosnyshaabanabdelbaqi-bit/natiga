import { describeProviderError } from './provider-status';

/** Result of an on-demand connectivity check of an adapter ("test connection"). */
export interface ProviderCheckResult {
  ok: boolean;
  latencyMs?: number;
  /** Short, secret-free reason when not ok. */
  error?: string;
  /** Set when the check could not run (e.g. adapter not configured). */
  skipped?: boolean;
}

export async function timedCheck(fn: () => Promise<unknown>): Promise<ProviderCheckResult> {
  const started = performance.now();
  try {
    await fn();
    return { ok: true, latencyMs: Math.round((performance.now() - started) * 100) / 100 };
  } catch (err) {
    return { ok: false, error: describeProviderError(err) };
  }
}

export const NOT_CONFIGURED_CHECK: ProviderCheckResult = {
  ok: false,
  skipped: true,
  error: 'not configured',
};
