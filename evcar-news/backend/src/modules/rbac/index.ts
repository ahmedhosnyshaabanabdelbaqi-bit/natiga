/**
 * Public API of the rbac module for other modules:
 *
 *   import { RequirePermissions } from '../rbac';
 *   @RequirePermissions('articles.publish')
 *
 * Permission keys are seeded from src/cli/seed-data/rbac.ts.
 */
export {
  RequireAnyPermission,
  RequirePermissions,
} from './decorators/require-permissions.decorator';
export { PERMISSIONS_KEY, type PermissionRequirement } from './decorators/permissions.metadata';
export { PermissionsGuard } from './guards/permissions.guard';
export { RbacService } from './rbac.service';
export { ADMIN_ROLE, OWNER_ROLE, PRIVILEGED_ROLES, USER_ROLE } from './rbac.constants';
