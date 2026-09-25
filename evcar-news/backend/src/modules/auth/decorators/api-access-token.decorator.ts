import { ApiBearerAuth } from '@nestjs/swagger';

/** Name of the bearer security scheme registered in src/bootstrap/swagger.ts. */
export const OPENAPI_BEARER_SCHEME = 'access-token';

/** OpenAPI: the operation needs `Authorization: Bearer <access token>`. */
export const ApiAccessToken = () => ApiBearerAuth(OPENAPI_BEARER_SCHEME);
