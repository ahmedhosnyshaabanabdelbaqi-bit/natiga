/**
 * npm run db:seed:demo — clearly labelled FICTIONAL demo data (isDemo=true).
 * Refuses to run when NODE_ENV=production.
 */
import { createPrismaClient } from '../prisma/create-prisma-client';
import { fail, requireDatabaseUrl } from './cli-utils';
import { runDemoSeed } from './seed-data/demo-seed';

async function main(): Promise<void> {
  const databaseUrl = requireDatabaseUrl();
  if (process.env.NODE_ENV === 'production') {
    fail('Refusing to seed demo data with NODE_ENV=production.');
  }
  const prisma = createPrismaClient(databaseUrl);
  try {
    const summary = await runDemoSeed(prisma);
    console.log('Demo seed complete (all rows flagged isDemo=true):', JSON.stringify(summary));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => fail('Demo seed failed:', err));
