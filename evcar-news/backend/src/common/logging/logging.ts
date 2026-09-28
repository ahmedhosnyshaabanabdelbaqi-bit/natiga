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

/**
 * Query parameters that carry a position (device location, map viewport, trip
 * origin/destination). REQUIREMENTS §19: no precise location is stored without
 * need, so logs keep them rounded to 2 decimals (≈ 1 km).
 */
const LOCATION_QUERY_PARAMS =
  /^(lat|lng|lon|latitude|longitude|bbox|near|point|origin|destination|\w+(Lat|Lng|Lon|Latitude|Longitude))$/i;

/** Path segments that are secrets (e.g. unpublished-article preview tokens). */
const SECRET_PATH_SEGMENTS: RegExp[] = [/(\/articles\/preview\/)[^/?#]+/i];

/** Rounds every number in a coordinate value (`30.0444`, `29.9,31.1,30.2,31.4`) to 2 decimals. */
function coarsen(value: string): string {
  return value.replace(/-?\d+(\.\d+)?/g, (n) => {
    const v = Number(n);
    return Number.isFinite(v) ? (Math.round(v * 100) / 100).toFixed(2) : '[REDACTED]';
  });
}

/**
 * Makes a request URL safe to log: secret query parameters and secret path
 * segments become `[REDACTED]`, coordinates are rounded to ≈ 1 km.
 */
export function redactUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const q = url.indexOf('?');
  let path = q === -1 ? url : url.slice(0, q);
  for (const re of SECRET_PATH_SEGMENTS) path = path.replace(re, '$1[REDACTED]');
  if (q === -1) return path;
  const params = new URLSearchParams(url.slice(q + 1));
  let changed = false;
  const out = new URLSearchParams();
  for (const [key, value] of params) {
    if (SENSITIVE_QUERY_PARAMS.test(key)) {
      out.append(key, '[REDACTED]');
      changed = true;
    } else if (LOCATION_QUERY_PARAMS.test(key)) {
      out.append(key, coarsen(value));
      changed = true;
    } else {
      out.append(key, value);
    }
  }
  return changed ? `${path}?${out.toString()}` : `${path}${url.slice(q)}`;
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
