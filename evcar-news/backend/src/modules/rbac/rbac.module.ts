import { Global, Module } from '@nestjs/common';
import { AdminPermissionsController, AdminRolesController } from './admin-roles.controller';
import { PermissionsGuard } from './guards/permissions.guard';
import { RbacService } from './rbac.service';
import { RolesService } from './roles.service';

/**
 * Roles, permissions and the @RequirePermissions guard (contract §4.4),
 * plus /admin/roles and /admin/permissions. Global so every feature module
 * can use @RequirePermissions (the guard's dependencies must be resolvable
 * from the host module).
 */
@Global()
@Module({
  controllers: [AdminRolesController, AdminPermissionsController],
  providers: [RbacService, PermissionsGuard, RolesService],
  exports: [RbacService, PermissionsGuard],
})
export class RbacModule {}
