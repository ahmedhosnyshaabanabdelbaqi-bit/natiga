/**
 * npm run db:seed — idempotent reference seed (roles, markets, connector types, settings...).
 * `npm run db:seed -- --enable-implemented-features` also switches on every
 * implemented feature (all flags start off; see seed-data/enable-features.ts).
 */
import { createPrismaClient } from '../prisma/create-prisma-client';
import { fail, requireDatabaseUrl } from './cli-utils';
import { enableImplementedFeatures } from './seed-data/enable-features';
import { runReferenceSeed } from './seed-data/reference-seed';

async function main(): Promise<void> {
  const prisma = createPrismaClient(requireDatabaseUrl());
  try {
    const summary = await runReferenceSeed(prisma);
    console.log('Reference seed complete:', JSON.stringify(summary));
    if (process.argv.includes('--enable-implemented-features')) {
      const enabled = await enableImplementedFeatures(prisma);
      console.log(
        enabled.length
          ? `Feature flags switched on: ${enabled.join(', ')}`
          : 'All implemented features were already on.',
      );
    } else {
      console.log(
        'Note: every feature flag starts OFF (the apps then show only Home and Account). Run `npm run db:seed -- --enable-implemented-features` or PATCH /api/v1/admin/settings/features to switch them on.',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => fail('Reference seed failed:', err));
