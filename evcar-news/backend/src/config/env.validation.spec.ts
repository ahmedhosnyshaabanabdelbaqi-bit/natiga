import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { AppConfig } from './app-config';
import { ENV_SCHEMA } from './env.schema';
import { EnvValidationError, parseEnv } from './env.validation';

const DB = 'postgresql://evcar:pw@localhost:5432/evcar_dev';

describe('parseEnv', () => {
  it('applies per-environment defaults', () => {
    const dev = parseEnv({ DATABASE_URL: DB });
    expect(dev).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'debug',
      SWAGGER_ENABLED: true,
      CORS_ORIGINS: ['http://localhost:5173'],
    });
    const test = parseEnv({ NODE_ENV: 'test', DATABASE_URL: DB });
    expect(test).toMatchObject({
      LOG_LEVEL: 'silent',
      RATE_LIMIT_STORAGE: 'memory',
      JOBS_ENABLED: false,
      CORS_ORIGINS: [],
    });
  });

  it('coerces types and trims trailing slashes of URLs', () => {
    const env = parseEnv({
      DATABASE_URL: DB,
      PORT: '8080',
      SWAGGER_ENABLED: 'no',
      CORS_ORIGINS: 'https://a.test, https://b.test',
      ADMIN_BASE_URL: 'https://admin.evcar.news/',
    });
    expect(env).toMatchObject({
      PORT: 8080,
      SWAGGER_ENABLED: false,
      CORS_ORIGINS: ['https://a.test', 'https://b.test'],
      ADMIN_BASE_URL: 'https://admin.evcar.news',
    });
  });

  it('generates ephemeral secrets outside production only', () => {
    const a = parseEnv({ DATABASE_URL: DB });
    expect(typeof a.JWT_ACCESS_SECRET).toBe('string');
    expect((a.JWT_ACCESS_SECRET as string).length).toBeGreaterThanOrEqual(32);
    expect(() => parseEnv({ NODE_ENV: 'production', DATABASE_URL: DB })).toThrow(
      /JWT_ACCESS_SECRET is required in production/,
    );
  });

  it('lists every problem at once', () => {
    try {
      parseEnv({
        NODE_ENV: 'development',
        DATABASE_URL: 'mysql://x',
        PORT: 'abc',
        LOG_LEVEL: 'loud',
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      const problems = (err as EnvValidationError).problems.join('\n');
      expect(problems).toMatch(/DATABASE_URL must use one of/);
      expect(problems).toMatch(/PORT="abc" must be an integer/);
      expect(problems).toMatch(/LOG_LEVEL="loud" must be one of/);
    }
  });

  it('never echoes secret values in errors', () => {
    try {
      parseEnv({ DATABASE_URL: 'not a url with secret-pw' });
    } catch (err) {
      expect((err as Error).message).not.toContain('secret-pw');
    }
  });

  it('enforces production safety rules', () => {
    const base = {
      NODE_ENV: 'production',
      DATABASE_URL: DB,
      REDIS_URL: 'redis://redis:6379',
      APP_PUBLIC_BASE_URL: 'https://api.evcar.news',
      ADMIN_BASE_URL: 'https://admin.evcar.news',
      JWT_ACCESS_SECRET: 'x'.repeat(40),
      IP_HASH_SALT: 'y'.repeat(20),
    };
    expect(() => parseEnv(base)).toThrow(/MAIL_DRIVER=console is not allowed in production/);
    const ok = parseEnv({ ...base, MAIL_DRIVER: 'smtp', SMTP_HOST: 'smtp.example.com' });
    expect(ok).toMatchObject({
      AUTH_COOKIE_SECURE: true,
      SWAGGER_ENABLED: false,
      RATE_LIMIT_STORAGE: 'redis',
    });
    expect(() =>
      parseEnv({ ...base, MAIL_DRIVER: 'smtp', SMTP_HOST: 'h', JWT_ACCESS_SECRET: 'short' }),
    ).toThrow(/at least 32/);
    expect(() =>
      parseEnv({ ...base, MAIL_DRIVER: 'smtp', SMTP_HOST: 'h', RATE_LIMIT_MULTIPLIER: '100' }),
    ).toThrow(/MULTIPLIER/);
  });

  it('requires S3 credentials when the s3 driver is selected', () => {
    expect(() => parseEnv({ DATABASE_URL: DB, STORAGE_DRIVER: 's3' })).toThrow(
      /S3_BUCKET is required/,
    );
  });

  it('builds a typed AppConfig', () => {
    const cfg = AppConfig.fromEnv({ DATABASE_URL: DB, TRUST_PROXY: '1', DEFAULT_MARKET: 'sa' });
    expect(cfg.http.trustProxy).toBe(1);
    expect(cfg.i18n.defaultMarket).toBe('SA');
    expect(cfg.auth.accessTokenTtlSeconds).toBe(900);
    expect(cfg.isDevelopment).toBe(true);
  });
});

describe('.env.example', () => {
  const file = readFileSync(resolve(__dirname, '../../../.env.example'), 'utf8');
  const parsed = parse(file);

  it('documents exactly the variables of ENV_SCHEMA', () => {
    expect(Object.keys(parsed).sort()).toEqual(ENV_SCHEMA.map((s) => s.key).sort());
  });

  it('contains no secret values', () => {
    for (const spec of ENV_SCHEMA.filter(
      (s) => s.secret && s.key !== 'DATABASE_URL' && s.key !== 'REDIS_URL',
    )) {
      expect({ key: spec.key, value: parsed[spec.key] }).toEqual({ key: spec.key, value: '' });
    }
  });

  it('is valid for development as-is', () => {
    expect(() => parseEnv({ ...parsed })).not.toThrow();
  });
});
