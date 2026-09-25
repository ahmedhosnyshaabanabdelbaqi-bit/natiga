import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import type { OAuthProviderConfig } from '../../../providers/oauth/oauth-config';
import { JwksIdTokenVerifier, OAuthTokenInvalidError } from './oauth-verifiers';

const google: OAuthProviderConfig = {
  provider: 'google',
  configured: true,
  clientIds: ['client-a', 'client-b'],
  issuers: ['https://accounts.google.com', 'accounts.google.com'],
  jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
};

describe('JwksIdTokenVerifier', () => {
  let key: CryptoKey;
  let verifier: JwksIdTokenVerifier;

  const token = (claims: Record<string, unknown>, aud = 'client-b', exp: string | number = '5m') =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer('accounts.google.com')
      .setAudience(aud)
      .setSubject('sub-1')
      .setIssuedAt()
      .setExpirationTime(exp)
      .sign(key);

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    key = pair.privateKey;
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' };
    verifier = new JwksIdTokenVerifier(google, createLocalJWKSet({ keys: [jwk] }));
  });

  it('verifies and normalizes the identity', async () => {
    await expect(
      verifier.verify(await token({ email: 'A@Example.COM', email_verified: true, name: 'A' })),
    ).resolves.toEqual({
      provider: 'google',
      subject: 'sub-1',
      email: 'a@example.com',
      emailVerified: true,
      name: 'A',
    });
    const unverified = await verifier.verify(await token({ email: 'b@example.com' }));
    expect(unverified.emailVerified).toBe(false);
    const stringTrue = await verifier.verify(
      await token({ email: 'c@example.com', email_verified: 'true' }),
    );
    expect(stringTrue.emailVerified).toBe(true);
  });

  it('rejects wrong audience, expired and malformed tokens', async () => {
    await expect(verifier.verify(await token({}, 'client-z'))).rejects.toBeInstanceOf(
      OAuthTokenInvalidError,
    );
    const past = Math.floor(Date.now() / 1000) - 3600;
    await expect(verifier.verify(await token({}, 'client-a', past))).rejects.toBeInstanceOf(
      OAuthTokenInvalidError,
    );
    await expect(verifier.verify('not-a-jwt')).rejects.toBeInstanceOf(OAuthTokenInvalidError);
    await expect(verifier.verify('')).rejects.toBeInstanceOf(OAuthTokenInvalidError);
  });

  it('is not configured without client ids', () => {
    expect(verifier.isConfigured()).toBe(true);
    expect(
      new JwksIdTokenVerifier({ ...google, configured: false, clientIds: [] }).isConfigured(),
    ).toBe(false);
  });
});
