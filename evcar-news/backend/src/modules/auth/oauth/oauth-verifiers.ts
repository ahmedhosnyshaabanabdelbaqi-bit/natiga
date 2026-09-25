import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import type {
  OAuthConfig,
  OAuthProviderConfig,
  OAuthProviderName,
} from '../../../providers/oauth/oauth-config';

export type { OAuthProviderName };

/** Identity proven by a verified provider ID token. */
export interface VerifiedIdentity {
  provider: OAuthProviderName;
  /** Stable provider user id (`sub`). */
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export class OAuthTokenInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthTokenInvalidError';
  }
}

export interface IdTokenVerifier {
  readonly provider: OAuthProviderName;
  /** False when the accepted client ids are not configured (→ 503). */
  isConfigured(): boolean;
  /** Throws OAuthTokenInvalidError for any invalid token. */
  verify(idToken: string): Promise<VerifiedIdentity>;
}

function claimBool(value: unknown): boolean {
  return value === true || value === 'true';
}

function claimString(value: unknown, max = 320): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

const MAX_ID_TOKEN_LENGTH = 8192;

/**
 * Verifies provider ID tokens (JWTs) against the provider's JWKS, issuers
 * and accepted client ids from OAUTH_CONFIG (platform providers module):
 * signature (RS256/ES256), `iss`, `aud`, `exp`/`iat` (30 s clock skew).
 * Keys are fetched from the fixed provider JWKS URL (cached by jose) unless
 * `keys` is given (tests / key pinning).
 */
export class JwksIdTokenVerifier implements IdTokenVerifier {
  private remoteKeys?: JWTVerifyGetKey;

  constructor(
    private readonly providerConfig: OAuthProviderConfig,
    private readonly keys?: JWTVerifyGetKey,
  ) {}

  get provider(): OAuthProviderName {
    return this.providerConfig.provider;
  }

  isConfigured(): boolean {
    return this.providerConfig.configured && this.providerConfig.clientIds.length > 0;
  }

  async verify(idToken: string): Promise<VerifiedIdentity> {
    if (!idToken || idToken.length > MAX_ID_TOKEN_LENGTH) {
      throw new OAuthTokenInvalidError('malformed token');
    }
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(idToken, this.keySource(), {
        issuer: this.providerConfig.issuers,
        audience: this.providerConfig.clientIds,
        algorithms: ['RS256', 'ES256'],
        clockTolerance: 30,
        requiredClaims: ['sub', 'exp', 'iat'],
      }));
    } catch (err) {
      throw new OAuthTokenInvalidError(
        err instanceof Error ? err.message.slice(0, 200) : 'verification failed',
      );
    }
    const subject = claimString(payload.sub, 255);
    if (!subject) throw new OAuthTokenInvalidError('missing subject');
    const email = claimString(payload.email)?.toLowerCase() ?? null;
    return {
      provider: this.provider,
      subject,
      email,
      emailVerified: email !== null && claimBool(payload.email_verified),
      name: claimString(payload.name, 100),
    };
  }

  private keySource(): JWTVerifyGetKey {
    if (this.keys) return this.keys;
    this.remoteKeys ??= createRemoteJWKSet(new URL(this.providerConfig.jwksUrl), {
      timeoutDuration: 5_000,
      cooldownDuration: 30_000,
      cacheMaxAge: 6 * 3600 * 1000,
    });
    return this.remoteKeys;
  }
}

/** Google Sign-In ID tokens (audience: GOOGLE_OAUTH_CLIENT_IDS). */
export class GoogleIdTokenVerifier extends JwksIdTokenVerifier {
  constructor(oauth: OAuthConfig, keys?: JWTVerifyGetKey) {
    super(oauth.google, keys);
  }
}

/** Sign in with Apple identity tokens (audience: APPLE_OAUTH_CLIENT_IDS). */
export class AppleIdTokenVerifier extends JwksIdTokenVerifier {
  constructor(oauth: OAuthConfig, keys?: JWTVerifyGetKey) {
    super(oauth.apple, keys);
  }
}
