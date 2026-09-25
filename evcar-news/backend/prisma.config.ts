import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

loadEnv({ quiet: true });

/**
 * Prisma 7 configuration.
 * - The schema is split per domain under prisma/schema/*.prisma.
 * - DATABASE_URL is read from the environment (.env is loaded for local dev).
 *   `prisma generate` does not need a reachable database, so a harmless
 *   placeholder is used when the variable is absent (e.g. in `npm ci`).
 */
export default defineConfig({
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node --transpile-only src/cli/seed.ts',
  },
  datasource: {
    url:
      process.env.DATABASE_URL ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
  },
});
