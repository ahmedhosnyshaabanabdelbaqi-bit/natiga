import { parseEnv, type ParsedEnv } from './env.validation';
import type { NodeEnv } from './env.schema';

export type SupportedLanguage = 'ar' | 'en';
export type StorageDriverName = 'local' | 's3';

/**
 * Typed, validated application configuration. Inject it anywhere:
 *
 *   constructor(private readonly config: AppConfig) {}
 *   this.config.auth.accessTokenTtlSeconds
 *
 * Built once from process.env (see AppConfigModule). Tests override it with
 * `AppConfig.fromEnv({...})` via `overrideProvider(AppConfig)`.
 */
export class AppConfig {
  readonly env: NodeEnv;
  readonly isProduction: boolean;
  readonly isTest: boolean;
  readonly isDevelopment: boolean;

  readonly http: {
    port: number;
    host: string;
    publicBaseUrl: string;
    shareBaseUrl: string;
    adminBaseUrl: string;
    trustProxy: boolean | number | string;
    corsOrigins: string[];
    swaggerEnabled: boolean;
  };

  readonly i18n: { defaultLanguage: SupportedLanguage; defaultMarket: string };

  readonly logging: { level: string; pretty: boolean };

  readonly database: { url: string; poolMax: number; statementTimeoutMs: number };

  readonly redis: { url: string; keyPrefix: string };

  readonly auth: {
    accessTokenSecret: string;
    accessTokenTtlSeconds: number;
    refreshTokenTtlDays: number;
    sessionMaxAgeDays: number;
    refreshReuseGraceSeconds: number;
    uniformResponseMs: number;
    issuer: string;
    audience: string;
    cookieSecure: boolean;
    emailTokenTtlMinutes: number;
    passwordResetTtlMinutes: number;
    googleClientIds: string[];
    appleClientIds: string[];
    ipHashSalt: string;
  };

  readonly rateLimit: {
    storage: 'redis' | 'memory';
    defaultPerMinute: number;
    multiplier: number;
  };

  readonly storage: {
    driver: StorageDriverName;
    localRoot: string;
    publicBaseUrl: string;
    s3: {
      endpoint: string;
      region: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
      forcePathStyle: boolean;
    };
    uploadMaxBytes: number;
    uploadChunkMaxBytes: number;
    uploadSessionTtlHours: number;
  };

  readonly mail: {
    driver: 'console' | 'smtp';
    from: string;
    smtp: { host: string; port: number; secure: boolean; user: string; password: string };
  };

  readonly fetch: {
    userAgent: string;
    timeoutMs: number;
    maxBytes: number;
    maxRedirects: number;
  };

  readonly integrations: {
    ocm: { apiKey: string; baseUrl: string };
    routing: {
      provider: 'none' | 'osrm' | 'openrouteservice' | 'google';
      osrmBaseUrl: string;
      orsApiKey: string;
      googleRoutesApiKey: string;
    };
    geocoding: { baseUrl: string; email: string };
    map: { tileUrlTemplate: string; attribution: string; maxZoom: number };
    push: {
      fcmProjectId: string;
      fcmServiceAccountJson: string;
      apnsKeyId: string;
      apnsTeamId: string;
      apnsBundleId: string;
      apnsPrivateKey: string;
      apnsProduction: boolean;
    };
    assistant: {
      provider: 'none' | 'openai_compatible' | 'anthropic';
      baseUrl: string;
      apiKey: string;
      model: string;
    };
  };

  readonly jobs: { enabled: boolean; bullPrefix: string };

