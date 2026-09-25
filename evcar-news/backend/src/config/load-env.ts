import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

/**
 * Loads `.env.local` then `.env` from the backend directory into process.env
 * (never overriding variables that are already set). Called by main.ts and
 * CLI scripts only — tests and production containers pass real env vars.
 */
export function loadEnvFiles(cwd: string = process.cwd()): void {
  if (process.env.NODE_ENV === 'test') return;
  for (const file of ['.env.local', '.env']) {
    const path = resolve(cwd, file);
    if (existsSync(path)) loadDotenv({ path, quiet: true, override: false });
  }
}
