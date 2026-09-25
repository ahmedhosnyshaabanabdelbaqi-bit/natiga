import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest, AuthUser } from '../auth.types';

/**
 * Injects the authenticated caller (`AuthUser`) or one of its fields:
 *
 *   me(@CurrentUser() user: AuthUser)
 *   list(@CurrentUser('id') userId: string)
 *
 * Always defined on protected routes (the global guard rejects guests).
 * On `@Public()` routes it is `undefined` for guests — type the parameter
 * as `AuthUser | undefined` there.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) return undefined;
    return field ? user[field] : user;
  },
);
