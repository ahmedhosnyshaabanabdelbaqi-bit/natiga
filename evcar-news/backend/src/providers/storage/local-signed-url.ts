import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

/**
 * HMAC-signed URLs for the local storage driver (the equivalent of S3
 * presigned URLs). The signing key is derived with HKDF from the server
 * secret, so a signature is only valid for this deployment, one key, one
 * method, one content type / download name and until `exp`.
 */
export interface LocalSignaturePayload {
  method: 'GET' | 'PUT';
  key: string;
  /** Unix seconds. */
  exp: number;
  contentType?: string;
  downloadName?: string;
}

export function deriveLocalSigningKey(serverSecret: string): Buffer {
  if (!serverSecret) throw new Error('A server secret is required to sign local storage URLs');
  return Buffer.from(
    hkdfSync('sha256', serverSecret, 'evcar-storage', 'local-signed-url-v1', 32),
  );
}

function canonical(p: LocalSignaturePayload): string {
  return [p.method, p.key, String(p.exp), p.contentType ?? '', p.downloadName ?? ''].join('\n');
}

export function signLocal(signingKey: Buffer, payload: LocalSignaturePayload): string {
  return createHmac('sha256', signingKey).update(canonical(payload)).digest('base64url');
}

export type LocalSignatureCheck = 'ok' | 'expired' | 'invalid';

export function verifyLocal(
  signingKey: Buffer,
  payload: LocalSignaturePayload,
  signature: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): LocalSignatureCheck {
  if (!Number.isInteger(payload.exp) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return 'invalid';
  const expected = Buffer.from(signLocal(signingKey, payload), 'base64url');
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return 'invalid';
  return payload.exp < nowSeconds ? 'expired' : 'ok';
}
