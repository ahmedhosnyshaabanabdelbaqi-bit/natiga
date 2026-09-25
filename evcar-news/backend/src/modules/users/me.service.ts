import { HttpStatus, Injectable } from '@nestjs/common';
import { RequestContext } from '../../common/context/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { authError, AuthErrorCode, fieldError } from '../auth/auth.errors';
import type { AuthUser } from '../auth/auth.types';
import { AuthMailService } from '../auth/services/auth-mail.service';
import { LoginAttemptsService } from '../auth/services/login-attempts.service';
import { PasswordService } from '../auth/services/password.service';
import {
  SessionRevokeReason,
  SessionService,
  type SessionView,
} from '../auth/services/session.service';
import { UserViewService, type UserView } from '../auth/services/user-view.service';
import { USER_ROLE } from '../rbac/rbac.constants';
import { assertNotLastOwner, lockOwnership } from './owner-guard';

const WRONG_PASSWORD = {
  ar: 'كلمة المرور الحالية غير صحيحة.',
  en: 'The current password is incorrect.',
};
const NO_PASSWORD = {
  ar: 'لا توجد كلمة مرور لهذا الحساب. استخدم «نسيت كلمة المرور» لتعيين واحدة أولًا.',
  en: 'This account has no password yet. Use "Forgot password" to set one first.',
};

/**
 * The signed-in user's own account: profile, sessions, password change and
 * account deletion (contract §4.4.1 /me).
 */
@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userViews: UserViewService,
    private readonly sessions: SessionService,
    private readonly passwords: PasswordService,
    private readonly attempts: LoginAttemptsService,
    private readonly mail: AuthMailService,
    private readonly audit: AuditService,
  ) {}

  async get(user: AuthUser): Promise<UserView> {
    const view = await this.userViews.load(user.id);
    if (!view) throw authError(HttpStatus.UNAUTHORIZED, AuthErrorCode.SESSION_REVOKED);
    return view;
  }

  async update(user: AuthUser, patch: { displayName?: string; locale?: 'ar' | 'en' }) {
    if (patch.displayName !== undefined || patch.locale !== undefined) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
          ...(patch.locale !== undefined ? { locale: patch.locale } : {}),
        },
      });
    }
    return this.get(user);
  }

  listSessions(user: AuthUser): Promise<SessionView[]> {
    return this.sessions.listActive(user.id, user.sessionId);
  }

  async revokeSession(user: AuthUser, sessionId: string): Promise<void> {
    const revoked = await this.sessions.revokeOwned(
      user.id,
      sessionId,
      SessionRevokeReason.USER_REVOKED,
    );
    if (!revoked) throw authError(HttpStatus.NOT_FOUND, AuthErrorCode.SESSION_NOT_FOUND);
  }

  /** Changes the password (re-authenticated) and signs out every OTHER session. */
  async changePassword(user: AuthUser, currentPassword: string, newPassword: string) {
    const row = await this.verifyPassword(user, currentPassword, 'currentPassword');
    try {
      this.passwords.assertPolicy(newPassword, { email: row.email, displayName: row.displayName });
    } catch (err) {
      throw renameField(err, 'password', 'newPassword');
    }
    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, passwordChangedAt: new Date() },
      });
      const revoked = await this.sessions.revokeAllForUser(
        user.id,
        SessionRevokeReason.PASSWORD_CHANGED,
        { exceptSessionId: user.sessionId },
        tx,
      );
      await this.audit.record(
        {
          action: 'auth.password_changed',
          entityType: 'user',
          entityId: user.id,
          after: { otherSessionsRevoked: revoked },
        },
        tx,
      );
    });
    this.mail.sendPasswordChanged(row.email, row.locale);
  }

  /**
   * Deletes the account (re-authenticated with the password):
   * - personal data is hard-deleted by FK cascades (sessions, tokens,
   *   preferences, favorites, garage, charging logs, reminders, trips,
   *   comparisons, notifications, device tokens, OAuth links, roles…);
   * - public contributions (reviews, comments, Q&A, station reports and
   *   check-ins, uploads) stay but lose their author (user_id → NULL);
   *   reporter IP hashes of the user's station reports are cleared;
   * - the user's own security events in audit_logs lose e-mail, IP and user
   *   agent unless the account held a staff role (kept for accountability).
   * The last active owner cannot delete their account (409 LAST_OWNER).
   */
  async deleteAccount(user: AuthUser, password: string): Promise<void> {
    await this.verifyPassword(user, password, 'password');
    await this.prisma.$transaction(async (tx) => {
      await lockOwnership(tx);
      await assertNotLastOwner(tx, user.id);
      const roles = await tx.userRole.findMany({
        where: { userId: user.id },
        select: { role: { select: { key: true } } },
      });
      const isStaff = roles.some((r) => r.role.key !== USER_ROLE);
      await tx.stationReport.updateMany({
        where: { userId: user.id },
        data: { reporterIpHash: null },
      });
      if (!isStaff) {
        await tx.auditLog.updateMany({
          where: { actorId: user.id },
          data: { actorLabel: null, ip: null, userAgent: null },
        });
      }
      await tx.user.delete({ where: { id: user.id } });
      await this.audit.record(
        {
          action: 'auth.account_deleted',
          entityType: 'user',
          entityId: user.id,
          actorId: null,
          actorLabel: null,
          // Staff deletions keep the request's IP/user agent for accountability;
          // for everyone else no personal data survives the deletion.
          ...(isStaff ? {} : { ip: null, userAgent: null }),
          after: { staffAccount: isStaff },
        },
        tx,
      );
    });
    RequestContext.set({ userId: undefined, userLabel: undefined });
  }

  /**
   * Re-authentication for sensitive actions. A wrong password is a 422 on
   * `field` (never 401, which clients treat as "session ended") and counts
   * towards the same brute-force limits as login.
   */
  private async verifyPassword(user: AuthUser, password: string, field: string) {
    const ip = RequestContext.get()?.ip;
    const lang = RequestContext.get()?.lang ?? 'en';
    const row = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { email: true, displayName: true, locale: true, passwordHash: true },
    });
    // The caller holds a valid session: the account-wide lock (which anonymous
    // clients can trigger) does not apply, the per-(IP, e-mail) limit does.
    const gate = await this.attempts.check(ip, row.email, { trusted: true });
    if (gate.blocked) {
      throw authError(
        HttpStatus.TOO_MANY_REQUESTS,
        AuthErrorCode.TOO_MANY_ATTEMPTS,
        { retryAfterSeconds: gate.retryAfterSeconds },
        { 'Retry-After': String(Math.max(1, gate.retryAfterSeconds)) },
      );
    }
    if (!row.passwordHash) {
      await this.passwords.verify(null, password);
      throw fieldError(field, 'passwordNotSet', NO_PASSWORD, lang);
    }
    if (!(await this.passwords.verify(row.passwordHash, password))) {
      await this.attempts.recordFailure(ip, row.email);
      await this.audit.recordSafe({
        action: 'auth.reauth_failed',
        entityType: 'user',
        entityId: user.id,
      });
      throw fieldError(field, 'invalidPassword', WRONG_PASSWORD, lang);
    }
    await this.attempts.recordSuccess(ip, row.email);
    return row;
  }
}

/** Re-labels a 422 field error (password policy on `password` → `newPassword`). */
function renameField(err: unknown, from: string, to: string): unknown {
  const details = (err as { details?: unknown }).details;
  if (Array.isArray(details)) {
    for (const d of details as { field?: string }[]) if (d.field === from) d.field = to;
  }
  return err;
}
