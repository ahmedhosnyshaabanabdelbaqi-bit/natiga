import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Standalone Prisma client for CLI scripts and test utilities (outside Nest DI).
 * Remember to `await client.$disconnect()`.
 */
export function createPrismaClient(databaseUrl: string, poolMax = 5): PrismaClient {
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl, max: poolMax }),
  });
}
