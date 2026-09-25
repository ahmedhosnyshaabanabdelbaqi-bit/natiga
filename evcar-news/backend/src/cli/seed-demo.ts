/**
 * npm run db:seed:demo — clearly labelled FICTIONAL demo data (isDemo=true).
 * Refuses to run when NODE_ENV=production. The synthetic demo panoramas are
 * written to the configured storage (STORAGE_DRIVER); when storage cannot be
 * configured the demo 360° tour is skipped (never a row without its files).
 */
import { AppConfig } from '../config/app-config';
import { createPrismaClient } from '../prisma/create-prisma-client';
import { createStorageProvider } from '../providers/providers.module';
import type { StorageProvider } from '../providers/storage/storage.types';
import { fail, requireDatabaseUrl } from './cli-utils';
import { runDemoSeed } from './seed-data/demo-seed';

async function main(): Promise<void> {
  const databaseUrl = requireDatabaseUrl();
  if (process.env.NODE_ENV === 'production') {
    fail('Refusing to seed demo data with NODE_ENV=production.');
  }
  let storage: StorageProvider | undefined;
  try {
    storage = createStorageProvider(AppConfig.fromEnv(process.env));
  } catch (err) {
    console.warn(
      'Storage is not configured — the demo 360° tour is skipped:',
      err instanceof Error ? err.message : err,
    );
  }
  const prisma = createPrismaClient(databaseUrl);
  try {
    const summary = await runDemoSeed(prisma, { storage });
    console.log('Demo seed complete (all rows flagged isDemo=true):', JSON.stringify(summary));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => fail('Demo seed failed:', err));
