export const PERMISSIONS_KEY = 'evcar:rbac:permissions';

export interface PermissionRequirement {
  permissions: string[];
  /** all = every permission is required; any = at least one. */
  mode: 'all' | 'any';
}
