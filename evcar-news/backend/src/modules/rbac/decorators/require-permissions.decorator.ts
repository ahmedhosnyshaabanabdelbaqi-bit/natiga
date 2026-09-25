import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiErrorResponses } from '../../../common/swagger/api-responses';
import { ApiAccessToken } from '../../auth/decorators/api-access-token.decorator';
import { PermissionsGuard } from '../guards/permissions.guard';
import { PERMISSIONS_KEY, type PermissionRequirement } from './permissions.metadata';

export { PERMISSIONS_KEY, type PermissionRequirement } from './permissions.metadata';

function requirement(req: PermissionRequirement) {
  return applyDecorators(
    SetMetadata(PERMISSIONS_KEY, req),
    UseGuards(PermissionsGuard),
    ApiAccessToken(),
    ApiErrorResponses(401, 403),
  );
}

/**
 * Requires the caller to hold EVERY listed permission (e.g.
 * `@RequirePermissions('articles.publish')`). Works on controllers and
 * handlers; when both carry requirements, both must be met. The caller must
 * be authenticated (401 otherwise); missing permissions → 403 FORBIDDEN.
 *
 * Every route under /api/v1/admin MUST declare a requirement — the global
 * auth guard rejects admin routes without one (ADMIN_ROUTE_WITHOUT_PERMISSION).
 */
export const RequirePermissions = (...permissions: string[]) =>
  requirement({ permissions, mode: 'all' });

/** Requires AT LEAST ONE of the listed permissions. */
export const RequireAnyPermission = (...permissions: string[]) =>
  requirement({ permissions, mode: 'any' });
