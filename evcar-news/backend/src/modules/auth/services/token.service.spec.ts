import { SignJWT } from 'jose';
import { AppConfig } from '../../../config/app-config';
import { AccessTokenError, extractBearerToken, TokenService } from './token.service';

const USER = '0190a3c6-1111-7000-8000-000000000001';
const SESSION = '0190a3c6-2222-7000-8000-000000000002';

function makeConfig(overrides: Record<string, string> = {}) {
  return AppConfig.fromEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://x:y@localhost:5432/unit',
    JWT_ACCESS_SECRET: 'unit-test-secret-unit-test-secret-1234',
    ...overrides,
  });
}

async function reason(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    if (err instanceof AccessTokenError) return err.reason;
    throw err;
  }
  return 'valid';
}

describe('TokenService (access tokens)', () => {
  const tokens = new TokenService(makeConfig());

  it('signs a 15-minute HS256 token with sub/sid/typ/iss/aud', async () => {
    const token = await tokens.signAccessToken(USER, SESSION);
    const [header, payload] = token
      .split('.')
      .slice(0, 2)
      .map((p) => JSON.parse(Buffer.from(p, 'base64url').toString()) as Record<string, unknown>);
    expect(header).toMatchObject({ alg: 'HS256', typ: 'JWT' });
    expect(payload).toMatchObject({
      sub: USER,
      sid: SESSION,
      typ: 'access',
      iss: 'evcar.news',
      aud: 'evcar-api',
    });
    expect((payload.exp as number) - (payload.iat as number)).toBe(900);
    await expect(tokens.verifyAccessToken(token)).resolves.toEqual({
      sub: USER,
      sid: SESSION,
      typ: 'access',
    });
  });

  it('reports expired tokens distinctly (→ 401 TOKEN_EXPIRED)', async () => {
    const old = await tokens.signAccessToken(USER, SESSION, new Date(Date.now() - 3600_000));
    expect(await reason(tokens.verifyAccessToken(old))).toBe('expired');
    // Logout may still identify the session of an expired (but genuine) token.
    await expect(tokens.verifyAccessToken(old, { allowExpired: true })).resolves.toMatchObject({
      sid: SESSION,
    });
  });

  it('rejects tokens signed with another secret, audience, issuer or algorithm', async () => {
    const other = new TokenService(makeConfig({ JWT_ACCESS_SECRET: 'x'.repeat(40) }));
    expect(await reason(tokens.verifyAccessToken(await other.signAccessToken(USER, SESSION)))).toBe(
      'invalid',
    );
    const otherAud = new TokenService(makeConfig({ JWT_AUDIENCE: 'someone-else' }));
    expect(
      await reason(tokens.verifyAccessToken(await otherAud.signAccessToken(USER, SESSION))),
    ).toBe('invalid');
    const otherIss = new TokenService(makeConfig({ JWT_ISSUER: 'evil' }));
    expect(
      await reason(tokens.verifyAccessToken(await otherIss.signAccessToken(USER, SESSION))),
    ).toBe('invalid');

    const genuine = await tokens.signAccessToken(USER, SESSION);
    const [, payload] = genuine.split('.');
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${payload}.`;
    expect(await reason(tokens.verifyAccessToken(none))).toBe('invalid');
    expect(await reason(tokens.verifyAccessToken('garbage'))).toBe('invalid');
  });

  it('rejects well-signed tokens with a wrong type or malformed ids', async () => {
    const key = new TextEncoder().encode('unit-test-secret-unit-test-secret-1234');
    const sign = (claims: Record<string, unknown>, sub = USER) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(sub)
        .setIssuer('evcar.news')
        .setAudience('evcar-api')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(key);
    expect(
      await reason(tokens.verifyAccessToken(await sign({ sid: SESSION, typ: 'refresh' }))),
    ).toBe('invalid');
    expect(await reason(tokens.verifyAccessToken(await sign({ sid: 'nope', typ: 'access' })))).toBe(
      'invalid',
    );
    expect(
      await reason(tokens.verifyAccessToken(await sign({ sid: SESSION, typ: 'access' }, 'x'))),
    ).toBe('invalid');
  });

  it('extracts bearer tokens strictly', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(extractBearerToken('bearer abc')).toBe('abc');
    expect(extractBearerToken(['Bearer a.b.c'])).toBe('a.b.c');
    expect(extractBearerToken('Basic dXNlcjpwYXNz')).toBeUndefined();
    expect(extractBearerToken('Bearer a b')).toBeUndefined();
    expect(extractBearerToken(undefined)).toBeUndefined();
  });
});