  constructor(readonly values: Readonly<ParsedEnv>) {
    const s = (k: string) => (values[k] as string | undefined) ?? '';
    const n = (k: string) => values[k] as number;
    const b = (k: string) => values[k] === true;
    const l = (k: string) => (values[k] as string[] | undefined) ?? [];

    this.env = s('NODE_ENV') as NodeEnv;
    this.isProduction = this.env === 'production';
    this.isTest = this.env === 'test';
    this.isDevelopment = this.env === 'development';

    this.http = {
      port: n('PORT'),
      host: s('HOST'),
      publicBaseUrl: s('APP_PUBLIC_BASE_URL'),
      shareBaseUrl: s('SHARE_BASE_URL'),
      adminBaseUrl: s('ADMIN_BASE_URL'),
      trustProxy: parseTrustProxy(s('TRUST_PROXY')),
      corsOrigins: l('CORS_ORIGINS'),
      swaggerEnabled: b('SWAGGER_ENABLED'),
    };
    this.i18n = {
      defaultLanguage: s('DEFAULT_LANGUAGE') as SupportedLanguage,
      defaultMarket: s('DEFAULT_MARKET').toUpperCase(),
    };
    this.logging = { level: s('LOG_LEVEL'), pretty: b('LOG_PRETTY') };
    this.database = {
      url: s('DATABASE_URL'),
      poolMax: n('DATABASE_POOL_MAX'),
      statementTimeoutMs: n('DATABASE_STATEMENT_TIMEOUT_MS'),
    };
    this.redis = { url: s('REDIS_URL'), keyPrefix: s('REDIS_KEY_PREFIX') };
    this.auth = {
      accessTokenSecret: s('JWT_ACCESS_SECRET'),
      accessTokenTtlSeconds: n('JWT_ACCESS_TTL_SECONDS'),
      refreshTokenTtlDays: n('JWT_REFRESH_TTL_DAYS'),
      sessionMaxAgeDays: n('JWT_SESSION_MAX_AGE_DAYS'),
      refreshReuseGraceSeconds: n('AUTH_REFRESH_REUSE_GRACE_SECONDS'),
      uniformResponseMs: n('AUTH_UNIFORM_RESPONSE_MS'),
      issuer: s('JWT_ISSUER'),
      audience: s('JWT_AUDIENCE'),
      cookieSecure: b('AUTH_COOKIE_SECURE'),
      emailTokenTtlMinutes: n('EMAIL_TOKEN_TTL_MINUTES'),
      passwordResetTtlMinutes: n('PASSWORD_RESET_TTL_MINUTES'),
      googleClientIds: l('GOOGLE_OAUTH_CLIENT_IDS'),
      appleClientIds: l('APPLE_OAUTH_CLIENT_IDS'),
      ipHashSalt: s('IP_HASH_SALT'),
    };
    this.rateLimit = {
      storage: s('RATE_LIMIT_STORAGE') as 'redis' | 'memory',
      defaultPerMinute: n('RATE_LIMIT_DEFAULT_PER_MINUTE'),
      multiplier: n('RATE_LIMIT_MULTIPLIER'),
    };
    this.storage = {
      driver: s('STORAGE_DRIVER') as StorageDriverName,
      localRoot: s('STORAGE_LOCAL_ROOT'),
      publicBaseUrl: s('STORAGE_PUBLIC_BASE_URL').replace(/\/+$/, ''),
      s3: {
        endpoint: s('S3_ENDPOINT'),
        region: s('S3_REGION'),
        bucket: s('S3_BUCKET'),
        accessKeyId: s('S3_ACCESS_KEY_ID'),
        secretAccessKey: s('S3_SECRET_ACCESS_KEY'),
        forcePathStyle: b('S3_FORCE_PATH_STYLE'),
      },
      uploadMaxBytes: n('UPLOAD_MAX_BYTES'),
      uploadChunkMaxBytes: n('UPLOAD_CHUNK_MAX_BYTES'),
      uploadSessionTtlHours: n('UPLOAD_SESSION_TTL_HOURS'),
    };
    this.mail = {
      driver: s('MAIL_DRIVER') as 'console' | 'smtp',
      from: s('MAIL_FROM'),
      smtp: {
        host: s('SMTP_HOST'),
        port: n('SMTP_PORT'),
        secure: b('SMTP_SECURE'),
        user: s('SMTP_USER'),
        password: s('SMTP_PASSWORD'),
      },
    };
    this.fetch = {
      userAgent: s('OUTBOUND_USER_AGENT'),
      timeoutMs: n('SAFE_FETCH_TIMEOUT_MS'),
      maxBytes: n('SAFE_FETCH_MAX_BYTES'),
      maxRedirects: n('SAFE_FETCH_MAX_REDIRECTS'),
    };
    this.integrations = {
      ocm: { apiKey: s('OCM_API_KEY'), baseUrl: s('OCM_BASE_URL') },
      routing: {
        provider: s('ROUTING_PROVIDER') as AppConfig['integrations']['routing']['provider'],
        osrmBaseUrl: s('OSRM_BASE_URL'),
        orsApiKey: s('ORS_API_KEY'),
        googleRoutesApiKey: s('GOOGLE_ROUTES_API_KEY'),
      },
      geocoding: { baseUrl: s('GEOCODING_BASE_URL'), email: s('GEOCODING_EMAIL') },
      map: {
        tileUrlTemplate: s('MAP_TILE_URL_TEMPLATE'),
        attribution: s('MAP_ATTRIBUTION'),
        maxZoom: n('MAP_MAX_ZOOM'),
      },
      push: {
        fcmProjectId: s('FCM_PROJECT_ID'),
        fcmServiceAccountJson: s('FCM_SERVICE_ACCOUNT_JSON'),
        apnsKeyId: s('APNS_KEY_ID'),
        apnsTeamId: s('APNS_TEAM_ID'),
        apnsBundleId: s('APNS_BUNDLE_ID'),
        apnsPrivateKey: s('APNS_PRIVATE_KEY'),
        apnsProduction: b('APNS_PRODUCTION'),
      },
      assistant: {
        provider: s('ASSISTANT_PROVIDER') as AppConfig['integrations']['assistant']['provider'],
        baseUrl: s('ASSISTANT_BASE_URL'),
        apiKey: s('ASSISTANT_API_KEY'),
        model: s('ASSISTANT_MODEL'),
      },
    };
    this.jobs = { enabled: b('JOBS_ENABLED'), bullPrefix: s('BULLMQ_PREFIX') };
  }

  /** Validate + build from raw env vars (throws EnvValidationError). */
  static fromEnv(raw: NodeJS.ProcessEnv | Record<string, string | undefined>): AppConfig {
    return new AppConfig(Object.freeze(parseEnv(raw)));
  }
}

function parseTrustProxy(raw: string): boolean | number | string {
  const v = raw.trim().toLowerCase();
  if (v === '' || v === 'false') return false;
  if (v === 'true') return true;
  if (/^\d+$/.test(v)) return Number(v);
  return raw.trim();
}
