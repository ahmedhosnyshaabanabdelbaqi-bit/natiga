import { randomBytes } from 'node:crypto';
import { ENV_SCHEMA, envDefault, NODE_ENVS, type EnvVarSpec, type NodeEnv } from './env.schema';

export type EnvValue = string | number | boolean | string[] | undefined;
export type ParsedEnv = Record<string, EnvValue>;

export class EnvValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid environment configuration:\n - ${problems.join('\n - ')}`);
    this.name = 'EnvValidationError';
  }
}

const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);
const FALSE_VALUES = new Set(['false', '0', 'no', 'off']);

function parseValue(
  spec: EnvVarSpec,
  raw: string,
  env: NodeEnv,
): { value?: EnvValue; error?: string } {
  const label = spec.secret ? `${spec.key} (secret)` : `${spec.key}="${raw}"`;
  switch (spec.type) {
    case 'string': {
      const min = spec.minLengthIn?.[env];
      if (min !== undefined && raw.length < min) {
        return { error: `${spec.key} must be at least ${min} characters in ${env}` };
      }
      return { value: raw };
    }
    case 'int':
    case 'number': {
      const n = Number(raw);
      if (!Number.isFinite(n) || (spec.type === 'int' && !Number.isInteger(n))) {
        return { error: `${label} must be ${spec.type === 'int' ? 'an integer' : 'a number'}` };
      }
      if (spec.min !== undefined && n < spec.min)
        return { error: `${label} must be >= ${spec.min}` };
      if (spec.max !== undefined && n > spec.max)
        return { error: `${label} must be <= ${spec.max}` };
      return { value: n };
    }
    case 'bool': {
      const v = raw.trim().toLowerCase();
      if (TRUE_VALUES.has(v)) return { value: true };
      if (FALSE_VALUES.has(v)) return { value: false };
      return { error: `${label} must be a boolean (true/false)` };
    }
    case 'enum': {
      if (!spec.enumValues?.includes(raw)) {
        return { error: `${label} must be one of: ${spec.enumValues?.join(', ')}` };
      }
      return { value: raw };
    }
    case 'list': {
      return {
        value: raw
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
      };
    }
    case 'url': {
      let url: URL;
      try {
        url = new URL(raw);
      } catch {
        return { error: `${label} must be a valid URL` };
      }
      const protocols = spec.protocols ?? ['http:', 'https:'];
      if (!protocols.includes(url.protocol)) {
        return { error: `${spec.key} must use one of: ${protocols.join(', ')}` };
      }
      return { value: raw.replace(/\/+$/, '') };
    }
    default:
      return { error: `${spec.key}: unsupported type` };
  }
}

/** Secrets that get an ephemeral random value outside production when unset. */
const EPHEMERAL_SECRETS = new Set(['JWT_ACCESS_SECRET', 'IP_HASH_SALT']);

/**
 * Validates and coerces raw environment variables according to ENV_SCHEMA.
 * Throws EnvValidationError listing every problem at once.
 */
export function parseEnv(raw: NodeJS.ProcessEnv | Record<string, string | undefined>): ParsedEnv {
  const envRaw = raw.NODE_ENV?.trim() || 'development';
  if (!(NODE_ENVS as readonly string[]).includes(envRaw)) {
    throw new EnvValidationError([`NODE_ENV must be one of: ${NODE_ENVS.join(', ')}`]);
  }
  const env = envRaw as NodeEnv;
  const problems: string[] = [];
  const result: ParsedEnv = {};

  for (const spec of ENV_SCHEMA) {
    const provided = raw[spec.key];
    const hasValue = provided !== undefined && provided.trim() !== '';
    if (!hasValue) {
      if (spec.requiredIn?.includes(env)) {
        problems.push(`${spec.key} is required in ${env}`);
        continue;
      }
      if (EPHEMERAL_SECRETS.has(spec.key)) {
        result[spec.key] = randomBytes(48).toString('base64url');
        continue;
      }
      const def = envDefault(spec, env);
      if (def === undefined) {
        result[spec.key] = undefined;
        continue;
      }
      if (def === '') {
        result[spec.key] = spec.type === 'list' ? [] : '';
        continue;
      }
      const parsed = parseValue(spec, def, env);
      if (parsed.error) problems.push(`default of ${parsed.error}`);
      else result[spec.key] = parsed.value;
      continue;
    }
    const parsed = parseValue(spec, provided.trim(), env);
    if (parsed.error) problems.push(parsed.error);
    else result[spec.key] = parsed.value;
  }

  // Cross-field rules.
  if (result.STORAGE_DRIVER === 's3') {
    for (const key of ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) {
      if (!result[key]) problems.push(`${key} is required when STORAGE_DRIVER=s3`);
    }
  }
  if (result.MAIL_DRIVER === 'smtp' && !result.SMTP_HOST) {
    problems.push('SMTP_HOST is required when MAIL_DRIVER=smtp');
  }
  if (env === 'production') {
    if (result.MAIL_DRIVER === 'console') {
      problems.push('MAIL_DRIVER=console is not allowed in production (configure SMTP)');
    }
    if (result.AUTH_COOKIE_SECURE === false) {
      problems.push('AUTH_COOKIE_SECURE must be true in production');
    }
    if (result.RATE_LIMIT_STORAGE === 'memory') {
      problems.push('RATE_LIMIT_STORAGE=memory is not allowed in production (use redis)');
    }
    if (typeof result.RATE_LIMIT_MULTIPLIER === 'number' && result.RATE_LIMIT_MULTIPLIER > 1) {
      problems.push('RATE_LIMIT_MULTIPLIER must be <= 1 in production');
    }
    if (
      typeof result.TRUST_PROXY === 'string' &&
      result.TRUST_PROXY.trim().toLowerCase() === 'true'
    ) {
      // "true" trusts the left-most X-Forwarded-For value, which any client can
      // set: rate limits, login lockouts and audit IPs would be spoofable.
      problems.push(
        'TRUST_PROXY=true is not allowed in production: use the number of proxy hops (e.g. 1) or the proxy subnets',
      );
    }
  }

  if (problems.length > 0) throw new EnvValidationError(problems);
  return result;
}

/** Keys whose values must never be printed. */
export const SECRET_ENV_KEYS: ReadonlySet<string> = new Set(
  ENV_SCHEMA.filter((s) => s.secret).map((s) => s.key),
);
