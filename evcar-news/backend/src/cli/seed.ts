/** npm run db:seed — idempotent reference seed (roles, markets, connector types, settings...). */
import { createPrismaClient } from '../prisma/create-prisma-client';
import { fail, requireDatabaseUrl } from './cli-utils';
import { runReferenceSeed } from './seed-data/reference-seed';

async function main(): Promise<void> {
  const prisma = createPrismaClient(requireDatabaseUrl());
  try {
    const summary = await runReferenceSeed(prisma);
    console.log('Reference seed complete:', JSON.stringify(summary));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => fail('Reference seed failed:', err));
