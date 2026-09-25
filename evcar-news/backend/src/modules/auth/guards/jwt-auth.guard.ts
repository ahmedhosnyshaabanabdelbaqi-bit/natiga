import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestContext } from '../../../common/context/request-context';
import { PERMISSIONS_KEY } from '../../rbac/decorators/permissions.metadata';
import { authError, AuthErrorCode, unauthorized } from '../auth.errors';
import type { AuthenticatedRequest } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AccessAuthService } from '../services/access-auth.service';
import { extractBearerToken } from '../services/token.service';

export const ADMIN_PATH_PREFIX = '/api/v1/admin';

/**
 * True for /api/v1/admin and everything below it. Case-insensitive because
 * Express route matching is (so /API/V1/ADMIN/... reaches admin handlers too).
 */
export function isAdminPath(path: string): boolean {
  const p = path.toLowerCase();
  return p === ADMIN_PATH_PREFIX || p.startsWith(`${ADMIN_PATH_PREFIX}/`);
}

/** Matched route pattern (canonical) or, if unavailable, the request path. */
export function routePathOf(req: { route?: unknown; originalUrl?: string; url?: string }): string {
  const pattern = (req.route as { path?: unknown } | undefined)?.path;
  if (typeof pattern === 'string') return pattern;
  return (req.originalUrl ?? req.url ?? '').split('?')[0];
}

/**
 * Global authentication guard (registered as APP_GUARD by AuthModule).
 *
 * - Routes without @Public() require `Authorization: Bearer <access token>`:
 *   missing/invalid → 401 UNAUTHORIZED, expired → 401 TOKEN_EXPIRED,
 *   revoked session → 401 SESSION_REVOKED, disabled account → 401 ACCOUNT_DISABLED.
 * - @Public() routes accept guests; a valid token still sets req.user.
 * - Safety net: an /api/v1/admin route that declares no @RequirePermissions
 *   is denied (403 ADMIN_ROUTE_WITHOUT_PERMISSION) instead of being open
 *   to every signed-in user.
 * The authenticated user is exposed as req.user and in RequestContext
 * (userId/userLabel, used by audit logging).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets);
    const token = extractBearerToken(req.headers.authorization);

    if (isPublic) {
      if (token) {
        try {
          this.attach(req, await this.access.authenticate(token));
        } catch {
          // Invalid/expired tokens on public routes mean "guest".
        }
      }
      return true;
    }

    if (!token) throw unauthorized();
    this.attach(req, await this.access.authenticate(token));

    const path = routePathOf(req);
    if (isAdminPath(path) || isAdminPath((req.originalUrl ?? '').split('?')[0])) {
      const declared = this.reflector.getAllAndOverride<unknown>(PERMISSIONS_KEY, targets);
      if (!declared) {
        this.logger.error(
          `Admin route ${req.method} ${path} has no @RequirePermissions — denied by default`,
        );
        throw authError(HttpStatus.FORBIDDEN, AuthErrorCode.ADMIN_ROUTE_WITHOUT_PERMISSION);
      }
    }
    return true;
  }

  private attach(req: AuthenticatedRequest, user: AuthenticatedRequest['user']): void {
    req.user = user;
    if (user) RequestContext.set({ userId: user.id, userLabel: user.email });
  }
}
