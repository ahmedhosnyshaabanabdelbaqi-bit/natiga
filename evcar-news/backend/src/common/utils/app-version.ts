import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let cached: string | undefined;

/** Backend version from package.json (APP_VERSION env overrides, e.g. a git sha in CI). */
export function appVersion(): string {
  if (cached) return cached;
  if (process.env.APP_VERSION) return (cached = process.env.APP_VERSION);
  for (const dir of [process.cwd(), join(__dirname, '..', '..', '..')]) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
        name?: string;
        version?: string;
      };
      if (pkg.name === 'evcar-news-backend' && pkg.version) return (cached = pkg.version);
    } catch {
      // try next location
    }
  }
  return (cached = 'unknown');
}

/** Rejects if `promise` does not settle within `ms`. */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = 'operation',
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
