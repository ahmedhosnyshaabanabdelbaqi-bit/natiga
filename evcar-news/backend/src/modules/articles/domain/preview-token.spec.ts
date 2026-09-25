import { createPreviewToken, previewKey, verifyPreviewToken } from './preview-token';

describe('preview tokens', () => {
  const key = previewKey('test-secret-at-least-32-characters-long!!');
  const now = new Date('2026-09-25T12:00:00Z');
  const token = createPreviewToken(key, {
    articleId: '01a0d874-9850-70ff-a37b-c700bbbb988b',
    expiresAt: new Date('2026-09-25T13:00:00Z'),
  });

  it('round-trips', () => {
    const r = verifyPreviewToken(key, token, now);
    expect(r).toEqual({
      ok: true,
      claims: {
        articleId: '01a0d874-9850-70ff-a37b-c700bbbb988b',
        expiresAt: new Date('2026-09-25T13:00:00Z'),
      },
    });
  });

  it('expires', () => {
    expect(verifyPreviewToken(key, token, new Date('2026-09-25T13:00:01Z'))).toEqual({
      ok: false,
      reason: 'PREVIEW_TOKEN_EXPIRED',
    });
  });

  it('rejects tampering, other keys and garbage', () => {
    const [v, payload, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ a: 'other', e: 9999999999 })).toString('base64url');
    for (const bad of [
      `${v}.${forged}.${sig}`,
      `${v}.${payload}.${sig.slice(0, -2)}xx`,
      `v2.${payload}.${sig}`,
      'garbage',
      '',
      'x'.repeat(600),
    ]) {
      expect(verifyPreviewToken(key, bad, now)).toEqual({
        ok: false,
        reason: 'PREVIEW_TOKEN_INVALID',
      });
    }
    expect(
      verifyPreviewToken(previewKey('another-secret-value-1234567890abcd'), token, now).ok,
    ).toBe(false);
  });
});
