import { ProbeModule } from './utils/probe.module';
import { createTestApp, type TestApp } from './utils/test-app';

describe('Validation, errors, locale, pagination (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ imports: [ProbeModule] });
  });
  afterAll(async () => {
    await t?.close();
  });

  it('accepts and transforms a valid body', async () => {
    const res = await t
      .http()
      .post('/api/v1/__probe/echo')
      .send({ email: 'a@b.co', count: 3, address: { city: 'Cairo' } })
      .expect(201);
    expect(res.body.data).toEqual({
      email: 'a@b.co',
      count: 3,
      address: { city: 'Cairo' },
      isInstance: true,
    });
  });

  it('rejects invalid and unknown fields with 422 VALIDATION_FAILED + field details', async () => {
    const res = await t
      .http()
      .post('/api/v1/__probe/echo?lang=en')
      .send({ email: 'nope', count: 99, address: { city: 5 }, isAdmin: true })
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.message).toBe('Some fields are invalid. See details.');
    const fields = (
      res.body.error.details as { field: string; constraints: Record<string, string> }[]
    )
      .map((d) => d.field)
      .sort();
    expect(fields).toEqual(['address.city', 'count', 'email', 'isAdmin']);
    const details = res.body.error.details as {
      field: string;
      constraints: Record<string, string>;
    }[];
    const unknown = details.find((d) => d.field === 'isAdmin');
    expect(Object.keys(unknown?.constraints ?? {})).toEqual(['whitelistValidation']);
  });

  it('renders AppException with localized message and details', async () => {
    const ar = await t.http().get('/api/v1/__probe/app-error').expect(409);
    expect(ar.body.error).toMatchObject({
      code: 'ARTICLE_NOT_PUBLISHABLE',
      message: 'لا يمكن نشر المادة.',
      details: { missing: ['cover'] },
    });
    const en = await t
      .http()
      .get('/api/v1/__probe/app-error')
      .set('Accept-Language', 'en')
      .expect(409);
    expect(en.body.error.message).toBe('The article cannot be published.');
  });

  it('returns 503 INTEGRATION_NOT_CONFIGURED', async () => {
    const res = await t.http().get('/api/v1/__probe/not-configured').expect(503);
    expect(res.body.error).toMatchObject({
      code: 'INTEGRATION_NOT_CONFIGURED',
      details: { integration: 'routing' },
    });
  });

  it('hides internal errors behind 500 INTERNAL_ERROR', async () => {
    const res = await t.http().get('/api/v1/__probe/crash?lang=en').expect(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });

  it('maps unique constraint violations to 409 CONFLICT', async () => {
    const res = await t.http().get('/api/v1/__probe/unique-violation').expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('resolves language and market (query > header > default) and exposes them in the request context', async () => {
    const def = await t.http().get('/api/v1/__probe/locale').expect(200);
    expect(def.body.data).toMatchObject({ lang: 'ar', market: 'EG', contextLang: 'ar' });
    expect(def.body.data.contextRequestId).toBe(def.headers['x-request-id']);

    const header = await t
      .http()
      .get('/api/v1/__probe/locale')
      .set('Accept-Language', 'fr, en;q=0.8')
      .set('X-Market', 'AE');
    expect(header.body.data).toMatchObject({ lang: 'en', market: 'AE' });

    const query = await t
      .http()
      .get('/api/v1/__probe/locale?lang=ar&market=sa')
      .set('Accept-Language', 'en')
      .set('X-Market', 'AE');
    expect(query.body.data).toMatchObject({ lang: 'ar', market: 'SA' });

    const unknown = await t.http().get('/api/v1/__probe/locale?market=ZZ&lang=xx');
    expect(unknown.body.data).toMatchObject({ lang: 'ar', market: 'EG' });
  });

  it('serves share routes outside /api/v1 with locale resolution', async () => {
    const res = await t.http().get('/n/some-article?lang=en&market=AE').expect(200);
    expect(res.body.data).toEqual({ lang: 'en', market: 'AE' });
    await t.http().get('/api/v1/n/some-article').expect(404);
  });

  it('paginates with page/pageSize/meta and validates bounds', async () => {
    const res = await t.http().get('/api/v1/__probe/paged?page=3&pageSize=20').expect(200);
    expect(res.body.meta).toEqual({ page: 3, pageSize: 20, total: 45, totalPages: 3 });
    expect(res.body.data).toEqual([41, 42, 43, 44, 45]);
    const bad = await t.http().get('/api/v1/__probe/paged?pageSize=500').expect(422);
    expect(bad.body.error.details[0].field).toBe('pageSize');
  });
});

describe('Rate limiting (e2e)', () => {
  for (const storage of ['memory', 'redis'] as const) {
    it(`returns 429 RATE_LIMITED with Retry-After (${storage} storage)`, async () => {
      const t = await createTestApp({
        imports: [ProbeModule],
        env: { RATE_LIMIT_MULTIPLIER: '1', RATE_LIMIT_STORAGE: storage },
      });
      try {
        for (let i = 0; i < 10; i++) {
          await t.http().get('/api/v1/__probe/limited').expect(200);
        }
        const res = await t.http().get('/api/v1/__probe/limited?lang=en').expect(429);
        expect(res.body.error.code).toBe('RATE_LIMITED');
        expect(res.body.error.message).toBe('Too many requests. Please try again shortly.');
        expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
        // Health checks are never throttled.
        await t.http().get('/api/v1/health/live').expect(200);
      } finally {
        await t.close();
      }
    });
  }
});
