import type { AuthSession, AuthUser } from '@/api/types';

export function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'u-1',
    email: 'admin@example.test',
    displayName: 'Test Admin',
    emailVerified: true,
    locale: 'en',
    roles: ['admin'],
    // A realistic subset of the seeded `admin` role (backend src/cli/seed-data/rbac.ts):
    // everything except users.manage_admins.
    permissions: [
      'users.read',
      'users.manage',
      'users.block',
      'roles.read',
      'roles.manage',
      'audit.read',
      'settings.read',
      'settings.write',
      'markets.write',
      'translations.write',
      'integrations.read',
      'integrations.write',
      'system.read',
      'system.jobs',
      'imports.read',
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeSession(
  user: AuthUser = makeUser(),
  token = 'access-1',
): { data: AuthSession } {
  return { data: { accessToken: token, accessTokenExpiresIn: 900, user } };
}
