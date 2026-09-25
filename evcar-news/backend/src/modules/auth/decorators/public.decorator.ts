import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'evcar:auth:isPublic';

/**
 * Marks a route (or a whole controller) as reachable without logging in.
 *
 * Every route is protected by the global JwtAuthGuard unless it carries
 * `@Public()`. On public routes a valid `Authorization: Bearer` token is
 * still honoured (so `@CurrentUser()` returns the caller when signed in,
 * e.g. to personalize a public page); a missing, invalid or expired token
 * simply means "guest" and never causes a 401 there.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
