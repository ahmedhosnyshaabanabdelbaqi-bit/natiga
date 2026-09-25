import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { AuditService } from '../../audit/audit.service';
import type { AuthenticatedRequest } from '../../auth/auth.types';
import { PERMISSIONS_KEY, type PermissionRequirement } from '../decorators/permissions.metadata';
import { RbacService } from '../rbac.service';

/**
 * Enforces @RequirePermissions / @RequireAnyPermission. Class-level and
 * method-level requirements must BOTH be satisfied. Permissions are read
 * from role_permissions through RbacService (brief cache), never from the
 * token, so role changes apply immediately. Denials are written to the
 * audit log as `security.permission_denied`.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirements = [
      this.reflector.get<PermissionRequirement | undefined>(PERMISSIONS_KEY, context.getClass()),
      this.reflector.get<PermissionRequirement | undefined>(PERMISSIONS_KEY, context.getHandler()),
    ].filter((r): r is PermissionRequirement => !!r && r.permissions.length > 0);
    if (requirements.length === 0) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = req.user;
    if (!user) throw AppException.unauthorized(ErrorCode.UNAUTHORIZED);

    const granted = new Set(await this.rbac.permissionsForRoles(user.roles));
    const failed = requirements.find((r) =>
      r.mode === 'any'
        ? !r.permissions.some((p) => granted.has(p))
        : !r.permissions.every((p) => granted.has(p)),
    );
    if (!failed) return true;

    await this.audit.recordSafe({
      action: 'security.permission_denied',
      entityType: 'route',
      entityId: null,
      after: {
        method: req.method,
        path: (req.originalUrl ?? req.url ?? '').split('?')[0],
        required: failed.permissions,
        mode: failed.mode,
      },
    });
    throw AppException.forbidden(undefined, ErrorCode.FORBIDDEN);
  }
}
