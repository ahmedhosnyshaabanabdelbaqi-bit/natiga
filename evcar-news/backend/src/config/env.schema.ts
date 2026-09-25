/**
 * Declarative list of every environment variable the backend reads.
 *
 * - `.env.example` at the repository root documents exactly these keys
 *   (enforced by src/config/env.schema.spec.ts).
 * - Values are validated per environment (development / test / production)
 *   by `parseEnv()` in env.validation.ts; secrets are never logged.
 * - Adding a variable: add it here, map it in configuration.ts, document it
 *   in /.env.example.
 */
export const NODE_ENVS = ['development', 'test', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

export type EnvVarType = 'string' | 'int' | 'number' | 'bool' | 'url' | 'enum' | 'list';

export interface EnvVarSpec {
  key: string;
  type: EnvVarType;
  description: string;
  /** Default value (string form) used when the variable is unset or empty. */
  default?: string | Partial<Record<NodeEnv | 'all', string>>;
  /** Environments in which the variable must be provided explicitly. */
  requiredIn?: NodeEnv[];
  /** Secret values are redacted from logs/errors and must not be committed. */
  secret?: boolean;
  enumValues?: readonly string[];
  min?: number;
  max?: number;
  /** For url type: allowed protocols (default http/https). */
  protocols?: readonly string[];
  /** Minimum length for strings (e.g. secrets in production). */
  minLengthIn?: Partial<Record<NodeEnv, number>>;
}

const PROD: NodeEnv[] = ['production'];

export const ENV_SCHEMA: readonly EnvVarSpec[] = [
  // --- application -----------------------------------------------------------
  {
    key: 'NODE_ENV',
    type: 'enum',
    enumValues: NODE_ENVS,
    default: 'development',
    description: 'Runtime environment.',
  },
  { key: 'PORT', type: 'int', min: 1, max: 65535, default: '3000', description: 'HTTP port.' },
  { key: 'HOST', type: 'string', default: '0.0.0.0', description: 'HTTP bind address.' },
  {
    key: 'APP_PUBLIC_BASE_URL',
    type: 'url',
    default: { all: 'http://localhost:3000' },
    requiredIn: PROD,
    description: 'Public URL of this API (used to build absolute links, e.g. local media URLs).',
  },
  {
    key: 'SHARE_BASE_URL',
    type: 'url',
    default: 'https://evcar.news',
    description: 'Default canonical base URL for share links (overridable in app settings).',
  },
  {
    key: 'ADMIN_BASE_URL',
    type: 'url',
    default: { all: 'http://localhost:5173' },
    requiredIn: PROD,
    description: 'Admin panel URL (used in e-mails such as the owner password-setup link).',
  },
  {
    key: 'TRUST_PROXY',
    type: 'string',
    default: 'false',
    description:
      'Express "trust proxy" setting: false, a hop count or a comma list of proxy subnets. MUST be set when the API runs behind nginx / the Vite dev proxy / a load balancer (e.g. 1), otherwise every client shares the proxy IP for rate limits and login lockouts. "true" (trust any X-Forwarded-For, spoofable) is refused in production.',
  },
  {
    key: 'CORS_ORIGINS',
    type: 'list',
    default: { development: 'http://localhost:5173', test: '', production: '' },
    description: 'Comma-separated browser origins allowed by CORS (admin panel). Empty = none.',
  },
  {
    key: 'SWAGGER_ENABLED',
    type: 'bool',
    default: { development: 'true', test: 'true', production: 'false' },
    description: 'Serve Swagger UI at /api/docs and JSON at /api/docs-json.',
  },
  {
    key: 'DEFAULT_LANGUAGE',
    type: 'enum',
    enumValues: ['ar', 'en'],
    default: 'ar',
    description: 'Fallback content language when neither ?lang nor Accept-Language match.',
  },
  {
    key: 'DEFAULT_MARKET',
    type: 'string',
    default: 'EG',
    description:
      'Fallback market code when app_settings "defaults.defaultMarket" is not set (e.g. before seeding).',
  },

  // --- logging ---------------------------------------------------------------
  {
    key: 'LOG_LEVEL',
    type: 'enum',
    enumValues: ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'],
    default: { development: 'debug', test: 'silent', production: 'info' },
    description: 'pino log level.',
  },
  {
    key: 'LOG_PRETTY',
    type: 'bool',
    default: { development: 'true', test: 'false', production: 'false' },
    description: 'Human-readable logs (requires the pino-pretty dev dependency).',
  },

  // --- database / redis ------------------------------------------------------
  {
    key: 'DATABASE_URL',
    type: 'url',
    protocols: ['postgresql:', 'postgres:'],
    requiredIn: ['development', 'test', 'production'],
    secret: true,
    description: 'PostgreSQL (PostGIS) connection string.',
  },
  {
    key: 'DATABASE_POOL_MAX',
    type: 'int',
    min: 1,
    max: 200,
    default: { all: '10', test: '5' },
    description: 'Max connections in the pg pool used by Prisma.',
  },
  {
    key: 'DATABASE_STATEMENT_TIMEOUT_MS',
    type: 'int',
    min: 0,
    default: '30000',
    description: 'Per-statement timeout (0 = none).',
  },
  {
    key: 'REDIS_URL',
    type: 'url',
    protocols: ['redis:', 'rediss:'],
    default: { development: 'redis://localhost:6379', test: 'redis://localhost:6379' },
    requiredIn: PROD,
    secret: true,
    description: 'Redis connection string (BullMQ, rate limiting, caches).',
  },
  {
    key: 'REDIS_KEY_PREFIX',
    type: 'string',
    default: 'evcar:',
    description: 'Prefix for all Redis keys written by the app (not BullMQ).',
  },

  // --- auth ------------------------------------------------------------------
  {
    key: 'JWT_ACCESS_SECRET',
    type: 'string',
    secret: true,
    requiredIn: PROD,
    minLengthIn: { production: 32 },
    description:
      'HMAC secret for access tokens. Required in production (>= 32 chars). In dev/test a random ephemeral secret is generated when unset.',
  },
  {
    key: 'JWT_ACCESS_TTL_SECONDS',
    type: 'int',
    min: 60,
    max: 86400,
    default: '900',
    description: 'Access token lifetime (default 15 minutes).',
  },
  {
    key: 'JWT_REFRESH_TTL_DAYS',
    type: 'int',
    min: 1,
    max: 365,
    default: '30',
    description:
      'Refresh token lifetime in days (sliding: every refresh extends it, up to JWT_SESSION_MAX_AGE_DAYS).',
  },
  {
    key: 'JWT_SESSION_MAX_AGE_DAYS',
    type: 'int',
    min: 1,
    max: 3650,
    default: '90',
    description:
      'Absolute maximum age of a login session in days, counted from sign-in; refreshing never extends a session beyond it.',
  },
  {
    key: 'AUTH_REFRESH_REUSE_GRACE_SECONDS',
    type: 'int',
    min: 0,
    max: 300,
    default: '60',
    description:
      'Seconds after a rotation during which the previous refresh token is still accepted (returns the same new token) so a lost response or a concurrent refresh does not sign the device out. 0 = strict.',
  },
  {
    key: 'AUTH_UNIFORM_RESPONSE_MS',
    type: 'int',
    min: 0,
    max: 5000,
    default: { all: '400', test: '0' },
    description:
      'Minimum duration of register / resend-verification / forgot-password responses, so their timing does not reveal whether an address is registered. 0 = off.',
  },
  { key: 'JWT_ISSUER', type: 'string', default: 'evcar.news', description: 'JWT "iss" claim.' },
  { key: 'JWT_AUDIENCE', type: 'string', default: 'evcar-api', description: 'JWT "aud" claim.' },
  {
    key: 'AUTH_COOKIE_SECURE',
    type: 'bool',
    default: { development: 'false', test: 'false', production: 'true' },
    description: 'Set the Secure flag on the evcar_rt refresh cookie (web clients).',
  },
  {
    key: 'EMAIL_TOKEN_TTL_MINUTES',
    type: 'int',
    min: 5,
    default: '1440',
    description: 'Lifetime of e-mail verification tokens.',
  },
  {
    key: 'PASSWORD_RESET_TTL_MINUTES',
    type: 'int',
    min: 5,
    default: '60',
    description: 'Lifetime of password reset / setup tokens.',
  },
  {
    key: 'GOOGLE_OAUTH_CLIENT_IDS',
    type: 'list',
    default: '',
    description:
      'Comma-separated Google OAuth client IDs accepted as ID-token audience. Empty = Google sign-in not configured (503).',
  },
  {
    key: 'APPLE_OAUTH_CLIENT_IDS',
    type: 'list',
    default: '',
    description:
      'Comma-separated Apple bundle/service IDs accepted as audience. Empty = Apple sign-in not configured (503).',
  },
  {
    key: 'IP_HASH_SALT',
    type: 'string',
    secret: true,
    requiredIn: PROD,
    minLengthIn: { production: 16 },
    description: 'Salt for hashing reporter IPs (abuse protection). Random in dev/test when unset.',
  },

  // --- rate limiting -----------------------------------------------------------
  {
    key: 'RATE_LIMIT_STORAGE',
    type: 'enum',
    enumValues: ['redis', 'memory'],
    default: { all: 'redis', test: 'memory' },
    description: 'Where rate-limit counters are kept (use redis with >1 instance).',
  },
  {
    key: 'RATE_LIMIT_DEFAULT_PER_MINUTE',
    type: 'int',
    min: 1,
    default: '300',
    description: 'Default per-IP request budget per minute for every route.',
  },
  {
    key: 'RATE_LIMIT_MULTIPLIER',
    type: 'number',
    min: 0.01,
    default: { all: '1', test: '1000' },
    description:
      'Multiplies every limit (tests use a large value; a specific test can set 1 to assert 429s).',
  },

  // --- storage ---------------------------------------------------------------
  {
    key: 'STORAGE_DRIVER',
    type: 'enum',
    enumValues: ['local', 's3'],
    default: 'local',
    description: 'Media storage driver.',
  },
  {
    key: 'STORAGE_LOCAL_ROOT',
    type: 'string',
    default: { all: './storage', test: './storage/test' },
    description: 'Root directory for the local driver.',
  },
  {
    key: 'STORAGE_PUBLIC_BASE_URL',
    type: 'string',
    default: '',
    description:
      'Public base URL for stored files (CDN or S3 website). Empty = served by this API under /media (local driver).',
  },
  {
    key: 'S3_ENDPOINT',
    type: 'string',
    default: '',
    description: 'S3-compatible endpoint (e.g. http://minio:9000). Empty = AWS.',
  },
  { key: 'S3_REGION', type: 'string', default: 'us-east-1', description: 'S3 region.' },
  { key: 'S3_BUCKET', type: 'string', default: '', description: 'S3 bucket for media.' },
  {
    key: 'S3_ACCESS_KEY_ID',
    type: 'string',
    default: '',
    secret: true,
    description: 'S3 access key.',
  },
  {
    key: 'S3_SECRET_ACCESS_KEY',
    type: 'string',
    default: '',
    secret: true,
    description: 'S3 secret key.',
  },
  {
    key: 'S3_FORCE_PATH_STYLE',
    type: 'bool',
    default: 'true',
    description: 'Use path-style URLs (required by MinIO).',
  },
  {
    key: 'UPLOAD_MAX_BYTES',
    type: 'int',
    min: 1,
    default: '1073741824',
    description: 'Max size of a single uploaded file (default 1 GiB).',
  },
  {
    key: 'UPLOAD_CHUNK_MAX_BYTES',
    type: 'int',
    min: 1024,
    default: '16777216',
    description: 'Max size of one chunk of a resumable upload (default 16 MiB).',
  },
  {
    key: 'UPLOAD_SESSION_TTL_HOURS',
    type: 'int',
    min: 1,
    default: '24',
    description: 'Resumable upload sessions expire after this many hours.',
  },

  // --- mail ------------------------------------------------------------------
  {
    key: 'MAIL_DRIVER',
    type: 'enum',
    enumValues: ['console', 'smtp'],
    default: 'console',
    description: 'console = log e-mails (dev); smtp = send via SMTP.',
  },
  {
    key: 'MAIL_FROM',
    type: 'string',
    default: 'EV Car News <no-reply@evcar.news>',
    description: 'From header.',
  },
  {
    key: 'SMTP_HOST',
    type: 'string',
    default: '',
    description: 'SMTP host (e.g. mailpit in compose).',
  },
  { key: 'SMTP_PORT', type: 'int', min: 1, max: 65535, default: '587', description: 'SMTP port.' },
  {
    key: 'SMTP_SECURE',
    type: 'bool',
    default: 'false',
    description: 'Use implicit TLS (port 465).',
  },
  { key: 'SMTP_USER', type: 'string', default: '', description: 'SMTP username.' },
  {
    key: 'SMTP_PASSWORD',
    type: 'string',
    default: '',
    secret: true,
    description: 'SMTP password.',
  },

  // --- outbound fetch (SSRF-safe) ----------------------------------------------
  {
    key: 'OUTBOUND_USER_AGENT',
    type: 'string',
    default: 'EVCarNewsBot/1.0 (+https://evcar.news)',
    description: 'User-Agent for server-side fetches (RSS, providers).',
  },
  {
    key: 'SAFE_FETCH_TIMEOUT_MS',
    type: 'int',
    min: 100,
    default: '10000',
    description: 'Total time limit for one server-side fetch (incl. redirects).',
  },
  {
    key: 'SAFE_FETCH_MAX_BYTES',
    type: 'int',
    min: 1024,
    default: '5242880',
    description: 'Max response body size for server-side fetches (default 5 MiB).',
  },
  {
    key: 'SAFE_FETCH_MAX_REDIRECTS',
    type: 'int',
    min: 0,
    max: 10,
    default: '5',
    description: 'Max redirects followed (each hop is re-validated).',
  },

  // --- integrations (all optional; missing = "not configured") ---------------------
  {
    key: 'OCM_API_KEY',
    type: 'string',
    default: '',
    secret: true,
    description: 'Open Charge Map API key.',
  },
  {
    key: 'OCM_BASE_URL',
    type: 'url',
    default: 'https://api.openchargemap.io/v3',
    description: 'Open Charge Map API base URL.',
  },
  {
    key: 'ROUTING_PROVIDER',
    type: 'enum',
    enumValues: ['none', 'osrm', 'openrouteservice', 'google'],
    default: 'none',
    description: 'Routing provider for the trip planner (none = planner hidden).',
  },
  { key: 'OSRM_BASE_URL', type: 'string', default: '', description: 'OSRM server URL (https).' },
  {
    key: 'ORS_API_KEY',
    type: 'string',
    default: '',
    secret: true,
    description: 'OpenRouteService API key.',
  },
  {
    key: 'GOOGLE_ROUTES_API_KEY',
    type: 'string',
    default: '',
    secret: true,
    description: 'Google Routes API key (server key, never shipped in the app).',
  },
  {
    key: 'GEOCODING_BASE_URL',
    type: 'string',
    default: '',
    description: 'Nominatim-compatible geocoder URL (optional).',
  },
  {
    key: 'GEOCODING_EMAIL',
    type: 'string',
    default: '',
    description: 'Contact e-mail sent to the geocoder per its usage policy.',
  },
  {
    key: 'MAP_TILE_URL_TEMPLATE',
    type: 'string',
    default: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    description: 'Default map tile URL template (overridable in settings).',
  },
  {
    key: 'MAP_ATTRIBUTION',
    type: 'string',
    default: '© OpenStreetMap contributors',
    description: 'Attribution text shown with map tiles.',
  },
  {
    key: 'MAP_MAX_ZOOM',
    type: 'int',
    min: 1,
    max: 22,
    default: '19',
    description: 'Max zoom for the tile provider.',
  },
  {
    key: 'FCM_PROJECT_ID',
    type: 'string',
    default: '',
    description: 'Firebase project id for FCM HTTP v1.',
  },
  {
    key: 'FCM_SERVICE_ACCOUNT_JSON',
    type: 'string',
    default: '',
    secret: true,
    description: 'FCM service-account JSON (inline, base64, or a file path).',
  },
  { key: 'APNS_KEY_ID', type: 'string', default: '', description: 'APNs auth key id.' },
  { key: 'APNS_TEAM_ID', type: 'string', default: '', description: 'Apple developer team id.' },
  {
    key: 'APNS_BUNDLE_ID',
    type: 'string',
    default: 'news.evcar.app',
    description: 'iOS bundle id (APNs topic).',
  },
  {
    key: 'APNS_PRIVATE_KEY',
    type: 'string',
    default: '',
    secret: true,
    description: 'APNs .p8 key (inline PEM or file path).',
  },
  {
    key: 'APNS_PRODUCTION',
    type: 'bool',
    default: 'false',
    description: 'Use the production APNs endpoint.',
  },
  {
    key: 'ASSISTANT_PROVIDER',
    type: 'enum',
    enumValues: ['none', 'openai_compatible', 'anthropic'],
    default: 'none',
    description: 'Optional LLM for the assistant (answers only from DB content). none = disabled.',
  },
  { key: 'ASSISTANT_BASE_URL', type: 'string', default: '', description: 'LLM API base URL.' },
  {
    key: 'ASSISTANT_API_KEY',
    type: 'string',
    default: '',
    secret: true,
    description: 'LLM API key.',
  },
  { key: 'ASSISTANT_MODEL', type: 'string', default: '', description: 'LLM model id.' },

  // --- jobs ------------------------------------------------------------------
  {
    key: 'JOBS_ENABLED',
    type: 'bool',
    default: { all: 'true', test: 'false' },
    description: 'Run BullMQ workers and schedulers in this process.',
  },
  {
    key: 'BULLMQ_PREFIX',
    type: 'string',
    default: 'evcar-bull',
    description: 'BullMQ key prefix (isolates environments sharing one Redis).',
  },
] as const;

export function envDefault(spec: EnvVarSpec, env: NodeEnv): string | undefined {
  if (spec.default === undefined) return undefined;
  if (typeof spec.default === 'string') return spec.default;
  return spec.default[env] ?? spec.default.all;
}
