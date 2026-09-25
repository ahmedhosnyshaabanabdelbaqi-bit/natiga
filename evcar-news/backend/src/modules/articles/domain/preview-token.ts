import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

/**
 * Stateless, signed preview links for unpublished articles
 * (REQUIREMENTS §17 "معاينة قبل النشر"). Format:
 *   v1.<base64url(JSON {a: articleId, e: expiresAtSeconds})>.<base64url(HMAC-SHA256)>
 * The HMAC key is derived (HKDF) from the server secret with a dedicated
 * label, so a preview token can never be confused with an access token.
 */
export interface PreviewClaims {
  articleId: string;
  expiresAt: Date;
}

export type PreviewVerifyResult =
  | { ok: true; claims: PreviewClaims }
  | { ok: false; reason: 'PREVIEW_TOKEN_INVALID' | 'PREVIEW_TOKEN_EXPIRED' };

const VERSION = 'v1';

export function previewKey(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, 'evcar-news', 'article-preview-token-v1', 32));
}

function sign(key: Buffer, payload: string): string {
  return createHmac('sha256', key).update(`${VERSION}.${payload}`).digest('base64url');
}

export function createPreviewToken(key: Buffer, claims: PreviewClaims): string {
  const payload = Buffer.from(
    JSON.stringify({ a: claims.articleId, e: Math.floor(claims.expiresAt.getTime() / 1000) }),
  ).toString('base64url');
  return `${VERSION}.${payload}.${sign(key, payload)}`;
}

export function verifyPreviewToken(
  key: Buffer,
  token: string,
  now: Date = new Date(),
): PreviewVerifyResult {
  const invalid = { ok: false, reason: 'PREVIEW_TOKEN_INVALID' } as const;
  if (typeof token !== 'string' || token.length > 512) return invalid;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return invalid;
  const [, payload, signature] = parts;
  const expected = Buffer.from(sign(key, payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return invalid;
  let data: { a?: unknown; e?: unknown };
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as typeof data;
  } catch {
    return invalid;
  }
  if (typeof data.a !== 'string' || typeof data.e !== 'number') return invalid;
  const expiresAt = new Date(data.e * 1000);
  if (expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'PREVIEW_TOKEN_EXPIRED' };
  return { ok: true, claims: { articleId: data.a, expiresAt } };
}
