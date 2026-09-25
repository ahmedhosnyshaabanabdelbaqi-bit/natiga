/**
 * npm run prisma:check-drift
 *
 * Applies all migrations to a throw-away database and verifies that the
 * Prisma schema (prisma/schema/*.prisma) produces NO further changes.
 * Exit code 0 = in sync, 2 = drift (the missing SQL is printed).
 * Uses the server of DATABASE_URL (the user must be allowed to CREATE DATABASE).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { fail, requireDatabaseUrl } from './cli-utils';

const PRISMA_BIN = resolve('node_modules', '.bin', 'prisma');

async function main(): Promise<void> {
  const base = new URL(requireDatabaseUrl());
  const dbName = `evcar_drift_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
  const admin = new URL(base.toString());
  admin.pathname = '/postgres';
  const target = new URL(base.toString());
  target.pathname = `/${dbName}`;

  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  await client.query(`CREATE DATABASE "${dbName}"`);
  let exitCode = 0;
  try {
    const env = { ...process.env, DATABASE_URL: target.toString() };
    execFileSync(PRISMA_BIN, ['migrate', 'deploy'], {
      env,
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    const diff = spawnSync(
      PRISMA_BIN,
      [
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema',
        'prisma/schema',
        '--script',
        '--exit-code',
      ],
      { env, encoding: 'utf8' },
    );
    if (diff.status === 0) {
      console.log('Schema and migrations are in sync.');
    } else if (diff.status === 2) {
      console.error('DRIFT: prisma/schema differs from the migrations. Missing SQL:\n');
      console.error(diff.stdout);
      exitCode = 2;
    } else {
      console.error(diff.stderr || diff.stdout);
      exitCode = 1;
    }
  } finally {
    await client.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await client.end();
  }
  process.exit(exitCode);
}

main().catch((err: unknown) => fail('check-drift failed:', err));
