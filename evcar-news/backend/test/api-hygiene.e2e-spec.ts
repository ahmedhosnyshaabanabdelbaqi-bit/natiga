/**
 * Regression tests for input/response hygiene found in review:
 * explicit nulls, NUL bytes, huge pages, list envelopes, translated
 * validation messages and the mandatory ar/en languages.
 * Uses its own app/database, so it does not depend on other specs.
 */
import { bearer, createAndLogin, type LoggedIn } from './auth-test-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: { field: string; constraints: Record<string, string> }[];
  };
}

describe('API hygiene (e2e)', () => {
  let t: TestApp;
  let owner: LoggedIn;
  let reader: LoggedIn;

  beforeAll(async () => {
    t = await createTestApp();
    owner = await createAndLogin(t, ['owner', 'user']);
    reader = await createAndLogin(t, ['user']);
  });
  afterAll(async () => {
    await t?.close();
  });

  describe('explicit null on non-nullable fields → 422 (was 500)', () => {
    it.each([{ displayName: null }, { locale: null }])('PATCH /me %j', async (body) => {
      const res = await t
        .http()
        .patch('/api/v1/me')
        .set(bearer(reader.accessToken))
        .send(body)
        .expect(422);
      expect((res.body as ErrorBody).error.code).toBe('VALIDATION_FAILED');
    });

    it.each([
      ['/admin/markets/EG', { currencyCode: null }],
      ['/admin/markets/EG', { enabled: null }],
      ['/admin/markets/EG', { sortOrder: null }],
      ['/admin/markets/EG', { nameAr: null }],
      ['/admin/currencies/USD', { decimals: null }],
      ['/admin/currencies/USD', { nameEn: null }],
    ])('PATCH %s %j', async (path, body) => {
      const res = await t
        .http()
        .patch(`/api/v1${path}`)
        .set(bearer(owner.accessToken))
        .send(body)
        .expect(422);
      expect((res.body as ErrorBody).error.code).toBe('VALIDATION_FAILED');
    });

    it('still accepts null where the column is nullable (currency symbols)', async () => {
      const res = await t
        .http()
        .patch('/api/v1/admin/currencies/CNY')
        .set(bearer(owner.accessToken))
        .send({ symbolAr: null })
        .expect(200);
      expect(res.body.data.symbolAr).toBeNull();
    });
  });

  describe('NUL bytes and huge pages never reach the database (was 500)', () => {
    it.each([
      '/admin/users?q=%00',
      '/admin/users?q=a%00b',
      '/admin/audit-logs?q=%00',
      '/admin/audit-logs?action=%00',
      '/admin/audit-logs?entityType=%00',
      '/admin/translations?q=%00',
    ])('GET %s → 200', async (path) => {
      await t.http().get(`/api/v1${path}`).set(bearer(owner.accessToken)).expect(200);
    });

    it.each([
      '/admin/users',
      '/admin/audit-logs',
      '/admin/translations',
      '/admin/system/import-jobs',
    ])('GET %s?page=99999999999999999999 → 422', async (path) => {
      const res = await t
        .http()
        .get(`/api/v1${path}?page=99999999999999999999`)
        .set(bearer(owner.accessToken))
        .expect(422);
      expect(res.body.error.details[0].field).toBe('page');
    });

    it('the largest allowed page answers an empty page', async () => {
      const res = await t
        .http()
        .get('/api/v1/admin/users?page=1000000')
        .set(bearer(owner.accessToken))
        .expect(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('every list uses the { data, meta } envelope (§4.3)', () => {
    it.each([
      ['/markets', false],
      ['/admin/markets', true],
      ['/admin/currencies', true],
      ['/admin/roles', true],
      ['/admin/permissions', true],
      ['/admin/settings', true],
      ['/admin/translations/catalog', true],
      ['/me/sessions', true],
    ])('GET %s', async (path, auth) => {
      const req = t.http().get(`/api/v1${path}`);
      const res = await (auth ? req.set(bearer(owner.accessToken)) : req).expect(200);
      const { data, meta } = res.body as { data: unknown[]; meta: Record<string, number> };
      expect(Array.isArray(data)).toBe(true);
      expect(meta).toEqual({
        page: 1,
        pageSize: Math.max(data.length, 1),
        total: data.length,
        totalPages: data.length ? 1 : 0,
      });
    });
  });

  describe('validation messages follow the request language', () => {
    it('Arabic request → Arabic field messages, never raw regular expressions', async () => {
      const res = await t
        .http()
        .post('/api/v1/admin/markets')
        .set(bearer(owner.accessToken))
        .set('Accept-Language', 'ar')
        .send({ code: 'kw1', nameAr: 'الكويت', nameEn: '', currencyCode: 'EGP', timezone: 'UTC' })
        .expect(422);
      const body = res.body as ErrorBody;
      const byField = Object.fromEntries(body.error.details!.map((d) => [d.field, d.constraints]));
      expect(byField.code).toEqual({ matches: 'تنسيق القيمة غير صالح.' });
      expect(byField.nameEn.isLength).toMatch(/حرفًا/);
      expect(JSON.stringify(body)).not.toMatch(/regular expression|must match/);
    });

    it('settings rule messages are translated too', async () => {
      const res = await t
        .http()
        .put('/api/v1/admin/settings/legal?lang=ar')
        .set(bearer(owner.accessToken))
        .send({ privacyUrl: 'not a url', termsUrl: null })
        .expect(422);
      expect(JSON.stringify(res.body)).not.toMatch(/regular expression/);
    });
  });

  describe('Arabic and English stay mandatory; the default language is honoured', () => {
    it('refuses to drop Arabic (or English)', async () => {
      for (const languages of [['en'], ['ar']]) {
        const res = await t
          .http()
          .put('/api/v1/admin/settings/defaults')
          .set(bearer(owner.accessToken))
          .send({ defaultLanguage: languages[0], languages, defaultMarket: 'EG' })
          .expect(422);
        expect(res.body.error.details[0]).toMatchObject({
          field: 'languages',
          constraints: { mandatoryLanguages: expect.any(String) as string },
        });
      }
    });

    it('server messages without ?lang / Accept-Language follow the configured default', async () => {
      await t
        .http()
        .put('/api/v1/admin/settings/defaults')
        .set(bearer(owner.accessToken))
        .send({ defaultLanguage: 'en', languages: ['ar', 'en'], defaultMarket: 'EG' })
        .expect(200);
      try {
        const cfg = await t.http().get('/api/v1/app-config').expect(200);
        expect(cfg.body.data.defaultLanguage).toBe('en');
        const res = await t.http().get('/api/v1/nope').expect(404);
        expect(res.headers['content-language']).toBe('en');
        expect(res.body.error.message).toMatch(/[A-Za-z]/);
        // An explicit language still wins.
        const ar = await t.http().get('/api/v1/nope?lang=ar').expect(404);
        expect(ar.headers['content-language']).toBe('ar');
      } finally {
        await t
          .http()
          .put('/api/v1/admin/settings/defaults')
          .set(bearer(owner.accessToken))
          .send({ defaultLanguage: 'ar', languages: ['ar', 'en'], defaultMarket: 'EG' })
          .expect(200);
      }
      const back = await t.http().get('/api/v1/nope').expect(404);
      expect(back.headers['content-language']).toBe('ar');
    });
  });
});
