import { createHmac, hkdfSync } from 'node:crypto';
import { isIP } from 'node:net';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { generateToken, hashToken } from '../../../common/security/tokens';
import { AppConfig } from '../../../config/app-config';
import type { ClientType, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { authError, AuthErrorCode } from '../auth.errors';

type Tx = Prisma.TransactionClient;

export interface SessionMeta {
  clientType: ClientType;
  deviceName?: string | null;
  userAgent?: string | null;
  ip?: string | null;
}

export interface IssuedSession {
  sessionId: string;
  userId: string;
  refreshToken: string;
  expiresAt: Date;
}

/** Public view of a session (GET /me/sessions, admin). */
export interface SessionView {
  id: string;
  clientType: ClientType;
  deviceName: string | null;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

export const SessionRevokeReason = {
  LOGOUT: 'logout',
  USER_REVOKED: 'user_revoked',
  ADMIN_REVOKED: 'admin_revoked',
  REFRESH_REUSE: 'refresh_token_reuse',
  PASSWORD_CHANGED: 'password_changed',
  PASSWORD_RESET: 'password_reset',
  ACCOUNT_DISABLED: 'account_disabled',
  ACCOUNT_TAKEOVER_PROTECTION: 'account_takeover_protection',
} as const;

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,200}$/;
const DAY_MS = 24 * 3600 * 1000;

const SESSION_SELECT = {
  id: true,
  userId: true,
  refreshTokenHash: true,
  previousRefreshTokenHash: true,
  lastRotatedAt: true,
  createdAt: true,
  revokedAt: true,
  expiresAt: true,
  user: { select: { status: true } },
} as const;

const invalidRefresh = () =>
  authError(HttpStatus.UNAUTHORIZED, AuthErrorCode.INVALID_REFRESH_TOKEN);

function cleanIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const pct = ip.indexOf('%');
  const v = pct === -1 ? ip : ip.slice(0, pct);
  return isIP(v) ? v : null;
}

