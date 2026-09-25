import { userWithRoles, waitForAudit, type PlatformUser } from './platform-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

describe('Platform: markets, currencies & translations (e2e)', () => {
  let t: TestApp;
  let admin: PlatformUser;
  let normal: PlatformUser;

  beforeAll(async () => {
    t = await createTestApp();
    admin = await userWithRoles(t, ['admin', 'user']);
    normal = await userWithRoles(t, ['user']);
  });
  afterAll(async () => {
    await t?.close();
  });

  describe('public markets', () => {
    it('lists enabled markets with currency, names localized by ?lang (independent of market)', async () => {
      const ar = await t.http().get('/api/v1/markets').expect(200);
      // The seeded markets first (other tests in this file may add more after them).
      expect(ar.body.data.map((m: { code: string }) => m.code).slice(0, 3)).toEqual([
        'EG',
        'SA',
        'AE',
      ]);
      expect(ar.body.data[0]).toMatchObject({
        code: 'EG',
        name: 'مصر',
        nameEn: 'Egypt',
        currency: { code: 'EGP', name: 'جنيه مصري', symbol: 'ج.م', decimals: 2 },
        timezone: 'Africa/Cairo',
        unitSystem: 'metric',
        isDefault: true,
      });
      // English content while the market is Saudi Arabia.
      const en = await t.http().get('/api/v1/markets?lang=en&market=SA').expect(200);
      expect(en.headers['content-language']).toBe('en');
      expect(en.headers['x-market']).toBe('SA');
      expect(en.body.data[1]).toMatchObject({
        code: 'SA',
        name: 'Saudi Arabia',
        currency: { name: 'Saudi Riyal' },
      });
      expect(en.headers.etag).toBeDefined();
      await t.http().get('/api/v1/markets').set('If-None-Match', ar.headers.etag).expect(304);
      await t.http().get('/api/v1/markets/ae?lang=en').expect(200);
      await t.http().get('/api/v1/markets/ZZ').expect(404);
    });
  });

  describe('admin markets & currencies', () => {
    it('forbids normal users', async () => {
      await t
        .http()
        .post('/api/v1/admin/markets')
        .set(normal.auth)
        .send({
          code: 'KW',
          nameAr: 'الكويت',
          nameEn: 'Kuwait',
          currencyCode: 'EGP',
          timezone: 'Asia/Kuwait',
        })
        .expect(403);
      await t
        .http()
        .patch('/api/v1/admin/markets/EG')
        .set(normal.auth)
        .send({ enabled: false })
        .expect(403);
      await t
        .http()
        .post('/api/v1/admin/currencies')
        .set(normal.auth)
        .send({ code: 'KWD', nameAr: 'x', nameEn: 'x' })
        .expect(403);
    });

    it('adds a currency and a new country that starts disabled, then enables it', async () => {
      const cur = await t
        .http()
        .post('/api/v1/admin/currencies')
        .set(admin.auth)
        .send({
          code: 'KWD',
          nameAr: 'دينار كويتي',
          nameEn: 'Kuwaiti Dinar',
          symbolAr: 'د.ك',
          symbolEn: 'KD',
          decimals: 3,
        })
        .expect(201);
      expect(cur.body.data).toEqual({
        code: 'KWD',
        nameAr: 'دينار كويتي',
        nameEn: 'Kuwaiti Dinar',
        symbolAr: 'د.ك',
        symbolEn: 'KD',
        decimals: 3,
      });
      await t
        .http()
        .post('/api/v1/admin/currencies')
        .set(admin.auth)
        .send({ code: 'KWD', nameAr: 'x', nameEn: 'x' })
        .expect(409);

      const created = await t
        .http()
        .post('/api/v1/admin/markets')
        .set(admin.auth)
        .send({
          code: 'KW',
          nameAr: 'الكويت',
          nameEn: 'Kuwait',
          currencyCode: 'KWD',
          timezone: 'Asia/Kuwait',
        })
        .expect(201);
      expect(created.body.data).toMatchObject({
        code: 'KW',
        enabled: false,
        isDefault: false,
        defaultLanguage: 'ar',
      });
      const audit = await waitForAudit(t, 'markets.create');
      expect(audit).toMatchObject({ entityId: 'KW', actorId: admin.id });

      const hidden = await t.http().get('/api/v1/markets').expect(200);
      expect(hidden.body.data.map((m: { code: string }) => m.code)).not.toContain('KW');
      // Unknown/disabled market requested → default market.
      const fallback = await t.http().get('/api/v1/health/live?market=KW');
      expect(fallback.headers['x-market']).toBe('EG');

      await t
        .http()
        .patch('/api/v1/admin/markets/KW')
        .set(admin.auth)
        .send({ enabled: true, sortOrder: 4 })
        .expect(200);
      const shown = await t.http().get('/api/v1/markets?lang=en').expect(200);
      expect(shown.body.data.map((m: { code: string }) => m.code)).toEqual([
        'EG',
        'SA',
        'AE',
        'KW',
      ]);
      const cfg = await t.http().get('/api/v1/app-config').expect(200);
      expect(cfg.body.data.markets.map((m: { code: string }) => m.code)).toContain('KW');
      const now = await t.http().get('/api/v1/health/live?market=KW');
      expect(now.headers['x-market']).toBe('KW');
    });

    it('validates input (timezone, currency, code, immutable code)', async () => {
      const tz = await t
        .http()
        .post('/api/v1/admin/markets')
        .set(admin.auth)
        .send({
          code: 'QA',
          nameAr: 'قطر',
          nameEn: 'Qatar',
          currencyCode: 'EGP',
          timezone: 'Mars/Olympus',
        })
        .expect(422);
      expect(tz.body.error.code).toBe('TIMEZONE_INVALID');
      const cur = await t
        .http()
        .post('/api/v1/admin/markets')
        .set(admin.auth)
        .send({
          code: 'QA',
          nameAr: 'قطر',
          nameEn: 'Qatar',
          currencyCode: 'QAR',
          timezone: 'Asia/Qatar',
        })
        .expect(422);
      expect(cur.body.error.code).toBe('CURRENCY_NOT_FOUND');
      await t
        .http()
        .post('/api/v1/admin/markets')
        .set(admin.auth)
        .send({
          code: 'qa',
          nameAr: 'قطر',
          nameEn: 'Qatar',
          currencyCode: 'EGP',
          timezone: 'Asia/Qatar',
        })
        .expect(422);
      // Seeded market (does not depend on markets created by other tests).
      await t
        .http()
        .patch('/api/v1/admin/markets/SA')
        .set(admin.auth)
        .send({ code: 'SX' })
        .expect(422);
      await t
        .http()
        .post('/api/v1/admin/markets')
        .set(admin.auth)
        .send({
          code: 'EG',
          nameAr: 'مصر',
          nameEn: 'Egypt',
          currencyCode: 'EGP',
          timezone: 'Africa/Cairo',
        })
        .expect(409);
    });

    it('protects the default market and markets / currencies in use', async () => {
      const disable = await t
        .http()
        .patch('/api/v1/admin/markets/EG')
        .set(admin.auth)
        .set('Accept-Language', 'en')
        .send({ enabled: false })
        .expect(409);
      expect(disable.body.error).toMatchObject({
        code: 'MARKET_IS_DEFAULT',
        message:
          'The default market cannot be disabled or deleted. Choose another default market first.',
      });
      await t.http().delete('/api/v1/admin/markets/EG').set(admin.auth).expect(409);

      // A market referenced by data cannot be deleted (it would null/cascade rows).
      // Own fixtures (not the market created by another test).
      await t.prisma.currency.create({
        data: { code: 'OMR', nameAr: 'ريال عماني', nameEn: 'Omani Rial', decimals: 3 },
      });
      await t.prisma.market.create({
        data: {
          code: 'OM',
          nameAr: 'عمان',
          nameEn: 'Oman',
          currencyCode: 'OMR',
          timezone: 'Asia/Muscat',
          enabled: false,
        },
      });
      await t.prisma.rssFeed.create({
        data: {
          name: 'Synthetic feed (e2e)',
          url: 'https://feeds.example.invalid/om.xml',
          marketCode: 'OM',
        },
      });
      const inUse = await t.http().delete('/api/v1/admin/markets/OM').set(admin.auth).expect(409);
      expect(inUse.body.error).toMatchObject({
        code: 'MARKET_IN_USE',
        details: { total: 1, byRelation: { rssFeeds: 1 } },
      });
      const used = await t
        .http()
        .delete('/api/v1/admin/currencies/OMR')
        .set(admin.auth)
        .expect(409);
      expect(used.body.error.code).toBe('CURRENCY_IN_USE');

      await t.prisma.rssFeed.deleteMany({ where: { marketCode: 'OM' } });
      await t.http().delete('/api/v1/admin/markets/OM').set(admin.auth).expect(204);
      await t.http().delete('/api/v1/admin/currencies/OMR').set(admin.auth).expect(204);
      await t.http().get('/api/v1/admin/markets/OM').set(admin.auth).expect(404);
    });

    it('lets a new default market be chosen, then the old one be disabled', async () => {
      const enabledBefore = (await t.http().get('/api/v1/markets').expect(200)).body.data.map(
        (m: { code: string }) => m.code,
      ) as string[];
      try {
        await t
          .http()
          .put('/api/v1/admin/settings/defaults')
          .set(admin.auth)
          .send({ defaultLanguage: 'en', defaultMarket: 'SA', languages: ['ar', 'en'] })
          .expect(200);
        await t
          .http()
          .patch('/api/v1/admin/markets/EG')
          .set(admin.auth)
          .send({ enabled: false })
          .expect(200);
        const cfg = (await t.http().get('/api/v1/app-config').expect(200)).body.data;
        expect(cfg).toMatchObject({ defaultMarket: 'SA', defaultLanguage: 'en' });
        // Every market that was enabled, minus EG (other tests may have added some).
        expect(cfg.markets.map((m: { code: string }) => m.code)).toEqual(
          enabledBefore.filter((c) => c !== 'EG'),
        );
        const res = await t.http().get('/api/v1/health/live');
        expect(res.headers['x-market']).toBe('SA');
      } finally {
        // Always restore: later tests rely on the seeded defaults.
        await t
          .http()
          .patch('/api/v1/admin/markets/EG')
          .set(admin.auth)
          .send({ enabled: true })
          .expect(200);
        await t
          .http()
          .put('/api/v1/admin/settings/defaults')
          .set(admin.auth)
          .send({ defaultLanguage: 'ar', defaultMarket: 'EG', languages: ['ar', 'en'] })
          .expect(200);
      }
    });
  });

  describe('translations (i18n overrides)', () => {
    it('lists the server catalog with placeholders', async () => {
      const res = await t
        .http()
        .get('/api/v1/admin/translations/catalog?namespace=errors')
        .set(admin.auth)
        .expect(200);
      const entry = (res.body.data as { key: string; placeholders: string[] }[]).find(
        (e) => e.key === 'MARKET_IN_USE',
      );
      expect(entry).toMatchObject({
        namespace: 'errors',
        placeholders: ['code'],
        overrides: { ar: null, en: null },
      });
      await t.http().get('/api/v1/admin/translations/catalog').set(normal.auth).expect(403);
    });

    it('overrides a server error message (placeholders enforced) and localizes errors with it', async () => {
      const mismatch = await t
        .http()
        .post('/api/v1/admin/translations')
        .set(admin.auth)
        .send({ namespace: 'errors', key: 'MARKET_IN_USE', locale: 'en', value: 'Market busy' })
        .expect(422);
      expect(mismatch.body.error.code).toBe('TRANSLATION_PLACEHOLDERS_MISMATCH');
      await t
        .http()
        .post('/api/v1/admin/translations')
        .set(admin.auth)
        .send({ namespace: 'errors', key: 'NO_SUCH_KEY', locale: 'en', value: 'x' })
        .expect(422);

      const created = await t
        .http()
        .post('/api/v1/admin/translations')
        .set(admin.auth)
        .send({
          namespace: 'errors',
          key: 'MARKET_IS_DEFAULT',
          locale: 'en',
          value: 'Pick another default market first.',
        })
        .expect(201);
      const id = created.body.data.id as string;
      await t
        .http()
        .post('/api/v1/admin/translations')
        .set(admin.auth)
        .send({ namespace: 'errors', key: 'MARKET_IS_DEFAULT', locale: 'en', value: 'dup' })
        .expect(409);

      const en = await t
        .http()
        .patch('/api/v1/admin/markets/EG')
        .set(admin.auth)
        .set('Accept-Language', 'en')
        .send({ enabled: false })
        .expect(409);
      expect(en.body.error.message).toBe('Pick another default market first.');
      const ar = await t
        .http()
        .patch('/api/v1/admin/markets/EG?lang=ar')
        .set(admin.auth)
        .send({ enabled: false })
        .expect(409);
      expect(ar.body.error.message).toContain('السوق الافتراضي');

      await t
        .http()
        .patch(`/api/v1/admin/translations/${id}`)
        .set(admin.auth)
        .send({ value: 'Default market is protected.' })
        .expect(200);
      const updated = await t
        .http()
        .patch('/api/v1/admin/markets/EG?lang=en')
        .set(admin.auth)
        .send({ enabled: false })
        .expect(409);
      expect(updated.body.error.message).toBe('Default market is protected.');
      const audit = await waitForAudit(t, 'translations.update');
      expect(audit).toMatchObject({
        entityId: id,
        before: { value: 'Pick another default market first.' },
        after: { value: 'Default market is protected.' },
      });

      await t.http().delete(`/api/v1/admin/translations/${id}`).set(admin.auth).expect(204);
      const back = await t
        .http()
        .patch('/api/v1/admin/markets/EG?lang=en')
        .set(admin.auth)
        .send({ enabled: false })
        .expect(409);
      expect(back.body.error.message).toContain('The default market cannot be disabled');
    });

    it('sorts the override list by an allowed field and rejects unknown sorts', async () => {
      for (const key of ['b.second', 'a.first']) {
        await t
          .http()
          .post('/api/v1/admin/translations')
          .set(admin.auth)
          .send({ namespace: 'sorttest', key, locale: 'en', value: key })
          .expect(201);
      }
      const keys = async (sort?: string) => {
        const res = await t
          .http()
          .get('/api/v1/admin/translations')
          .query({ namespace: 'sorttest', ...(sort ? { sort } : {}) })
          .set(admin.auth)
          .expect(200);
        return (res.body.data as { key: string }[]).map((r) => r.key);
      };
      expect(await keys()).toEqual(['a.first', 'b.second']);
      expect(await keys('-key')).toEqual(['b.second', 'a.first']);
      expect(await keys('-updatedAt')).toEqual(['a.first', 'b.second']);
      await t.http().get('/api/v1/admin/translations?sort=value').set(admin.auth).expect(422);
    });

    it('applies overrides to generic errors raised without an explicit message', async () => {
      const created = await t
        .http()
        .post('/api/v1/admin/translations')
        .set(admin.auth)
        .send({ namespace: 'errors', key: 'NOT_FOUND', locale: 'en', value: 'Nothing lives here.' })
        .expect(201);
      const en = await t.http().get('/api/v1/no-such-route?lang=en').expect(404);
      expect(en.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Nothing lives here.' });
      const ar = await t.http().get('/api/v1/no-such-route?lang=ar').expect(404);
      expect(ar.body.error.message).not.toBe('Nothing lives here.');
      await t
        .http()
        .delete(`/api/v1/admin/translations/${created.body.data.id as string}`)
        .set(admin.auth)
        .expect(204);
      const back = await t.http().get('/api/v1/no-such-route?lang=en').expect(404);
      expect(back.body.error.message).not.toBe('Nothing lives here.');
    });

    it('stores UI overrides and serves them publicly per language', async () => {
      await t
        .http()
        .post('/api/v1/admin/translations')
        .set(admin.auth)
        .send({
          namespace: 'home',
          key: 'sections.latest_news',
          locale: 'ar',
          value: 'أحدث الأخبار',
        })
        .expect(201);
      await t
        .http()
        .post('/api/v1/admin/translations')
        .set(admin.auth)
        .send({
          namespace: 'home',
          key: 'sections.latest_news',
          locale: 'en',
          value: 'Latest news',
        })
        .expect(201);
      await t
        .http()
        .post('/api/v1/admin/translations')
        .set(normal.auth)
        .send({ namespace: 'home', key: 'x', locale: 'en', value: 'y' })
        .expect(403);

      const ar = await t.http().get('/api/v1/translations?namespaces=home').expect(200);
      expect(ar.body.data).toMatchObject({
        lang: 'ar',
        namespaces: { home: { 'sections.latest_news': 'أحدث الأخبار' } },
      });
      const en = await t.http().get('/api/v1/translations?lang=en').expect(200);
      expect(en.body.data.namespaces.home['sections.latest_news']).toBe('Latest news');
      // Same content (only "home" exists) → same ETag → 304.
      await t.http().get('/api/v1/translations').set('If-None-Match', ar.headers.etag).expect(304);
      const list = await t
        .http()
        .get('/api/v1/admin/translations?namespace=home&locale=en&q=NEWS')
        .set(admin.auth)
        .expect(200);
      expect(list.body.meta).toMatchObject({ total: 1, page: 1 });
      await t.http().get('/api/v1/admin/translations/not-a-uuid').set(admin.auth).expect(404);
    });
  });
});
