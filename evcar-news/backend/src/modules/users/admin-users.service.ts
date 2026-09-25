import { HttpStatus, Injectable } from '@nestjs/common';
import { toPageRequest } from '../../common/http/pagination';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUTH_ERROR_MESSAGES, authError, AuthErrorCode } from '../auth/auth.errors';
import type { AuthUser } from '../auth/auth.types';
import {
  SessionRevokeReason,
  SessionService,
  type SessionView,
} from '../auth/services/session.service';
import { OWNER_ROLE, P, PRIVILEGED_ROLES, USER_ROLE } from '../rbac/rbac.constants';
import { RbacService } from '../rbac/rbac.service';
import type {
  AdminUserDetailDto,
  AdminUserListItemDto,
  ListUsersQueryDto,
  UserSort,
} from './dto/users.dto';
import { assertNotLastOwner, lockOwnership } from './owner-guard';

const LIST_SELECT = {
  id: true,
  email: true,
  displayName: true,
  emailVerifiedAt: true,
  locale: true,
  status: true,
  createdAt: true,
  lastLoginAt: true,
  isDemo: true,
  roles: { select: { role: { select: { key: true } } } },
} satisfies Prisma.UserSelect;

type ListRow = Prisma.UserGetPayload<{ select: typeof LIST_SELECT }>;

const SORT_FIELDS: Record<string, keyof Prisma.UserOrderByWithRelationInput> = {
  createdAt: 'createdAt',
  email: 'email',
  displayName: 'displayName',
  lastLoginAt: 'lastLoginAt',
};

function orderBy(sort: UserSort | undefined): Prisma.UserOrderByWithRelationInput[] {
  const s = sort ?? '-createdAt';
  const desc = s.startsWith('-');
  const field = SORT_FIELDS[desc ? s.slice(1) : s] ?? 'createdAt';
  const direction = desc ? 'desc' : 'asc';
  const primary =
    field === 'lastLoginAt'
      ? { lastLoginAt: { sort: direction, nulls: 'last' } }
      : { [field]: direction };
  return [primary as Prisma.UserOrderByWithRelationInput, { id: direction }];
}

function toListItem(row: ListRow): AdminUserListItemDto {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    emailVerified: row.emailVerifiedAt !== null,
    locale: row.locale,
    roles: row.roles.map((r) => r.role.key).sort(),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    isDemo: row.isDemo,
  };
}

const notFound = () => authError(HttpStatus.NOT_FOUND, AuthErrorCode.USER_NOT_FOUND);