/**
 * Login sessions and refresh tokens (user_sessions + refresh_token_history).
 *
 * - The refresh token is an opaque 256-bit value; only its SHA-256 is stored.
 * - Every refresh ROTATES it (compare-and-set on the current hash). The old
 *   hash moves to previous_refresh_token_hash and is appended to
 *   refresh_token_history, so the whole token family is known.
 * - Presenting ANY token of the family that was already rotated away is
 *   REUSE (a stolen copy): the session is revoked, the event is audited and
 *   401 REFRESH_TOKEN_REUSED is returned, however many rotations ago it was.
 * - Grace window (AUTH_REFRESH_REUSE_GRACE_SECONDS, default 60 s): the
 *   IMMEDIATELY previous token is accepted for a short time after a rotation
 *   as long as its successor has not been used yet, and answers with the SAME
 *   successor (idempotent retry). This covers a response lost on a mobile
 *   network and two concurrent refreshes with one token. The successor is
 *   derived deterministically (HMAC with a key derived from
 *   JWT_ACCESS_SECRET), so no token is ever stored in plain text.
 * - Sessions slide (each refresh extends expires_at by JWT_REFRESH_TTL_DAYS)
 *   but never beyond created_at + JWT_SESSION_MAX_AGE_DAYS.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  private successorKeyCache?: Buffer;

  private get ttlMs(): number {
    return this.config.auth.refreshTokenTtlDays * DAY_MS;
  }

  private get maxAgeMs(): number {
    return this.config.auth.sessionMaxAgeDays * DAY_MS;
  }

  private get graceMs(): number {
    return this.config.auth.refreshReuseGraceSeconds * 1000;
  }

  /** Sliding expiry capped by the absolute session age. */
  private expiryFor(createdAt: Date, now: Date): Date {
    return new Date(Math.min(now.getTime() + this.ttlMs, createdAt.getTime() + this.maxAgeMs));
  }

  /**
   * The token that replaces `token` on rotation. Deterministic so that a
   * retry with the previous token inside the grace window gets the same
   * successor without the server ever storing a usable token.
   */
  private successorOf(sessionId: string, token: string): string {
    this.successorKeyCache ??= Buffer.from(
      hkdfSync(
        'sha256',
        this.config.auth.accessTokenSecret,
        'evcar.refresh-successor',
        'refresh token successor v1',
        32,
      ),
    );
    return createHmac('sha256', this.successorKeyCache)
      .update(`${sessionId}|${token}`)
      .digest('base64url');
  }

  async create(userId: string, meta: SessionMeta, tx?: Tx): Promise<IssuedSession> {
    const refreshToken = generateToken(32);
    const now = new Date();
    const expiresAt = this.expiryFor(now, now);
    const session = await (tx ?? this.prisma).userSession.create({
      data: {
        userId,
        refreshTokenHash: hashToken(refreshToken),
        clientType: meta.clientType,
        deviceName: meta.deviceName?.trim().slice(0, 200) || null,
        userAgent: meta.userAgent?.slice(0, 512) || null,
        ip: cleanIp(meta.ip),
        lastUsedAt: now,
        expiresAt,
      },
      select: { id: true },
    });
    return { sessionId: session.id, userId, refreshToken, expiresAt };
  }

  /**
   * Rotates a refresh token. Throws 401 INVALID_REFRESH_TOKEN (unknown,
   * revoked, expired), 401 REFRESH_TOKEN_REUSED (token family revoked) or
   * 401 ACCOUNT_DISABLED.
   */
  async rotate(
    refreshToken: string | undefined,
    meta: Partial<SessionMeta>,
  ): Promise<IssuedSession> {
    if (!refreshToken || !TOKEN_SHAPE.test(refreshToken)) throw invalidRefresh();
    const hash = hashToken(refreshToken);
    const now = new Date();

    const session = await this.prisma.userSession.findUnique({
      where: { refreshTokenHash: hash },
      select: SESSION_SELECT,
    });

    if (!session) {
      // Not the current token: a retry inside the grace window, reuse of an
      // older token of a family, or simply unknown.
      return this.handleRotatedToken(refreshToken, hash, now);
    }
    this.assertUsable(session, now);
    if (session.user.status !== 'active') {
      await this.revoke(session.id, SessionRevokeReason.ACCOUNT_DISABLED);
      throw authError(HttpStatus.UNAUTHORIZED, AuthErrorCode.ACCOUNT_DISABLED);
    }

    const next = this.successorOf(session.id, refreshToken);
    const expiresAt = this.expiryFor(session.createdAt, now);
    // Past the absolute session age (e.g. after JWT_SESSION_MAX_AGE_DAYS was lowered).
    if (expiresAt <= now) throw invalidRefresh();
    const rotated = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.userSession.updateMany({
        where: { id: session.id, refreshTokenHash: hash, revokedAt: null },
        data: {
          refreshTokenHash: hashToken(next),
          previousRefreshTokenHash: hash,
          lastRotatedAt: now,
          lastUsedAt: now,
          expiresAt,
          ...(meta.ip !== undefined ? { ip: cleanIp(meta.ip) } : {}),
          ...(meta.userAgent ? { userAgent: meta.userAgent.slice(0, 512) } : {}),
        },
      });
      if (count !== 1) return false;
      await tx.refreshTokenHistory.create({
        data: { tokenHash: hash, sessionId: session.id, rotatedAt: now },
      });
      return true;
    });
    if (!rotated) {
      // A concurrent request rotated this token first (grace → same
      // successor), or the session was revoked meanwhile.
      return this.handleRotatedToken(refreshToken, hash, now);
    }
    return { sessionId: session.id, userId: session.userId, refreshToken: next, expiresAt };
  }

  /**
   * `hash` is not the current token of any session. Inside the grace window
   * the immediately previous token gets its (unused) successor again;
   * any other token of a known family is reuse.
   */
  private async handleRotatedToken(token: string, hash: string, now: Date): Promise<IssuedSession> {
    const family = await this.prisma.refreshTokenHistory.findUnique({
      where: { tokenHash: hash },
      select: { session: { select: SESSION_SELECT } },
    });
    if (!family) throw invalidRefresh();
    const session = family.session;
    // A dead session has nothing left to protect (and was audited when it ended).
    this.assertUsable(session, now);
    const successor = this.successorOf(session.id, token);
    const inGrace =
      this.graceMs > 0 &&
      session.previousRefreshTokenHash === hash &&
      session.lastRotatedAt !== null &&
      now.getTime() - session.lastRotatedAt.getTime() <= this.graceMs &&
      // The successor has not been used (rotated) yet.
      session.refreshTokenHash === hashToken(successor);
    if (inGrace) {
      if (session.user.status !== 'active') {
        await this.revoke(session.id, SessionRevokeReason.ACCOUNT_DISABLED);
        throw authError(HttpStatus.UNAUTHORIZED, AuthErrorCode.ACCOUNT_DISABLED);
      }
      await this.prisma.userSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { lastUsedAt: now },
      });
      return {
        sessionId: session.id,
        userId: session.userId,
        refreshToken: successor,
        expiresAt: session.expiresAt,
      };
    }
    await this.reportReuse(session.id, session.userId);
    throw authError(HttpStatus.UNAUTHORIZED, AuthErrorCode.REFRESH_TOKEN_REUSED);
  }

  private assertUsable(session: { revokedAt: Date | null; expiresAt: Date }, now: Date): void {
    if (session.revokedAt || session.expiresAt <= now) throw invalidRefresh();
  }

  /** Finds the session a refresh token belongs to (current hash only), or undefined. */
  async findActiveByRefreshToken(
    refreshToken: string | undefined,
  ): Promise<{ id: string; userId: string } | undefined> {
    if (!refreshToken || !TOKEN_SHAPE.test(refreshToken)) return undefined;
    const s = await this.prisma.userSession.findUnique({
      where: { refreshTokenHash: hashToken(refreshToken) },
      select: { id: true, userId: true, revokedAt: true },
    });
    return s && !s.revokedAt ? { id: s.id, userId: s.userId } : undefined;
  }

  /** Revokes one session (idempotent). Returns true when it was active. */
  async revoke(sessionId: string, reason: string, tx?: Tx): Promise<boolean> {
    const { count } = await (tx ?? this.prisma).userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason.slice(0, 100) },
    });
    return count === 1;
  }

  /** Revokes a session only if it belongs to `userId`. Returns false when not found/not active. */
  async revokeOwned(userId: string, sessionId: string, reason: string): Promise<boolean> {
    const { count } = await this.prisma.userSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason.slice(0, 100) },
    });
    return count === 1;
  }

  /** Revokes every active session of a user (optionally keeping one). Returns the count. */
  async revokeAllForUser(
    userId: string,
    reason: string,
    opts: { exceptSessionId?: string } = {},
    tx?: Tx,
  ): Promise<number> {
    const { count } = await (tx ?? this.prisma).userSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(opts.exceptSessionId ? { id: { not: opts.exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date(), revokedReason: reason.slice(0, 100) },
    });
    return count;
  }

  /** Active (not revoked, not expired) sessions, most recently used first. */
  async listActive(userId: string, currentSessionId?: string): Promise<SessionView[]> {
    const rows = await this.prisma.userSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        clientType: true,
        deviceName: true,
        userAgent: true,
        ip: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      clientType: r.clientType,
      deviceName: r.deviceName,
      userAgent: r.userAgent,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
      lastUsedAt: r.lastUsedAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      current: r.id === currentSessionId,
    }));
  }

  /** Deletes sessions that ended more than `olderThanDays` ago (housekeeping). */
  async purgeEnded(olderThanDays = 30): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 3600 * 1000);
    const { count } = await this.prisma.userSession.deleteMany({
      where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
    });
    return count;
  }

  private async reportReuse(sessionId: string, userId: string): Promise<void> {
    const wasActive = await this.revoke(sessionId, SessionRevokeReason.REFRESH_REUSE);
    this.logger.warn(`Refresh token reuse detected on session ${sessionId}; session revoked`);
    await this.audit.recordSafe({
      action: 'auth.refresh_token_reused',
      entityType: 'session',
      entityId: sessionId,
      actorId: userId,
      actorLabel: null,
      after: { sessionRevoked: wasActive },
    });
  }
}
