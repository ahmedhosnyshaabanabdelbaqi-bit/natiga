import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AUTH_ERROR_MESSAGES, authError, AuthErrorCode } from '../auth/auth.errors';
import type { AuthUser } from '../auth/auth.types';
import type { PermissionDto, RoleDto } from './dto/roles.dto';
import { OWNER_ROLE } from './rbac.constants';
import { RbacService } from './rbac.service';

/**
 * Roles and the role → permission matrix. Reading needs roles.read;
 * editing a role's permissions needs roles.manage AND the owner role
 * (the matrix decides who can do what, so only owners change it). The
 * owner role itself is not editable (it always has every permission).
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<RoleDto[]> {
    const [roles, all] = await Promise.all([
      this.prisma.role.findMany({
        orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          key: true,
          nameAr: true,
          nameEn: true,
          description: true,
          isSystem: true,
          permissions: { select: { permission: { select: { key: true } } } },
          _count: { select: { users: true } },
        },
      }),
      this.rbac.allPermissions(),
    ]);
    return roles.map((r) => ({
      id: r.id,
      key: r.key,
      nameAr: r.nameAr,
      nameEn: r.nameEn,
      description: r.description,
      isSystem: r.isSystem,
      permissions: r.key === OWNER_ROLE ? all : r.permissions.map((p) => p.permission.key).sort(),
      permissionsEditable: r.key !== OWNER_ROLE,
      userCount: r._count.users,
    }));
  }

  async get(key: string): Promise<RoleDto> {
    const role = (await this.list()).find((r) => r.key === key);
    if (!role) throw authError(HttpStatus.NOT_FOUND, AuthErrorCode.ROLE_NOT_FOUND);
    return role;
  }

  async permissions(): Promise<PermissionDto[]> {
    return this.prisma.permission.findMany({
      orderBy: [{ group: 'asc' }, { key: 'asc' }],
      select: { key: true, group: true, descriptionAr: true, descriptionEn: true },
    });
  }

  async setPermissions(actor: AuthUser, key: string, requested: string[]): Promise<RoleDto> {
    if (!actor.roles.includes(OWNER_ROLE)) {
      throw authError(HttpStatus.FORBIDDEN, AuthErrorCode.OWNER_ONLY);
    }
    if (key === OWNER_ROLE) {
      throw authError(HttpStatus.CONFLICT, AuthErrorCode.ROLE_NOT_EDITABLE);
    }
    const wanted = [...new Set(requested)].sort();
    await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({
        where: { key },
        select: { id: true, permissions: { select: { permission: { select: { key: true } } } } },
      });
      if (!role) throw authError(HttpStatus.NOT_FOUND, AuthErrorCode.ROLE_NOT_FOUND);
      const perms = await tx.permission.findMany({
        where: { key: { in: wanted } },
        select: { id: true, key: true },
      });
      const unknown = wanted.filter((k) => !perms.some((p) => p.key === k));
      if (unknown.length) {
        throw new AppException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          code: AuthErrorCode.UNKNOWN_PERMISSION,
          message: AUTH_ERROR_MESSAGES.UNKNOWN_PERMISSION,
          details: { permissions: unknown },
        });
      }
      const before = role.permissions.map((p) => p.permission.key).sort();
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (perms.length) {
        await tx.rolePermission.createMany({
          data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
        });
      }
      this.audit.annotate({
        action: 'roles.permissions.update',
        entityType: 'role',
        entityId: key,
        before: { permissions: before },
        after: {
          permissions: wanted,
          added: wanted.filter((p) => !before.includes(p)),
          removed: before.filter((p) => !wanted.includes(p)),
        },
      });
    });
    this.rbac.invalidate();
    return this.get(key);
  }
}
