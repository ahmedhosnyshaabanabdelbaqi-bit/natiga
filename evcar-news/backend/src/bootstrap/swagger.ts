import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { ErrorEnvelopeDto, PageMetaDto } from '../common/swagger/api-responses';
import { appVersion } from '../common/utils/app-version';

export const SWAGGER_UI_PATH = 'api/docs';
export const SWAGGER_JSON_PATH = 'api/docs-json';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('EV Car News API')
    .setDescription(
      [
        'REST API of EV Car News (evcar.news). Conventions:',
        '- Prefix /api/v1; admin routes under /api/v1/admin (permission-guarded), personal routes under /api/v1/me.',
        '- Language: ?lang=ar|en overrides Accept-Language (default ar). Market: ?market=EG overrides X-Market.',
        '- Single resource: {"data": {...}}; lists: {"data": [...], "meta": {page, pageSize, total, totalPages}}.',
        '- Errors: {"error": {"code", "message" (localized), "details"?, "requestId"}}; validation → 422 VALIDATION_FAILED.',
        '- Money: {"amount": "decimal string", "currency": "EGP"}; missing values are null (never 0).',
      ].join('\n'),
    )
    .setVersion(appVersion())
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .addGlobalParameters({
      name: 'X-Request-Id',
      in: 'header',
      required: false,
      description: 'Optional client correlation id (echoed back).',
      schema: { type: 'string' },
    })
    .build();
  return SwaggerModule.createDocument(app, config, {
    extraModels: [ErrorEnvelopeDto, PageMetaDto],
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });
}

export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup(SWAGGER_UI_PATH, app, () => buildOpenApiDocument(app), {
    jsonDocumentUrl: SWAGGER_JSON_PATH,
    yamlDocumentUrl: 'api/docs-yaml',
    customSiteTitle: 'EV Car News API',
    swaggerOptions: { persistAuthorization: true },
  });
}
