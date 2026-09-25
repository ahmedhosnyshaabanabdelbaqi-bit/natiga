import type { Request } from 'express';

/**
 * The authenticated caller, attached to `req.user` by the global
 * JwtAuthGuard (see decorators/current-user.decorator.ts). Roles and
 * permissions are resolved from the database on every request (the
 * role → permission matrix is cached briefly by RbacService), so role
 * changes and revocations take effect without waiting for the access token
 * to expire.
 */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  locale: string;
  emailVerified: boolean;
  /** user_sessions.id of the session the access token belongs to. */
  sessionId: string;
  /** Role keys, e.g. ['user'], ['owner', 'user']. */
  roles: string[];
  /** Effective permission keys (owner = every permission). */
  permissions: string[];
}

export type AuthenticatedRequest = Request & { user?: AuthUser; id?: string };

/** Claims of our access tokens (HS256 JWT). */
export interface AccessTokenClaims {
  sub: string;
  sid: string;
  typ: 'access';
}
