import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import type { AppConfig } from '../config/app-config';
import { bodyParserErrorHandler } from '../common/filters/all-exceptions.filter';
import { requestIdMiddleware } from '../common/middleware/request-id.middleware';
import { SHARE_PUBLIC_ROUTES } from '../modules/share/share.routes';
import { setupSwagger, SWAGGER_UI_PATH } from './swagger';

export const API_PREFIX = 'api/v1';
export const JSON_BODY_LIMIT = '5mb';

/** Local-driver public files are served from `${STORAGE_LOCAL_ROOT}/public` at /media. */
export const LOCAL_MEDIA_ROUTE = '/media';
export const LOCAL_PUBLIC_DIR = 'public';

export const CORS_ALLOWED_HEADERS = [
  'Authorization',
  'Content-Type',
  'Accept',
  'Accept-Language',
  'X-Market',
  'X-Client-Type',
  'X-Device-Id',
  'X-Request-Id',
  'If-None-Match',
  'If-Match',
  'Upload-Offset',
  'Upload-Length',
  'Content-Range',
];
export const CORS_EXPOSED_HEADERS = [
  'X-Request-Id',
  'ETag',
  'Content-Language',
  'X-Market',
  'Retry-After',
  'Location',
  'Upload-Offset',
  'X-RateLimit-Limit',
  'X-RateLimit-Remaining',
  'X-RateLimit-Reset',
];

/** Applies only the global prefix (used by the OpenAPI export in preview mode). */
export function applyGlobalPrefix(app: NestExpressApplication): void {
  app.setGlobalPrefix(API_PREFIX, { exclude: SHARE_PUBLIC_ROUTES });
}

/** Options every Nest application instance must be created with. */
export const NEST_APP_OPTIONS = { bodyParser: false, bufferLogs: true } as const;

/**
 * Shared HTTP setup for main.ts and e2e tests (filters/pipes/guards are
 * registered as providers in AppModule, so they apply everywhere).
 * Create the app with NEST_APP_OPTIONS (body parsing is configured here).
 */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  app.set('trust proxy', config.http.trustProxy);
  app.disable('x-powered-by');
  app.set('etag', 'strong');

  // Must run before body parsing so even parse errors carry a request id.
  app.use(requestIdMiddleware);

  const docsHelmet = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
    },
  });
  const apiHelmet = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    // Media and API responses are consumed cross-origin by the admin and apps.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    strictTransportSecurity: config.isProduction
      ? { maxAge: 31536000, includeSubDomains: true }
      : false,
  });
  app.use((req: Request, res: Response, next: NextFunction) =>
    req.path.startsWith(`/${SWAGGER_UI_PATH}`)
      ? docsHelmet(req, res, next)
      : apiHelmet(req, res, next),
  );

  app.use(cookieParser());
  app.use(compression());
  // Body parsers are registered here (the app must be created with
  // `bodyParser: false`) so parse errors get the error envelope.
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ limit: '1mb', extended: true }));
  // Resumable upload chunks (application/octet-stream, tus-style offsets).
  app.use(
    express.raw({
      limit: config.storage.uploadChunkMaxBytes,
      type: ['application/octet-stream', 'application/offset+octet-stream'],
    }),
  );
  app.use(bodyParserErrorHandler);

  const allowed = new Set(config.http.corsOrigins);
  app.enableCors({
    origin: (origin, cb) => cb(null, !origin || allowed.has(origin)),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: CORS_ALLOWED_HEADERS,
    exposedHeaders: CORS_EXPOSED_HEADERS,
    maxAge: 600,
  });

  applyGlobalPrefix(app);

  if (config.storage.driver === 'local' && !config.storage.publicBaseUrl) {
    const publicDir = resolve(config.storage.localRoot, LOCAL_PUBLIC_DIR);
    mkdirSync(publicDir, { recursive: true });
    app.use(
      LOCAL_MEDIA_ROUTE,
      express.static(publicDir, {
        dotfiles: 'deny',
        index: false,
        fallthrough: true,
        immutable: true,
        maxAge: '7d',
      }),
    );
  }

  if (config.http.swaggerEnabled) setupSwagger(app);

  app.enableShutdownHooks();
}