/**
 * Administration of accounts (/api/v1/admin/users). Rules on top of the
 * route permissions:
 * - granting/removing `owner` requires the actor to be an owner; granting/
 *   removing `admin` requires `users.manage_admins`;
 * - acting on an owner (roles, status, sessions — including LISTING their
 *   sessions, which expose IPs and devices) requires being an owner; acting
 *   on an admin requires `users.manage_admins`;
 * - `users.block` alone (community moderators) only suspends / re-activates
 *   plain accounts (role `user` only); changing the status of any staff
 *   account needs `users.manage` as well;
 * - the last active owner can never lose the role or be suspended;
 * - nobody can suspend themselves.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListUsersQueryDto) {
    const page = toPageRequest(query);
    const and: Prisma.UserWhereInput[] = [];
    if (query.q) {
      and.push({
        OR: [
          { email: { contains: query.q, mode: 'insensitive' } },
          { displayName: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    }
    if (query.role) and.push({ roles: { some: { role: { key: query.role } } } });
    if (query.status) and.push({ status: query.status });
    const where: Prisma.UserWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: LIST_SELECT,
        orderBy: orderBy(query.sort),
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: rows.map(toListItem), total, page };
  }

  async get(id: string): Promise<AdminUserDetailDto> {
    const row = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...LIST_SELECT,
        updatedAt: true,
        passwordHash: true,
        failedLoginCount: true,
        lockedUntil: true,
        oauthAccounts: { select: { provider: true } },
        _count: {
          select: { sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } } } },
        },
      },
    });
    if (!row) throw notFound();
    const base = toListItem(row);
    return {
      ...base,
      permissions: await this.rbac.permissionsForRoles(base.roles),
      updatedAt: row.updatedAt.toISOString(),
      hasPassword: row.passwordHash !== null,
      oauthProviders: [...new Set(row.oauthAccounts.map((o) => o.provider))].sort(),
      activeSessions: row._count.sessions,
      failedLoginCount: row.failedLoginCount,
      lockedUntil: row.lockedUntil?.toISOString() ?? null,
    };
  }

  /** Replaces the user's role set ("user" is always kept). */
  async setRoles(actor: AuthUser, targetId: string, requested: string[]) {
    const wanted = new Set([...requested, USER_ROLE]);
    await this.prisma.$transaction(async (tx) => {
      await lockOwnership(tx);
      const target = await this.loadTarget(tx, targetId);
      await this.assertCanManage(actor, target.roles);

      const roles = await tx.role.findMany({
        where: { key: { in: [...wanted] } },
        select: { id: true, key: true },
      });
      const unknown = [...wanted].filter((k) => !roles.some((r) => r.key === k));
      if (unknown.length) {
        throw new AppException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          code: AuthErrorCode.UNKNOWN_ROLE,
          message: AUTH_ERROR_MESSAGES.UNKNOWN_ROLE,
          details: { roles: unknown },
        });
      }
      const current = new Set(target.roles);
      const added = [...wanted].filter((k) => !current.has(k));
      const removed = [...current].filter((k) => !wanted.has(k));
      for (const key of [...added, ...removed]) await this.assertCanGrant(actor, key);
      if (removed.includes(OWNER_ROLE)) await assertNotLastOwner(tx, targetId);

      if (removed.length) {
        await tx.userRole.deleteMany({
          where: { userId: targetId, role: { key: { in: removed } } },
        });
      }
      for (const role of roles.filter((r) => added.includes(r.key))) {
        await tx.userRole.create({
          data: { userId: targetId, roleId: role.id, grantedById: actor.id },
        });
      }
      this.audit.annotate({
        action: 'users.roles.update',
        entityType: 'user',
        entityId: targetId,
        before: { roles: [...current].sort() },
        after: { roles: [...wanted].sort(), added, removed },
      });
    });
    return this.get(targetId);
  }

  async addRole(actor: AuthUser, targetId: string, roleKey: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { roles: { select: { role: { select: { key: true } } } } },
    });
    if (!target) throw notFound();
    const roles = target.roles.map((r) => r.role.key);
    return this.setRoles(actor, targetId, [...roles, roleKey]);
  }

  async removeRole(actor: AuthUser, targetId: string, roleKey: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { roles: { select: { role: { select: { key: true } } } } },
    });
    if (!target) throw notFound();
    if (roleKey === USER_ROLE) {
      throw new AppException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: AuthErrorCode.UNKNOWN_ROLE,
        message: {
          ar: 'لا يمكن إزالة دور المستخدم الأساسي.',
          en: 'The base "user" role cannot be removed.',
        },
        details: { roles: [roleKey] },
      });
    }
    const roles = target.roles.map((r) => r.role.key).filter((k) => k !== roleKey);
    return this.setRoles(actor, targetId, roles);
  }

  /** Suspends (revoking every session) or re-activates an account. */
  async setStatus(
    actor: AuthUser,
    targetId: string,
    status: 'active' | 'suspended',
    reason?: string,
  ) {
    if (actor.id === targetId) {
      throw authError(HttpStatus.CONFLICT, AuthErrorCode.CANNOT_TARGET_SELF);
    }
    await this.prisma.$transaction(async (tx) => {
      await lockOwnership(tx);
      const target = await this.loadTarget(tx, targetId);
      await this.assertCanManage(actor, target.roles);
      await this.assertCanChangeStatus(actor, target.roles);
      if (status === 'suspended') await assertNotLastOwner(tx, targetId);
      await tx.user.update({ where: { id: targetId }, data: { status } });
      const revoked =
        status === 'suspended'
          ? await this.sessions.revokeAllForUser(
              targetId,
              SessionRevokeReason.ACCOUNT_DISABLED,
              {},
              tx,
            )
          : 0;
      this.audit.annotate({
        action: status === 'suspended' ? 'users.suspend' : 'users.reactivate',
        entityType: 'user',
        entityId: targetId,
        before: { status: target.status },
        after: { status, reason: reason ?? null, sessionsRevoked: revoked },
      });
    });
    return this.get(targetId);
  }

  async listSessions(actor: AuthUser, targetId: string): Promise<SessionView[]> {
    const target = await this.loadTarget(this.prisma, targetId);
    // Sessions carry IPs, user agents and device names: same protection as acting on them.
    await this.assertCanManage(actor, target.roles);
    return this.sessions.listActive(targetId);
  }

  async revokeSession(actor: AuthUser, targetId: string, sessionId: string): Promise<void> {
    const target = await this.loadTarget(this.prisma, targetId);
    await this.assertCanManage(actor, target.roles);
    const ok = await this.sessions.revokeOwned(
      targetId,
      sessionId,
      SessionRevokeReason.ADMIN_REVOKED,
    );
    if (!ok) throw authError(HttpStatus.NOT_FOUND, AuthErrorCode.SESSION_NOT_FOUND);
    this.audit.annotate({
      action: 'users.sessions.revoke',
      entityType: 'user',
      entityId: targetId,
      after: { sessionId },
    });
  }

  async revokeAllSessions(actor: AuthUser, targetId: string): Promise<number> {
    const target = await this.loadTarget(this.prisma, targetId);
    await this.assertCanManage(actor, target.roles);
    const count = await this.sessions.revokeAllForUser(targetId, SessionRevokeReason.ADMIN_REVOKED);
    this.audit.annotate({
      action: 'users.sessions.revoke_all',
      entityType: 'user',
      entityId: targetId,
      after: { sessionsRevoked: count },
    });
    return count;
  }

  // ---- rules ------------------------------------------------------------------

  private async loadTarget(tx: Prisma.TransactionClient, id: string) {
    const row = await tx.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        status: true,
        roles: { select: { role: { select: { key: true } } } },
      },
    });
    if (!row) throw notFound();
    return { ...row, roles: row.roles.map((r) => r.role.key) };
  }

  /** Protects owners and admins from actors below them. */
  private async assertCanManage(actor: AuthUser, targetRoles: string[]): Promise<void> {
    if (targetRoles.includes(OWNER_ROLE) && !actor.roles.includes(OWNER_ROLE)) {
      throw authError(HttpStatus.FORBIDDEN, AuthErrorCode.OWNER_ONLY);
    }
    if (
      targetRoles.some((r) => PRIVILEGED_ROLES.includes(r)) &&
      !(await this.rbac.hasAll(actor.roles, [P.USERS_MANAGE_ADMINS]))
    ) {
      throw AppException.forbidden(undefined, ErrorCode.FORBIDDEN);
    }
  }

  /** users.block covers plain accounts only; staff accounts need users.manage. */
  private async assertCanChangeStatus(actor: AuthUser, targetRoles: string[]): Promise<void> {
    const isStaff = targetRoles.some((r) => r !== USER_ROLE);
    if (isStaff && !(await this.rbac.hasAll(actor.roles, [P.USERS_MANAGE]))) {
      throw AppException.forbidden(undefined, ErrorCode.FORBIDDEN);
    }
  }

  private async assertCanGrant(actor: AuthUser, roleKey: string): Promise<void> {
    if (roleKey === OWNER_ROLE && !actor.roles.includes(OWNER_ROLE)) {
      throw authError(HttpStatus.FORBIDDEN, AuthErrorCode.OWNER_ONLY);
    }
    if (
      PRIVILEGED_ROLES.includes(roleKey) &&
      !(await this.rbac.hasAll(actor.roles, [P.USERS_MANAGE_ADMINS]))
    ) {
      throw AppException.forbidden(undefined, ErrorCode.FORBIDDEN);
    }
  }
}
