import { setTimeout as sleep } from 'node:timers/promises';

/**
 * Runs `fn` and does not settle (resolve OR reject) before `minMs` have
 * elapsed since the call. Used by responses whose duration must not reveal
 * which branch ran (e.g. "is this e-mail registered?"). The floor only hides
 * differences while the real work stays below it, so choose it well above
 * the slowest branch (argon2 hashing, a transaction).
 */
export async function withMinimumDuration<T>(minMs: number, fn: () => Promise<T>): Promise<T> {
  if (!(minMs > 0)) return fn();
  const started = performance.now();
  try {
    return await fn();
  } finally {
    const remaining = minMs - (performance.now() - started);
    if (remaining > 0) await sleep(remaining);
  }
}
