import { createTestApp, type TestApp } from './utils/test-app';

describe('Health & HTTP foundation (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.close();
  });

  it('GET /api/v1/health reports database and redis up', async () => {
    const res = await t.http().get('/api/v1/health').expect(200);
    expect(res.body.data).toMatchObject({
      status: 'ok',
      checks: { database: { status: 'up' }, redis: { status: 'up' } },
      environment: 'test',
    });
    expect(typeof res.body.data.checks.database.latencyMs).toBe('number');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('GET /api/v1/health/live answers without dependencies', async () => {
    const res = await t.http().get('/api/v1/health/live').expect(200);
    expect(res.body).toEqual({ data: { status: 'ok' } });
  });

  it('generates a request id, or echoes a valid incoming one', async () => {
    const generated = await t.http().get('/api/v1/health/live');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const echoed = await t
      .http()
      .get('/api/v1/health/live')
      .set('X-Request-Id', 'client-req-12345');
    expect(echoed.headers['x-request-id']).toBe('client-req-12345');
    const rejected = await t
      .http()
      .get('/api/v1/health/live')
      .set('X-Request-Id', 'bad id with spaces');
    expect(rejected.headers['x-request-id']).not.toBe('bad id with spaces');
  });

  it('renders unknown routes with the error envelope (localized, default ar)', async () => {
    const res = await t.http().get('/api/v1/does-not-exist').expect(404);
    expect(res.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'العنصر المطلوب غير موجود.',
        requestId: res.headers['x-request-id'],
      },
    });
    const en = await t
      .http()
      .get('/api/v1/does-not-exist')
      .set('Accept-Language', 'en-GB,en;q=0.9')
      .expect(404);
    expect(en.body.error.message).toBe('The requested resource was not found.');
    const override = await t
      .http()
      .get('/api/v1/does-not-exist?lang=ar')
      .set('Accept-Language', 'en')
      .expect(404);
    expect(override.body.error.message).toBe('العنصر المطلوب غير موجود.');
  });

  it('maps malformed JSON to 400 INVALID_JSON and oversized bodies to 413', async () => {
    const bad = await t
      .http()
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"a":')
      .expect(400);
    expect(bad.body.error.code).toBe('INVALID_JSON');
    expect(bad.body.error.requestId).toBe(bad.headers['x-request-id']);
    const big = await t
      .http()
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ a: 'x'.repeat(6 * 1024 * 1024) }))
      .expect(413);
    expect(big.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('sets security headers and resolves market headers', async () => {
    const res = await t.http().get('/api/v1/health/live').set('X-Market', 'sa');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-market']).toBe('SA');
    expect(res.headers['content-language']).toBe('ar');
  });

  it('serves the OpenAPI document', async () => {
    const res = await t.http().get('/api/docs-json').expect(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.paths['/api/v1/health']).toBeDefined();
    await t.http().get('/api/docs').expect(200);
  });
});
