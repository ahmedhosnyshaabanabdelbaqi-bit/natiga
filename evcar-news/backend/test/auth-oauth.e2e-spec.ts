import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JWTVerifyGetKey,
} from 'jose';
import { AppConfig } from '../src/config/app-config';
import { OAuthConfig } from '../src/providers/oauth/oauth-config';
import {
  AppleIdTokenVerifier,
  GoogleIdTokenVerifier,
} from '../src/modules/auth/oauth/oauth-verifiers';
import { createUser, login, STRONG_PASSWORD } from './auth-test-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

const GOOGLE_CLIENT = 'evcar-test.apps.googleusercontent.com';
const APPLE_CLIENT = 'news.evcar.app';

describe('Google / Apple sign-in (e2e)', () => {
  describe('not configured', () => {
    let t: TestApp;
    beforeAll(async () => {
      t = await createTestApp();
    });
    afterAll(async () => {
      await t?.close();
    });

    it('returns 503 INTEGRATION_NOT_CONFIGURED for both providers', async () => {
      const g = await t
        .http()
        .post('/api/v1/auth/oauth/google')
        .send({ idToken: 'x'.repeat(40) })
        .expect(503);
      expect(g.body.error).toMatchObject({
        code: 'INTEGRATION_NOT_CONFIGURED',
        details: { integration: 'oauth.google' },
      });
      const a = await t
        .http()
        .post('/api/v1/auth/oauth/apple')
        .send({ identityToken: 'x'.repeat(40) })
        .expect(503);
      expect(a.body.error.details).toEqual({ integration: 'oauth.apple' });
    });
  });

  describe('configured (local test keys)', () => {
    let t: TestApp;
    let privateKey: CryptoKey;
    let otherKey: CryptoKey;

    const googleToken = async (
      claims: Record<string, unknown>,
      opts: { aud?: string; key?: CryptoKey; iss?: string } = {},
    ) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setIssuer(opts.iss ?? 'https://accounts.google.com')
        .setAudience(opts.aud ?? GOOGLE_CLIENT)
        .setIssuedAt()
        .setExpirationTime('10m')
        .sign(opts.key ?? privateKey);

    beforeAll(async () => {
      const pair = await generateKeyPair('RS256', { extractable: true });
      privateKey = pair.privateKey;
      otherKey = (await generateKeyPair('RS256')).privateKey;
      const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256' };
      const jwks: JWTVerifyGetKey = createLocalJWKSet({ keys: [jwk] });
      t = await createTestApp({
        env: { GOOGLE_OAUTH_CLIENT_IDS: GOOGLE_CLIENT, APPLE_OAUTH_CLIENT_IDS: APPLE_CLIENT },
        override: (b) =>
          b
            .overrideProvider(GoogleIdTokenVerifier)
            .useFactory({
              factory: (c: AppConfig) => new GoogleIdTokenVerifier(new OAuthConfig(c), jwks),
              inject: [AppConfig],
            })
            .overrideProvider(AppleIdTokenVerifier)
            .useFactory({
              factory: (c: AppConfig) => new AppleIdTokenVerifier(new OAuthConfig(c), jwks),
              inject: [AppConfig],
            }),
      });
    });
    afterAll(async () => {
      await t?.close();
    });

    it('creates a verified account on first Google sign-in and reuses it afterwards', async () => {
      const idToken = await googleToken({
        sub: 'google-user-1',
        email: 'Driver.Google@Example.com',
        email_verified: true,
        name: 'Google Driver',
      });
      const first = await t
        .http()
        .post('/api/v1/auth/oauth/google')
        .send({ idToken, deviceName: 'iPhone' })
        .expect(200);
      expect(first.body.data).toMatchObject({
        accessToken: expect.any(String),
        accessTokenExpiresIn: 900,
        refreshToken: expect.any(String),
        user: {
          email: 'driver.google@example.com',
          displayName: 'Google Driver',
          emailVerified: true,
          roles: ['user'],
        },
      });
      const second = await t.http().post('/api/v1/auth/oauth/google').send({ idToken }).expect(200);
      expect(second.body.data.user.id).toBe(first.body.data.user.id);
      const user = await t.prisma.user.findUniqueOrThrow({
        where: { id: first.body.data.user.id as string },
        include: { oauthAccounts: true },
      });
      expect(user.passwordHash).toBeNull();
      expect(user.oauthAccounts).toEqual([
        expect.objectContaining({ provider: 'google', providerUserId: 'google-user-1' }),
      ]);
      // An OAuth-only account has no password: password login fails generically.
      await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: 'driver.google@example.com', password: STRONG_PASSWORD })
        .expect(401);
    });

    it('rejects tokens with a wrong audience, issuer or signature (401 OAUTH_TOKEN_INVALID)', async () => {
      const claims = { sub: 'g-2', email: 'g2@example.com', email_verified: true };
      for (const token of [
        await googleToken(claims, { aud: 'someone-else' }),
        await googleToken(claims, { iss: 'https://evil.example.com' }),
        await googleToken(claims, { key: otherKey }),
      ]) {
        const res = await t
          .http()
          .post('/api/v1/auth/oauth/google')
          .send({ idToken: token })
          .expect(401);
        expect(res.body.error.code).toBe('OAUTH_TOKEN_INVALID');
      }
    });

    it('requires a verified e-mail from the provider for new accounts', async () => {
      const idToken = await googleToken({
        sub: 'g-3',
        email: 'g3@example.com',
        email_verified: false,
      });
      const res = await t.http().post('/api/v1/auth/oauth/google').send({ idToken }).expect(403);
      expect(res.body.error.code).toBe('OAUTH_EMAIL_UNVERIFIED');
    });

    it('links a verified local account (password keeps working)', async () => {
      const local = await createUser(t, { email: 'linked@example.com' });
      const idToken = await googleToken({
        sub: 'g-4',
        email: 'linked@example.com',
        email_verified: true,
      });
      const res = await t.http().post('/api/v1/auth/oauth/google').send({ idToken }).expect(200);
      expect(res.body.data.user.id).toBe(local.id);
      await login(t, local.email, local.password);
    });

    it('takes over an UNVERIFIED local account safely (drops the unproven password + sessions)', async () => {
      const squatter = await createUser(t, { email: 'victim@example.com', verified: false });
      const squatterSession = await t.prisma.userSession.create({
        data: {
          userId: squatter.id,
          refreshTokenHash: 'a'.repeat(64),
          expiresAt: new Date(Date.now() + 3600_000),
        },
      });
      const idToken = await googleToken({
        sub: 'g-5',
        email: 'victim@example.com',
        email_verified: true,
      });
      const res = await t.http().post('/api/v1/auth/oauth/google').send({ idToken }).expect(200);
      expect(res.body.data.user).toMatchObject({ id: squatter.id, emailVerified: true });
      const after = await t.prisma.user.findUniqueOrThrow({ where: { id: squatter.id } });
      expect(after.passwordHash).toBeNull();
      const old = await t.prisma.userSession.findUniqueOrThrow({
        where: { id: squatterSession.id },
      });
      expect(old.revokedReason).toBe('account_takeover_protection');
    });

    it('accepts Apple identity tokens (string email_verified) in web cookie mode', async () => {
      const identityToken = await new SignJWT({
        email: 'apple.user@privaterelay.appleid.com',
        email_verified: 'true',
        is_private_email: 'true',
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setIssuer('https://appleid.apple.com')
        .setAudience(APPLE_CLIENT)
        .setSubject('apple-sub-1')
        .setIssuedAt()
        .setExpirationTime('10m')
        .sign(privateKey);
      const res = await t
        .http()
        .post('/api/v1/auth/oauth/apple')
        .set('X-Client-Type', 'web')
        .send({ identityToken })
        .expect(200);
      expect(res.body.data.refreshToken).toBeUndefined();
      expect(res.body.data.user.email).toBe('apple.user@privaterelay.appleid.com');
      expect(String(res.headers['set-cookie'])).toContain('evcar_rt=');
    });
  });
});
