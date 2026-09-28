/**
 * CORS for browser clients (admin panel, the app's web preview): every
 * header the apps send must pass the preflight, and public media is
 * readable from any origin without credentials.
 */
import { createTestApp, type TestApp } from './utils/test-app';

describe('CORS (e2e)', () => {
  let t: TestApp;
  const origin = 'http://localhost:8088';

  beforeAll(async () => {
    t = await createTestApp({ env: { CORS_ORIGINS: origin } });
  });
  afterAll(async () => {
    await t?.close();
  });

  it('preflight accepts every header the mobile app sends (was: X-App-Version refused)', async () => {
    // lib/core/api/api_client.dart adds these on every request.
    const appHeaders = [
      'authorization',
      'accept-language',
      'x-market',
      'x-client-type',
      'x-device-id',
      'x-app-version',
      'if-none-match',
    ];
    const res = await t
      .http()
      .options('/api/v1/app-config')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', appHeaders.join(','));
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
    const allowed = String(res.headers['access-control-allow-headers']).toLowerCase().split(',');
    for (const h of appHeaders) expect(allowed).toContain(h);
  });

  it('other origins get no CORS grant', async () => {
    const res = await t
      .http()
      .options('/api/v1/app-config')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
