/**
 * Public API of the auth module for other modules:
 *
 *   import { Public, CurrentUser, type AuthUser } from '../auth';
 *
 * Every route requires a valid access token unless marked @Public().
 */
export { Public, IS_PUBLIC_KEY } from './decorators/public.decorator';
export { CurrentUser } from './decorators/current-user.decorator';
export { ApiAccessToken, OPENAPI_BEARER_SCHEME } from './decorators/api-access-token.decorator';
export type { AuthUser, AuthenticatedRequest } from './auth.types';
