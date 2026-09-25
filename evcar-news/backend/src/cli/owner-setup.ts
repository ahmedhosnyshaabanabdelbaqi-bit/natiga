import type { PrismaClient } from '../generated/prisma/client';
import { generateToken, hashToken } from '../common/security/tokens';

export const OWNER_SETUP_TTL_HOURS = 24;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface OwnerSetupResult {
  userId: string;
  email: string;
  created: boolean;
  /** True when an existing suspended account was re-activated. */
  reactivated: boolean;
  /** Raw one-time token (shown once, only its hash is stored). */
  token: string;
  expiresAt: Date;
}

/**
 * Link printed by the CLI: the admin panel's "set your password" page
 * (`/setup-password`, same endpoint as `/reset-password`).
 */
export function ownerSetupLink(adminBaseUrl: string | undefined, token: string): string {
  const base = (adminBaseUrl || 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}/setup-password?token=${encodeURIComponent(token)}`;
}

/**
 * Creates (or reuses) the account for `email`, grants the `owner` role and
 * issues a one-time `setup_password` token (email_tokens). The token is
 * redeemed with POST /api/v1/auth/reset-password {token, password}.
 * No password is ever hard-coded or printed. The operator running the CLI
 * has server access, so a suspended account is re-activated (recovery path
 * for a locked-out owner). An audit row records the action.
 */
export async function createOwnerSetup(
  prisma: PrismaClient,
  rawEmail: string,
  displayName?: string,
): Promise<OwnerSetupResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error(`Invalid e-mail address: ${rawEmail}`);

  const role = await prisma.role.findUnique({ where: { key: 'owner' } });
  if (!role) throw new Error('Role "owner" not found — run `npm run db:seed` first.');

  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email } });
    const reactivated = existing?.status === 'suspended';
    if (existing && reactivated) {
      await tx.user.update({ where: { id: existing.id }, data: { status: 'active' } });
    }
    const user =
      existing ??
      (await tx.user.create({
        data: {
          email,
          displayName: (displayName?.trim() || email.split('@')[0]).slice(0, 100),
          locale: 'ar',
          // The operator running the CLI vouches for the address.
          emailVerifiedAt: new Date(),
        },
      }));
    await tx.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    });
    const userRole = await tx.role.findUnique({ where: { key: 'user' } });
    if (userRole) {
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: userRole.id } },
        create: { userId: user.id, roleId: userRole.id },
        update: {},
      });
    }
    // Invalidate older unused setup tokens for this user.
    await tx.emailToken.updateMany({
      where: { userId: user.id, purpose: 'setup_password', usedAt: null },
      data: { usedAt: new Date() },
    });
    const token = generateToken(32);
    const expiresAt = new Date(Date.now() + OWNER_SETUP_TTL_HOURS * 3600 * 1000);
    await tx.emailToken.create({
      data: {
        userId: user.id,
        purpose: 'setup_password',
        tokenHash: hashToken(token),
        email,
        expiresAt,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: null,
        actorLabel: 'cli:create-owner',
        action: 'auth.owner_setup_issued',
        entityType: 'user',
        entityId: user.id,
        after: { roles: ['owner', 'user'], created: !existing, reactivated, expiresAt },
      },
    });
    return { userId: user.id, email, created: !existing, reactivated, token, expiresAt };
  });
}
