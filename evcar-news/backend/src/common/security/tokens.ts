import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Opaque random tokens (refresh tokens, e-mail verification / reset / setup
 * links, share ids). Only `hashToken(token)` is ever stored in the database
 * (user_sessions.refresh_token_hash, email_tokens.token_hash).
 */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** SHA-256 hex digest (64 chars) of a token. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Constant-time comparison of two hex digests. */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/** Keyed hash of an IP address (abuse throttling without storing raw IPs). */
export function hashIp(ip: string, salt: string): string {
  return createHmac('sha256', salt).update(ip).digest('hex');
}

const SHARE_ALPHABET = '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';

/** Short, unambiguous, URL-safe id (e.g. comparisons.share_id). ~5.8 bits/char. */
export function generateShortId(length = 10): string {
  const out: string[] = [];
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      // Rejection sampling keeps the distribution uniform.
      if (byte < SHARE_ALPHABET.length * Math.floor(256 / SHARE_ALPHABET.length)) {
        out.push(SHARE_ALPHABET[byte % SHARE_ALPHABET.length]);
        if (out.length === length) break;
      }
    }
  }
  return out.join('');
}
