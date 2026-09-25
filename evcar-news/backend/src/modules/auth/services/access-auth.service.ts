import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RbacService } from '../../rbac/rbac.service';
import { authError, tokenExpired, unauthorized, AuthErrorCode } from '../auth.errors';
import type { AuthUser } from '../auth.types';
import { AccessTokenError, TokenService } from './token.service';

/**
 * Turns an access token into an AuthUser: verifies the JWT, then checks in
 * the database that its session is still active (not revoked/expired) and
 * the account is enabled, and loads current roles/permissions. Revoking a
 * session, disabling an account or changing roles therefore takes effect
 * on the very next request.
 */
@Injectable()
export class AccessAuthService {
  constructor(
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  /** Throws 401 TOKEN_EXPIRED, UNAUTHORIZED, SESSION_REVOKED or ACCOUNT_DISABLED. */
  async authenticate(token: string): Promise<AuthUser> {
    let claims;
    try {
      claims = await this.tokens.verifyAccessToken(token);
    } catch (err) {
      if (err instanceof AccessTokenError && err.reason === 'expired') throw tokenExpired();
      throw unauthorized();
    }

    const session = await this.prisma.userSession.findUnique({
      where: { id: claims.sid },
      select: {
        userId: true,
        revokedAt: true,
        expiresAt: true,
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            locale: true,
            status: true,
            emailVerifiedAt: true,
            roles: { select: { role: { select: { key: true } } } },
          },
        },
      },
    });
    if (!session || session.userId !== claims.sub) throw unauthorized();
    if (session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw authError(HttpStatus.UNAUTHORIZED, AuthErrorCode.SESSION_REVOKED);
    }
    const user = session.user;
    if (user.status !== 'active') {
      throw authError(HttpStatus.UNAUTHORIZED, AuthErrorCode.ACCOUNT_DISABLED);
    }
    const roles = user.roles.map((r) => r.role.key).sort();
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      locale: user.locale,
      emailVerified: user.emailVerifiedAt !== null,
      sessionId: claims.sid,
      roles,
      permissions: await this.rbac.permissionsForRoles(roles),
    };
  }
}
