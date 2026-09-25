import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { runReferenceSeed } from '../../src/cli/seed-data/reference-seed';
import { createPrismaClient } from '../../src/prisma/create-prisma-client';
import { createDatabase, databaseUrlFor, dropDatabase, withAdminClient } from './db';

/**
 * Runs once per `npm run test:e2e`: creates evcar_test_<runId>_tpl, applies
 * all migrations (prisma migrate deploy) and the reference seed. Test apps
 * clone this template (fast) — see createTestApp().
 */
export default async function globalSetup(): Promise<void> {
  const runId = `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
  const template = `evcar_test_${runId}_tpl`;
  // Set before anything can fail so globalTeardown can always clean up.
  process.env.E2E_RUN_ID = runId;
  process.env.E2E_TEMPLATE_DB = template;

  await createDatabase(template);
  try {
    const url = databaseUrlFor(template);
    execFileSync(resolve(__dirname, '../../node_modules/.bin/prisma'), ['migrate', 'deploy'], {
      cwd: resolve(__dirname, '../..'),
      env: { ...process.env, DATABASE_URL: url },
      stdio: ['ignore', 'ignore', 'inherit'],
    });

    const prisma = createPrismaClient(url, 2);
    try {
      await runReferenceSeed(prisma);
    } finally {
      await prisma.$disconnect();
    }
    // Nobody may connect to the template (required for CREATE DATABASE ... TEMPLATE).
    await withAdminClient((client) =>
      client.query(`ALTER DATABASE "${template}" WITH ALLOW_CONNECTIONS false`),
    );
  } catch (err) {
    // Jest does not run globalTeardown when globalSetup fails: never leave the
    // template database behind on the shared server (e.g. a broken migration).
    await dropDatabase(template).catch(() => undefined);
    throw err;
  }
}
