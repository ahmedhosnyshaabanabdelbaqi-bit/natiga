import { HttpStatus, Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { AppException } from '../../../common/errors/app.exception';
import { withMinimumDuration } from '../../../common/utils/min-duration';
import { AppConfig } from '../../../config/app-config';
import { Prisma, type ClientType } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { USER_ROLE } from '../../rbac/rbac.constants';
import { authError, AuthErrorCode } from '../auth.errors';
import type { IdTokenVerifier, VerifiedIdentity } from '../oauth/oauth-verifiers';
import { OAuthTokenInvalidError } from '../oauth/oauth-verifiers';
import { AuthMailService } from './auth-mail.service';
import { EmailTokenService } from './email-token.service';
import { LoginAttemptsService } from './login-attempts.service';
import { PasswordService } from './password.service';
import { SessionRevokeReason, SessionService, type IssuedSession } from './session.service';
import { AccessTokenError, TokenService } from './token.service';
import {
  USER_VIEW_SELECT,
  UserViewService,
  type UserView,
  type UserViewRow,
} from './user-view.service';

/** Who is calling (derived from headers by the controller). */
export interface ClientContext {
  clientType: Extract<ClientType, 'web' | 'mobile'>;
  ip?: string;
  userAgent?: string;
  lang: 'ar' | 'en';
  /** Opaque device id (web cookie / mobile header), see auth-http.ts. */
  deviceId?: string;
}

export interface LoginResult {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: UserView;
}

/** Minimum delay between two verification / reset e-mails for the same account. */
export const EMAIL_RESEND_COOLDOWN_MS = 60_000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Authentication flows of contract §4.4.1. Security properties:
 * - no user enumeration: register, resend-verification and forgot-password
 *   answer identically whether or not the address has an account; login
 *   failures are always INVALID_CREDENTIALS and unknown e-mails still pay
 *   the argon2 cost (dummy hash);
 * - brute force: per ip+e-mail and per e-mail backoff (LoginAttemptsService)
 *   on top of the per-IP route throttle;
 * - login requires a verified e-mail (403 EMAIL_NOT_VERIFIED, only after a
 *   correct password) and an active account (403 ACCOUNT_DISABLED);
 * - password reset / change revoke every session.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    private readonly emailTokens: EmailTokenService,
    private readonly attempts: LoginAttemptsService,
    private readonly mail: AuthMailService,
    private readonly userViews: UserViewService,
    private readonly audit: AuditService,
  ) {}

  // ---- register / verify ------------------------------------------------------

  /**
   * Register, resend-verification and forgot-password take the same minimum
   * time whatever the branch (AUTH_UNIFORM_RESPONSE_MS): measured on a dev
   * machine, "address exists" and "new address" differed by 4-10 ms, enough
   * to enumerate accounts from a single request.
   */
  private uniform<T>(fn: () => Promise<T>): Promise<T> {
    return withMinimumDuration(this.config.auth.uniformResponseMs, fn);
  }

  register(
    input: { email: string; password: string; displayName: string; locale?: 'ar' | 'en' },
    ctx: ClientContext,
  ): Promise<UserView> {
    return this.uniform(() => this.registerNow(input, ctx));
  }

  private async registerNow(
    input: { email: string; password: string; displayName: string; locale?: 'ar' | 'en' },
    ctx: ClientContext,
  ): Promise<UserView> {
    const email = normalizeEmail(input.email);
    const displayName = input.displayName;
    const locale = input.locale ?? ctx.lang;
    this.passwords.assertPolicy(input.password, { email, displayName });

    // Hash first on every path so both branches cost the same.
    const passwordHash = await this.passwords.hash(input.password);
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, locale: true, displayName: true, emailVerifiedAt: true, status: true },
    });

    // Do not reveal that the address is registered: answer like a new
    // sign-up and tell the real owner by e-mail instead.
    const alreadyRegistered = (): UserView => {
      if (existing?.status === 'active') {
        this.mail.sendAccountExists(email, existing.locale);
      }
      return {
        id: uuidv7(),
        email,
        displayName,
        emailVerified: false,
        locale,
        roles: [USER_ROLE],
        permissions: [],
        createdAt: new Date().toISOString(),
      };
    };
    if (existing) return alreadyRegistered();

    const role = await this.prisma.role.findUnique({ where: { key: USER_ROLE } });
    let created: { user: UserViewRow; token: string };
    try {
      created = await this.createAccount(
        { email, passwordHash, displayName, locale, roleId: role?.id },
        ctx,
      );
    } catch (err) {
      // A concurrent sign-up with the same address won the unique index:
      // answer the same way instead of leaking a 409.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return alreadyRegistered();
      }
      throw err;
    }
    this.mail.sendVerification(email, locale, created.token);
    return this.userViews.fromRow(created.user);
  }

  private createAccount(
    input: {
      email: string;
      passwordHash: string;
      displayName: string;
      locale: string;
      roleId?: string;
    },
    ctx: ClientContext,
  ): Promise<{ user: UserViewRow; token: string }> {
    const { email, passwordHash, displayName, locale, roleId } = input;
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email, passwordHash, displayName, locale, passwordChangedAt: new Date() },
        select: { id: true },
      });
      if (roleId) await tx.userRole.create({ data: { userId: created.id, roleId } });
      const issued = await this.emailTokens.issue(
        {
          userId: created.id,
          purpose: 'verify_email',
          email,
          ttlMinutes: this.config.auth.emailTokenTtlMinutes,
          ip: ctx.ip,
        },
        tx,
      );
      const row = await tx.user.findUniqueOrThrow({
        where: { id: created.id },
        select: USER_VIEW_SELECT,
      });
      return { user: row, token: issued.token };
    });
  }

  async verifyEmail(token: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const consumed = await this.emailTokens.consume(token, ['verify_email'], tx);
      const user = await tx.user.findUnique({
        where: { id: consumed.userId },
        select: { id: true, email: true, emailVerifiedAt: true },
      });
      // The token must belong to the address the account still has.
      if (!user || (consumed.email && consumed.email !== user.email)) {
        throw authError(HttpStatus.BAD_REQUEST, AuthErrorCode.INVALID_OR_EXPIRED_TOKEN);
      }
      if (!user.emailVerifiedAt) {
        await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
      }
    });
  }

  /** Always resolves (202): never reveals whether the address exists or is verified. */
  resendVerification(rawEmail: string, ctx: ClientContext): Promise<void> {
    return this.uniform(() => this.resendVerificationNow(rawEmail, ctx));
  }

  private async resendVerificationNow(rawEmail: string, ctx: ClientContext): Promise<void> {
    const email = normalizeEmail(rawEmail);
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, displayName: true, locale: true, emailVerifiedAt: true, status: true },
    });
    if (!user || user.emailVerifiedAt || user.status !== 'active') return;
    if (await this.inCooldown(user.id, 'verify_email')) return;
    const { token } = await this.emailTokens.issue({
      userId: user.id,
      purpose: 'verify_email',
      email,
      ttlMinutes: this.config.auth.emailTokenTtlMinutes,
      ip: ctx.ip,
    });
    this.mail.sendVerification(email, user.locale, token);
  }

  // ---- login / refresh / logout --------------------------------------------

  async login(
    input: { email: string; password: string; deviceName?: string },
    ctx: ClientContext,
  ): Promise<LoginResult> {
    const email = normalizeEmail(input.email);
    const gate = await this.attempts.check(ctx.ip, email, { deviceId: ctx.deviceId });
    if (gate.blocked) throw this.tooManyAttempts(gate.retryAfterSeconds);

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, status: true, emailVerifiedAt: true },
    });
    const valid = await this.passwords.verify(user?.passwordHash, input.password);

    if (!valid || !user) {
      const failure = await this.attempts.recordFailure(ctx.ip, email);
      if (user) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: failure.failures, lockedUntil: failure.lockedUntil },
        });
      }
      await this.audit.recordSafe({
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: user?.id ?? null,
        actorId: user?.id ?? null,
        actorLabel: user ? email : null,
        after: {
          reason: user ? 'invalid_password' : 'unknown_account',
          clientType: ctx.clientType,
          consecutiveFailures: failure.failures,
          locked: failure.blocked,
        },
      });
      throw authError(HttpStatus.UNAUTHORIZED, AuthErrorCode.INVALID_CREDENTIALS);
    }

    await this.attempts.recordSuccess(ctx.ip, email);
    if (user.status !== 'active') {
      throw authError(HttpStatus.FORBIDDEN, AuthErrorCode.ACCOUNT_DISABLED);
    }
    if (!user.emailVerifiedAt) {
      throw authError(HttpStatus.FORBIDDEN, AuthErrorCode.EMAIL_NOT_VERIFIED);
    }
    if (user.passwordHash && this.passwords.needsRehash(user.passwordHash)) {
      const rehashed = await this.passwords.hash(input.password);
      await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: rehashed } });
    }
    const result = await this.startSession(user.id, ctx, input.deviceName);
    await this.attempts.rememberClient(ctx.ip, email, ctx.deviceId);
    await this.audit.recordSafe({
      action: 'auth.login',
      entityType: 'session',
      entityId: result.sessionId,
      actorId: user.id,
      actorLabel: email,
      after: { method: 'password', clientType: ctx.clientType },
    });
    return result.login;
  }

  async refresh(refreshToken: string | undefined, ctx: ClientContext): Promise<LoginResult> {
    const issued = await this.sessions.rotate(refreshToken, {
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return this.buildLoginResult(issued);
  }

  /** Ends the session of the refresh token (or of the access token). Idempotent. */
  async logout(refreshToken: string | undefined, accessToken: string | undefined): Promise<void> {
    const byRefresh = await this.sessions.findActiveByRefreshToken(refreshToken);
    if (byRefresh) {
      await this.sessions.revoke(byRefresh.id, SessionRevokeReason.LOGOUT);
      return;
    }
    if (!accessToken) return;
    try {
      const claims = await this.tokens.verifyAccessToken(accessToken, { allowExpired: true });
      await this.sessions.revokeOwned(claims.sub, claims.sid, SessionRevokeReason.LOGOUT);
    } catch (err) {
      if (!(err instanceof AccessTokenError)) throw err;
    }
  }

  // ---- password reset -------------------------------------------------------

  /** Always resolves (202): never reveals whether the address exists. */
  forgotPassword(rawEmail: string, ctx: ClientContext): Promise<void> {
    return this.uniform(() => this.forgotPasswordNow(rawEmail, ctx));
  }

  private async forgotPasswordNow(rawEmail: string, ctx: ClientContext): Promise<void> {
    const email = normalizeEmail(rawEmail);
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, displayName: true, locale: true, status: true },
    });
    if (!user || user.status !== 'active') return;
    if (await this.inCooldown(user.id, 'reset_password')) return;
    const { token } = await this.emailTokens.issue({
      userId: user.id,
      purpose: 'reset_password',
      email,
      ttlMinutes: this.config.auth.passwordResetTtlMinutes,
      ip: ctx.ip,
    });
    this.mail.sendPasswordReset(
      email,
      user.locale,
      token,
      ctx.clientType === 'web' ? 'web' : 'app',
    );
  }

  /**
   * Sets a new password from a reset or owner-setup token. The token is only
   * consumed when the new password passes the policy. Proves control of the
   * mailbox, so the e-mail becomes verified; every session is revoked.
   */
  async resetPassword(token: string, password: string): Promise<void> {
    const peek = await this.emailTokens.peek(token, ['reset_password', 'setup_password']);
    const target = await this.prisma.user.findUnique({
      where: { id: peek.userId },
      select: { email: true, displayName: true },
    });
    if (!target) throw authError(HttpStatus.BAD_REQUEST, AuthErrorCode.INVALID_OR_EXPIRED_TOKEN);
    this.passwords.assertPolicy(password, target);
    const passwordHash = await this.passwords.hash(password);

    const user = await this.prisma.$transaction(async (tx) => {
      const consumed = await this.emailTokens.consume(
        token,
        ['reset_password', 'setup_password'],
        tx,
      );
      const now = new Date();
      const current = await tx.user.findUniqueOrThrow({
        where: { id: consumed.userId },
        select: { id: true, email: true, emailVerifiedAt: true },
      });
      if (consumed.email && consumed.email !== current.email) {
        throw authError(HttpStatus.BAD_REQUEST, AuthErrorCode.INVALID_OR_EXPIRED_TOKEN);
      }
      const updated = await tx.user.update({
        where: { id: consumed.userId },
        data: {
          passwordHash,
          passwordChangedAt: now,
          failedLoginCount: 0,
          lockedUntil: null,
          ...(current.emailVerifiedAt ? {} : { emailVerifiedAt: now }),
        },
        select: { id: true, email: true, displayName: true, locale: true },
      });
      // Other outstanding reset/setup links stop working too.
      await tx.emailToken.updateMany({
        where: {
          userId: updated.id,
          purpose: { in: ['reset_password', 'setup_password'] },
          usedAt: null,
        },
        data: { usedAt: now },
      });
      const revoked = await this.sessions.revokeAllForUser(
        updated.id,
        SessionRevokeReason.PASSWORD_RESET,
        {},
        tx,
      );
      await this.audit.record(
        {
          action:
            consumed.purpose === 'setup_password' ? 'auth.password_setup' : 'auth.password_reset',
          entityType: 'user',
          entityId: updated.id,
          actorId: updated.id,
          actorLabel: updated.email,
          after: { sessionsRevoked: revoked },
        },
        tx,
      );
      return updated;
    });
    await this.attempts.clearEmail(user.email);
    this.mail.sendPasswordChanged(user.email, user.locale);
  }

  // ---- OAuth ----------------------------------------------------------------

  async oauthLogin(
    verifier: IdTokenVerifier,
    idToken: string,
    ctx: ClientContext,
    deviceName?: string,
  ): Promise<LoginResult> {
    if (!verifier.isConfigured()) {
      throw AppException.integrationNotConfigured(`oauth.${verifier.provider}`);
    }
    let identity: VerifiedIdentity;
    try {
      identity = await verifier.verify(idToken);
    } catch (err) {
      if (err instanceof OAuthTokenInvalidError) {
        throw authError(HttpStatus.UNAUTHORIZED, AuthErrorCode.OAUTH_TOKEN_INVALID);
      }
      throw err;
    }

    const userId = await this.resolveOAuthUser(identity, ctx);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { status: true, email: true },
    });
    if (user.status !== 'active') {
      throw authError(HttpStatus.FORBIDDEN, AuthErrorCode.ACCOUNT_DISABLED);
    }
    const result = await this.startSession(userId, ctx, deviceName);
    await this.attempts.rememberClient(ctx.ip, user.email, ctx.deviceId);
    await this.audit.recordSafe({
      action: 'auth.login',
      entityType: 'session',
      entityId: result.sessionId,
      actorId: userId,
      actorLabel: user.email,
      after: { method: identity.provider, clientType: ctx.clientType },
    });
    return result.login;
  }

  private async resolveOAuthUser(identity: VerifiedIdentity, ctx: ClientContext): Promise<string> {
    const linked = await this.prisma.userOAuthAccount.findUnique({
      where: {
        provider_providerUserId: { provider: identity.provider, providerUserId: identity.subject },
      },
      select: { id: true, userId: true },
    });
    if (linked) {
      await this.prisma.userOAuthAccount.update({
        where: { id: linked.id },
        data: { lastUsedAt: new Date(), ...(identity.email ? { email: identity.email } : {}) },
      });
      return linked.userId;
    }
    if (!identity.email || !identity.emailVerified) {
      throw authError(HttpStatus.FORBIDDEN, AuthErrorCode.OAUTH_EMAIL_UNVERIFIED);
    }
    const email = identity.email;
    const role = await this.prisma.role.findUnique({ where: { key: USER_ROLE } });

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      let user = await tx.user.findUnique({
        where: { email },
        select: { id: true, emailVerifiedAt: true },
      });
      if (user && !user.emailVerifiedAt) {
        // Someone registered this address without proving they own it; the
        // provider just proved that THIS caller does. Drop the unproven
        // password and sessions (pre-account-hijacking protection).
        await tx.user.update({
          where: { id: user.id },
          data: { passwordHash: null, emailVerifiedAt: now, passwordChangedAt: now },
        });
        await this.sessions.revokeAllForUser(
          user.id,
          SessionRevokeReason.ACCOUNT_TAKEOVER_PROTECTION,
          {},
          tx,
        );
      }
      if (!user) {
        user = await tx.user.create({
          data: {
            email,
            displayName: (identity.name ?? email.split('@')[0]).slice(0, 100),
            locale: ctx.lang,
            emailVerifiedAt: now,
          },
          select: { id: true, emailVerifiedAt: true },
        });
        if (role) await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
      }
      await tx.userOAuthAccount.create({
        data: {
          userId: user.id,
          provider: identity.provider,
          providerUserId: identity.subject,
          email,
          lastUsedAt: now,
        },
      });
      await this.audit.record(
        {
          action: 'auth.oauth_linked',
          entityType: 'user',
          entityId: user.id,
          actorId: user.id,
          actorLabel: email,
          after: { provider: identity.provider },
        },
        tx,
      );
      return user.id;
    });
  }

  // ---- helpers --------------------------------------------------------------

  private async startSession(
    userId: string,
    ctx: ClientContext,
    deviceName?: string,
  ): Promise<{ sessionId: string; login: LoginResult }> {
    const issued = await this.sessions.create(userId, {
      clientType: ctx.clientType,
      deviceName: deviceName ?? null,
      userAgent: ctx.userAgent ?? null,
      ip: ctx.ip ?? null,
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    });
    return { sessionId: issued.sessionId, login: await this.buildLoginResult(issued) };
  }

  private async buildLoginResult(issued: IssuedSession): Promise<LoginResult> {
    const user = await this.userViews.load(issued.userId);
    if (!user) throw authError(HttpStatus.UNAUTHORIZED, AuthErrorCode.INVALID_REFRESH_TOKEN);
    return {
      accessToken: await this.tokens.signAccessToken(issued.userId, issued.sessionId),
      accessTokenExpiresIn: this.tokens.accessTokenTtlSeconds,
      refreshToken: issued.refreshToken,
      refreshTokenExpiresAt: issued.expiresAt,
      user,
    };
  }

  private async inCooldown(
    userId: string,
    purpose: 'verify_email' | 'reset_password',
  ): Promise<boolean> {
    const last = await this.emailTokens.latestIssuedAt(userId, purpose);
    return !!last && Date.now() - last.getTime() < EMAIL_RESEND_COOLDOWN_MS;
  }

  private tooManyAttempts(retryAfterSeconds: number): AppException {
    return authError(
      HttpStatus.TOO_MANY_REQUESTS,
      AuthErrorCode.TOO_MANY_ATTEMPTS,
      { retryAfterSeconds },
      { 'Retry-After': String(Math.max(1, retryAfterSeconds)) },
    );
  }
}
