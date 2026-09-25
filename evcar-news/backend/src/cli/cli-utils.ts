import { loadEnvFiles } from '../config/load-env';

/** Loads .env files and returns DATABASE_URL (exits with a message when missing). */
export function requireDatabaseUrl(): string {
  loadEnvFiles();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set (see /.env.example).');
    process.exit(1);
  }
  return url;
}

export function fail(message: string, err?: unknown): never {
  console.error(message, err instanceof Error ? err.message : (err ?? ''));
  process.exit(1);
}
