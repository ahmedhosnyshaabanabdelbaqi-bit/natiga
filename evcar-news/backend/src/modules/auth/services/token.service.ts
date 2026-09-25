import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { errors as joseErrors, jwtVerify, SignJWT } from 'jose';
import { AppConfig } from '../../../config/app-config';
import type { AccessTokenClaims } from '../auth.types';

export class AccessTokenError extends Error {
  constructor(readonly reason: 'expired' | 'invalid') {
    super(`access token ${reason}`);
    this.name = 'AccessTokenError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Tokens that are expired but correctly signed are still accepted for logout for this long. */
const LOGOUT_GRACE_SECONDS = 365 * 24 * 3600;

/**
 * Access tokens: HS256 JWTs (JWT_ACCESS_SECRET) with iss/aud, `sub` = user
 * id, `sid` = user_sessions.id, lifetime JWT_ACCESS_TTL_SECONDS (15 min).
 * Refresh tokens are opaque random strings handled by SessionService.
 */
@Injectable()
export class TokenService {
  private readonly key: Uint8Array;

  constructor(private readonly config: AppConfig) {
    this.key = new TextEncoder().encode(config.auth.accessTokenSecret);
  }

  get accessTokenTtlSeconds(): number {
    return this.config.auth.accessTokenTtlSeconds;
  }

  async signAccessToken(userId: string, sessionId: string, now = new Date()): Promise<string> {
    const iat = Math.floor(now.getTime() / 1000);
    return new SignJWT({ sid: sessionId, typ: 'access' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer(this.config.auth.issuer)
      .setAudience(this.config.auth.audience)
      .setIssuedAt(iat)
      .setExpirationTime(iat + this.accessTokenTtlSeconds)
      .setJti(randomUUID())
      .sign(this.key);
  }

  /**
   * Verifies signature, algorithm, issuer, audience and expiry.
   * Throws AccessTokenError('expired' | 'invalid').
   * `allowExpired` only relaxes the expiry (used by logout).
   */
  async verifyAccessToken(
    token: string,
    opts: { allowExpired?: boolean } = {},
  ): Promise<AccessTokenClaims> {
    let payload: Record<string, unknown>;
    try {
      ({ payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        issuer: this.config.auth.issuer,
        audience: this.config.auth.audience,
        clockTolerance: opts.allowExpired ? LOGOUT_GRACE_SECONDS : 5,
        requiredClaims: ['sub', 'exp', 'iat'],
      }));
    } catch (err) {
      if (err instanceof joseErrors.JWTExpired) throw new AccessTokenError('expired');
      throw new AccessTokenError('invalid');
    }
    const { sub, sid, typ } = payload;
    if (
      typ !== 'access' ||
      typeof sub !== 'string' ||
      typeof sid !== 'string' ||
      !UUID.test(sub) ||
      !UUID.test(sid)
    ) {
      throw new AccessTokenError('invalid');
    }
    return { sub, sid, typ };
  }
}

/** Extracts the token from `Authorization: Bearer <token>` (undefined when absent/malformed). */
export function extractBearerToken(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return undefined;
  const match = /^Bearer\s+([A-Za-z0-9\-_.]+)\s*$/i.exec(value);
  return match?.[1];
}
