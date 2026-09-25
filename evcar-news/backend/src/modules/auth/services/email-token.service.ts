import { isIP } from 'node:net';
import { HttpStatus, Injectable } from '@nestjs/common';
import { generateToken, hashToken } from '../../../common/security/tokens';
import type { EmailTokenPurpose, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { authError, AuthErrorCode } from '../auth.errors';

type Tx = Prisma.TransactionClient;

export interface ConsumedEmailToken {
  id: string;
  userId: string;
  purpose: EmailTokenPurpose;
  email: string | null;
}

const invalidToken = () =>
  authError(HttpStatus.BAD_REQUEST, AuthErrorCode.INVALID_OR_EXPIRED_TOKEN);

/** Shape check before hitting the database (base64url, 32 random bytes = 43 chars). */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,200}$/;

/**
 * Single-use e-mail tokens (verification, password reset, owner setup).
 * Only the SHA-256 of the token is stored; lookups are by hash (an
 * attacker cannot choose a hash prefix, so the index lookup leaks nothing
 * useful). Issuing a new token invalidates older unused ones of the same
 * purpose; consuming is atomic (`used_at IS NULL` guard), so a token works
 * exactly once even under concurrent requests.
 */
@Injectable()
export class EmailTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(
    opts: {
      userId: string;
      purpose: EmailTokenPurpose;
      email: string;
      ttlMinutes: number;
      ip?: string;
    },
    tx?: Tx,
  ): Promise<{ token: string; expiresAt: Date }> {
    const db = tx ?? this.prisma;
    const now = new Date();
    await db.emailToken.updateMany({
      where: { userId: opts.userId, purpose: opts.purpose, usedAt: null },
      data: { usedAt: now },
    });
    const token = generateToken(32);
    const expiresAt = new Date(now.getTime() + opts.ttlMinutes * 60_000);
    await db.emailToken.create({
      data: {
        userId: opts.userId,
        purpose: opts.purpose,
        tokenHash: hashToken(token),
        email: opts.email,
        expiresAt,
        requestedIp: opts.ip && isIP(opts.ip) ? opts.ip : null,
      },
    });
    return { token, expiresAt };
  }

  /** Most recent token of a purpose (used to rate-limit re-sending). */
  async latestIssuedAt(userId: string, purpose: EmailTokenPurpose): Promise<Date | undefined> {
    const row = await this.prisma.emailToken.findFirst({
      where: { userId, purpose },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return row?.createdAt;
  }

  /**
   * Validates a token WITHOUT consuming it (e.g. to check the new password
   * before burning a reset link). Same errors as consume().
   */
  async peek(
    rawToken: string,
    purposes: readonly EmailTokenPurpose[],
  ): Promise<ConsumedEmailToken> {
    const row = await this.findValid(rawToken, purposes, this.prisma);
    return { id: row.id, userId: row.userId, purpose: row.purpose, email: row.email };
  }

  /**
   * Validates and marks a token as used. Throws 400 INVALID_OR_EXPIRED_TOKEN
   * for unknown, used, expired or wrong-purpose tokens.
   */
  async consume(
    rawToken: string,
    purposes: readonly EmailTokenPurpose[],
    tx?: Tx,
  ): Promise<ConsumedEmailToken> {
    const db = tx ?? this.prisma;
    const row = await this.findValid(rawToken, purposes, db);
    const { count } = await db.emailToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (count !== 1) throw invalidToken();
    return { id: row.id, userId: row.userId, purpose: row.purpose, email: row.email };
  }

  private async findValid(
    rawToken: string,
    purposes: readonly EmailTokenPurpose[],
    db: Tx | PrismaService,
  ) {
    if (!TOKEN_SHAPE.test(rawToken)) throw invalidToken();
    const row = await db.emailToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!row || row.usedAt || row.expiresAt <= new Date() || !purposes.includes(row.purpose)) {
      throw invalidToken();
    }
    return row;
  }
}
