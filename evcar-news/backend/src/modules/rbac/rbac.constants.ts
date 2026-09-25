/** Role keys with special meaning (the full list is seeded, see src/cli/seed-data/rbac.ts). */
export const OWNER_ROLE = 'owner';
export const ADMIN_ROLE = 'admin';
/** Role automatically given to every registered user. */
export const USER_ROLE = 'user';

/** Roles that only holders of `users.manage_admins` may grant or revoke. */
export const PRIVILEGED_ROLES: readonly string[] = [OWNER_ROLE, ADMIN_ROLE];

/** Permission keys used by the auth/users/rbac/audit modules themselves. */
export const P = {
  USERS_READ: 'users.read',
  USERS_MANAGE: 'users.manage',
  USERS_MANAGE_ADMINS: 'users.manage_admins',
  USERS_BLOCK: 'users.block',
  ROLES_READ: 'roles.read',
  ROLES_MANAGE: 'roles.manage',
  AUDIT_READ: 'audit.read',
} as const;
