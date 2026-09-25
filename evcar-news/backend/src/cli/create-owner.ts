/**
 * npm run create-owner -- --email owner@example.com [--name "Display Name"]
 *
 * Creates/reuses the account, grants the owner role and prints a one-time
 * password-setup link (valid 24 h). Nothing secret is stored in plain text.
 */
import { parseArgs } from 'node:util';
import { createPrismaClient } from '../prisma/create-prisma-client';
import { fail, requireDatabaseUrl } from './cli-utils';
import { createOwnerSetup, ownerSetupLink, OWNER_SETUP_TTL_HOURS } from './owner-setup';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, name: { type: 'string' } },
    allowPositionals: false,
  });
  if (!values.email)
    fail('Usage: npm run create-owner -- --email owner@example.com [--name "Name"]');
  const prisma = createPrismaClient(requireDatabaseUrl());
  try {
    const result = await createOwnerSetup(prisma, values.email, values.name);
    const link = ownerSetupLink(process.env.ADMIN_BASE_URL, result.token);
    console.log(
      result.created
        ? `Created owner account ${result.email}`
        : `Granted owner role to existing account ${result.email}`,
    );
    if (result.reactivated) console.log('The account was suspended and has been re-activated.');
    console.log(
      `One-time password setup link (expires in ${OWNER_SETUP_TTL_HOURS} h, shown only once):`,
    );
    console.log(`  ${link}`);
    console.log(
      'Or call POST /api/v1/auth/reset-password with {"token": "<token above>", "password": "<new password>"}.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => fail('create-owner failed:', err));
