import { HttpStatus } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { authError, AuthErrorCode } from '../auth/auth.errors';
import { OWNER_ROLE } from '../rbac/rbac.constants';

type Tx = Prisma.TransactionClient;

/** Arbitrary constant key of the advisory lock that serializes owner changes. */
const OWNER_LOCK_KEY = 7_311_2026;

/**
 * Serializes every change that could remove an owner (role removal,
 * suspension, account deletion) for the rest of the transaction, so two
 * owners demoting each other concurrently cannot leave the system ownerless.
 */
export async function lockOwnership(tx: Tx): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${OWNER_LOCK_KEY})`;
}

export async function isOwner(tx: Tx, userId: string): Promise<boolean> {
  const n = await tx.userRole.count({ where: { userId, role: { key: OWNER_ROLE } } });
  return n > 0;
}

/**
 * Throws 409 LAST_OWNER when `userId` is an active owner and no OTHER
 * active owner exists. Call inside a transaction after lockOwnership().
 */
export async function assertNotLastOwner(tx: Tx, userId: string): Promise<void> {
  if (!(await isOwner(tx, userId))) return;
  const others = await tx.user.count({
    where: {
      id: { not: userId },
      status: 'active',
      roles: { some: { role: { key: OWNER_ROLE } } },
    },
  });
  if (others === 0) throw authError(HttpStatus.CONFLICT, AuthErrorCode.LAST_OWNER);
}
