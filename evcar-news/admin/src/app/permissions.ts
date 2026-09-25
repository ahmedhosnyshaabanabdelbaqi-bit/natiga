/**
 * Permission helpers. The server always enforces permissions
 * (`@RequirePermissions`); everything here is cosmetic (hiding nav items and
 * buttons the user cannot use).
 *
 * Permission strings follow `<resource>.<action>` (ARCHITECTURE §4.4). The
 * exact list is owned by the backend RBAC module — keep every string the admin
 * uses in `PERMISSIONS` below so aligning with the backend is a one-file change.
 *
 * Matching rules:
 * - a granted `*` matches everything (e.g. owner);
 * - a granted `articles.*` matches every `articles.<action>`;
 * - a required `articles.*` is satisfied by any granted `articles.<action>`.
 */

export const PERMISSIONS = {
  usersRead: 'users.read',
  usersManage: 'users.manage',
  /** Grant/remove `owner`/`admin` and act on admins (owner-only by default). */
  usersManageAdmins: 'users.manage_admins',
  /** Suspend / re-activate accounts (PATCH /admin/users/:id/status). */
  usersBlock: 'users.block',
  rolesRead: 'roles.read',
  /** Edit a role's permission set (the server also requires the owner role). */
  rolesManage: 'roles.manage',
  auditRead: 'audit.read',
  settingsRead: 'settings.read',
  settingsWrite: 'settings.write',
  /** Markets and currencies (reading also works with settings.read). */
  marketsWrite: 'markets.write',
  /** UI/server string overrides (reading also works with settings.read). */
  translationsWrite: 'translations.write',
  integrationsRead: 'integrations.read',
  /** Run live integration checks (or settings.write). */
  integrationsWrite: 'integrations.write',
  systemRead: 'system.read',
  systemJobs: 'system.jobs',
  importsRead: 'imports.read',
} as const;

export interface PermissionRequirement {
  /** Satisfied when at least one is granted. */
  anyOf?: readonly string[];
  /** Satisfied when all are granted. */
  allOf?: readonly string[];
}

export function hasPermission(granted: readonly string[], required: string): boolean {
  if (granted.includes('*') || granted.includes(required)) return true;
  const requiredIsPrefix = required.endsWith('.*');
  const requiredPrefix = requiredIsPrefix ? required.slice(0, -1) : null; // "articles."
  for (const g of granted) {
    if (g.endsWith('.*')) {
      const grantedPrefix = g.slice(0, -1);
      if (required.startsWith(grantedPrefix)) return true;
    }
    if (requiredPrefix && g.startsWith(requiredPrefix)) return true;
  }
  return false;
}

export function checkPermissions(
  granted: readonly string[] | null | undefined,
  requirement: PermissionRequirement | undefined,
): boolean {
  if (!requirement) return true;
  const list = granted ?? [];
  const { anyOf, allOf } = requirement;
  if (anyOf && anyOf.length > 0 && !anyOf.some((p) => hasPermission(list, p))) return false;
  if (allOf && allOf.length > 0 && !allOf.every((p) => hasPermission(list, p))) return false;
  return true;
}

/** Built-in roles (ARCHITECTURE §4.4). `user` is the public end-user role. */
export const BUILT_IN_ROLES = [
  'owner',
  'admin',
  'editor',
  'content_reviewer',
  'vehicle_data_manager',
  'station_manager',
  'community_moderator',
  'user',
] as const;

export function isStaff(roles: readonly string[] | null | undefined): boolean {
  return (roles ?? []).some((r) => r !== 'user');
}
