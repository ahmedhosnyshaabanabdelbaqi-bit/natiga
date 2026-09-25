import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { AppConfig } from '../../config/app-config';

/** Paths removed from every log line (tokens, passwords, cookies, keys). */
export const LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  ...[
    'password',
    'newPassword',
    'currentPassword',
    'passwordHash',
    'token',
    'refreshToken',
    'accessToken',
    'idToken',
    'identityToken',
    'secret',
    'apiKey',
    'authorization',
    'cookie',
  ].flatMap((k) => [k, `*.${k}`, `*.*.${k}`]),
];

const SENSITIVE_QUERY_PARAMS =
  /^(token|access_token|refresh_token|key|api_key|apikey|signature|sig|code|password|secret)$/i;

/** Redacts sensitive query parameter values from a request URL. */
export function redactUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const q = url.indexOf('?');
  if (q === -1) return url;
  const params = new URLSearchParams(url.slice(q + 1));
  let changed = false;
  for (const key of [...params.keys()]) {
    if (SENSITIVE_QUERY_PARAMS.test(key)) {
      params.set(key, '[REDACTED]');
      changed = true;
    }
  }
  return changed ? `${url.slice(0, q)}?${params.toString()}` : url;
}

export function buildLoggerParams(config: AppConfig): Params {
  return {
    pinoHttp: {
      level: config.logging.level,
      redact: { paths: LOG_REDACT_PATHS, censor: '[REDACTED]' },
      // Reuse the id assigned by requestIdMiddleware (runs before this).
      genReqId: (req: IncomingMessage) =>
        (req as IncomingMessage & { id?: string }).id ?? 'unknown',
      customProps: () => ({ env: config.env }),
      serializers: {
        req: (req: { id?: string; method?: string; url?: string; remoteAddress?: string }) => ({
          id: req.id,
          method: req.method,
          url: redactUrl(req.url),
        }),
        res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
      },
      autoLogging: {
        ignore: (req: IncomingMessage) => (req.url ?? '').startsWith('/api/v1/health'),
      },
      customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      ...(config.logging.pretty
        ? {
            transport: {
              target: 'pino-pretty',
              options: { singleLine: true, colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
            },
          }
        : {}),
    },
  };
}
