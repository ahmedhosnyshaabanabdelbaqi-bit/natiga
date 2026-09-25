import sharp from 'sharp';
import { userWithRoles, waitForAudit, type PlatformUser } from './platform-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

describe('Platform: app-config & settings (e2e)', () => {
  let t: TestApp;
  let admin: PlatformUser;
  let normal: PlatformUser;
  let reader: PlatformUser;

  beforeAll(async () => {
    t = await createTestApp();
    admin = await userWithRoles(t, ['admin', 'user']);
    normal = await userWithRoles(t, ['user']);
    // station_manager has integrations.read but neither settings.read nor settings.write.
    reader = await userWithRoles(t, ['station_manager', 'user']);
  });
  afterAll(async () => {
    await t?.close();
  });

  describe('GET /api/v1/app-config (public)', () => {
    // Own database: other tests in this file change settings (legal URLs,
    // sections, flags…); these assertions are about the seeded defaults.
    let pub: TestApp;
    beforeAll(async () => {
      pub = await createTestApp();
    });
    afterAll(async () => {
      await pub?.close();
    });

    it('returns the contract shape without authentication', async () => {
      const res = await pub.http().get('/api/v1/app-config').expect(200);
      const data = res.body.data as Record<string, unknown>;
      expect(Object.keys(data).sort()).toEqual(
        [
          'branding',
          'defaultLanguage',
          'defaultMarket',
          'features',
          'homeSections',
          'languages',
          'legal',
          'map',
          'markets',
          'share',
        ].sort(),
      );
      expect(data).toMatchObject({
        branding: {
          appName: 'EV Car News',
          logoUrl: null,
          primaryColor: '#0A5CFF',
          accentColor: '#00C2E0',
        },
        languages: ['ar', 'en'],
        defaultLanguage: 'ar',
        defaultMarket: 'EG',
        share: { baseUrl: 'https://evcar.news' },
        legal: { privacyUrl: null, termsUrl: null },
        map: { configured: true, maxZoom: 19 },
      });
      expect(data.markets).toEqual([
        {
          code: 'EG',
          nameAr: 'مصر',
          nameEn: 'Egypt',
          currency: 'EGP',
          timezone: 'Africa/Cairo',
          enabled: true,
        },
        {
          code: 'SA',
          nameAr: 'السعودية',
          nameEn: 'Saudi Arabia',
          currency: 'SAR',
          timezone: 'Asia/Riyadh',
          enabled: true,
        },
        {
          code: 'AE',
          nameAr: 'الإمارات',
          nameEn: 'United Arab Emirates',
          currency: 'AED',
          timezone: 'Asia/Dubai',
          enabled: true,
        },
      ]);
      expect(data.homeSections).toHaveLength(8);
      // Nothing ships yet (IMPLEMENTED_FEATURES is empty) and no routing / LLM is
      // configured in tests → every feature is announced as off.
      expect(Object.values(data.features as Record<string, boolean>).every((v) => !v)).toBe(true);
    });

    it('sends a strong ETag and answers 304 to If-None-Match', async () => {
      const first = await pub.http().get('/api/v1/app-config').expect(200);
      const etag: string = first.headers.etag;
      expect(etag).toMatch(/^"ac-/);
      expect(first.headers['cache-control']).toContain('public');
      const again = await pub.http().get('/api/v1/app-config').set('If-None-Match', etag);
      expect(again.status).toBe(304);
      expect(again.text).toBe('');
    });
  });

  describe('permission enforcement', () => {
    const reads = [
      '/api/v1/admin/settings',
      '/api/v1/admin/settings/branding',
      '/api/v1/admin/system/integrations',
      '/api/v1/admin/system/overview',
      '/api/v1/admin/system/jobs',
      '/api/v1/admin/system/import-jobs',
      '/api/v1/admin/translations',
      '/api/v1/admin/markets',
      '/api/v1/admin/currencies',
    ];

    it.each(reads)('GET %s → 401 without a token', async (path) => {
      const res = await t.http().get(path).expect(401);
      expect(res.body.error.code).toMatch(/UNAUTHORIZED|TOKEN/);
    });

    it.each(reads)('GET %s → 403 for a normal user', async (path) => {
      const res = await t.http().get(path).set(normal.auth).expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('normal users cannot write settings (403) and nothing changes', async () => {
      await t
        .http()
        .put('/api/v1/admin/settings/branding')
        .set(normal.auth)
        .send({ appName: 'Hacked', logoUrl: null, primaryColor: '#000000', accentColor: '#000000' })
        .expect(403);
      await t
        .http()
        .patch('/api/v1/admin/settings/features')
        .set(normal.auth)
        .send({ ads: true })
        .expect(403);
      const cfg = await t.http().get('/api/v1/app-config').expect(200);
      expect(cfg.body.data.branding.appName).toBe('EV Car News');
      const denied = await waitForAudit(t, 'security.permission_denied');
      expect(denied.actorId).toBe(normal.id);
    });

    it('integrations.read without settings.read may read integrations but not settings', async () => {
      await t.http().get('/api/v1/admin/system/integrations').set(reader.auth).expect(200);
      await t.http().get('/api/v1/admin/settings').set(reader.auth).expect(403);
    });
  });

  describe('admin settings CRUD', () => {
    it('lists every typed key with defaults and warnings', async () => {
      const res = await t.http().get('/api/v1/admin/settings').set(admin.auth).expect(200);
      const keys = (res.body.data as { key: string }[]).map((s) => s.key);
      expect(keys).toEqual([
        'branding',
        'defaults',
        'home.sections',
        'features',
        'map',
        'share',
        'legal',
        'app_links',
      ]);
      const map = (res.body.data as { key: string; warnings: string[] }[]).find(
        (s) => s.key === 'map',
      );
      expect(map?.warnings).toContain('osm_public_tile_usage_policy');
      await t.http().get('/api/v1/admin/settings/nope').set(admin.auth).expect(404);
    });

    it('updates branding, audits before/after and invalidates /app-config', async () => {
      const before = await t.http().get('/api/v1/app-config').expect(200);
      const res = await t
        .http()
        .put('/api/v1/admin/settings/branding')
        .set(admin.auth)
        .send({
          appName: 'EV Car News Beta',
          logoUrl: null,
          primaryColor: '#112233',
          accentColor: '#abcdef',
        })
        .expect(200);
      expect(res.body.data).toMatchObject({
        key: 'branding',
        isDefault: false,
        value: { appName: 'EV Car News Beta', primaryColor: '#112233', accentColor: '#ABCDEF' },
      });
      const after = await t.http().get('/api/v1/app-config').expect(200);
      expect(after.body.data.branding).toMatchObject({
        appName: 'EV Car News Beta',
        accentColor: '#ABCDEF',
      });
      expect(after.headers.etag).not.toBe(before.headers.etag);

      const audit = await waitForAudit(t, 'settings.branding.update');
      expect(audit).toMatchObject({
        entityId: 'branding',
        actorId: admin.id,
        before: { appName: 'EV Car News' },
        after: { appName: 'EV Car News Beta' },
      });
    });

    it('rejects invalid values with 422', async () => {
      const bad = await t
        .http()
        .put('/api/v1/admin/settings/branding')
        .set(admin.auth)
        .send({
          appName: 'x',
          logoUrl: 'javascript:alert(1)',
          primaryColor: 'red',
          accentColor: '#000000',
        })
        .expect(422);
      expect(bad.body.error.code).toBe('VALIDATION_FAILED');
      const unknownField = await t
        .http()
        .put('/api/v1/admin/settings/legal')
        .set(admin.auth)
        .send({ privacyUrl: null, termsUrl: null, other: 1 })
        .expect(422);
      expect(unknownField.body.error.code).toBe('VALIDATION_FAILED');
      const map = await t
        .http()
        .put('/api/v1/admin/settings/map')
        .set(admin.auth)
        .set('Accept-Language', 'en')
        .send({
          tileUrlTemplate: 'https://tiles.example.test/{z}/{x}.png',
          attribution: 'x',
          maxZoom: 18,
        })
        .expect(422);
      expect(map.body.error).toMatchObject({
        code: 'SETTING_INVALID',
        message: 'Invalid value for the setting "map". See details.',
      });
      const market = await t
        .http()
        .put('/api/v1/admin/settings/defaults')
        .set(admin.auth)
        .send({ defaultLanguage: 'ar', defaultMarket: 'ZZ', languages: ['ar', 'en'] })
        .expect(422);
      expect(market.body.error.code).toBe('DEFAULT_MARKET_INVALID');
    });

    it('updates home sections, feature flags (partial), legal, share and app links', async () => {
      await t
        .http()
        .put('/api/v1/admin/settings/home-sections')
        .set(admin.auth)
        .send({
          sections: [
            { key: 'interior_tours', enabled: true, order: 1 },
            { key: 'top_story', enabled: true, order: 2 },
            { key: 'reviews', enabled: false, order: 3 },
          ],
        })
        .expect(200);
      await t
        .http()
        .patch('/api/v1/admin/settings/features')
        .set(admin.auth)
        .send({ community: true, tripPlanner: true })
        .expect(200);
      await t
        .http()
        .put('/api/v1/admin/settings/legal')
        .set(admin.auth)
        .send({ privacyUrl: 'https://evcar.news/privacy', termsUrl: 'https://evcar.news/terms' })
        .expect(200);
      await t
        .http()
        .put('/api/v1/admin/settings/share')
        .set(admin.auth)
        .send({
          baseUrl: 'https://evcar.news',
          paths: { article: '/news/{slug}', car: '/cars/{slug}', comparison: '/compare/{shareId}' },
          defaultImageUrl: null,
          language: 'auto',
        })
        .expect(200);
      const fp = Array.from({ length: 32 }, () => 'AB').join(':');
      const links = await t
        .http()
        .put('/api/v1/admin/settings/app-links')
        .set(admin.auth)
        .send({
          androidPackage: 'news.evcar.app',
          androidSha256CertFingerprints: [fp],
          iosTeamId: 'ABCDE12345',
          iosBundleId: 'news.evcar.app',
        })
        .expect(200);
      expect(links.body.data.warnings).toEqual([]);

      const cfg = (await t.http().get('/api/v1/app-config').expect(200)).body.data;
      expect(cfg.homeSections).toEqual([
        { key: 'interior_tours', enabled: true, order: 1 },
        { key: 'top_story', enabled: true, order: 2 },
        { key: 'reviews', enabled: false, order: 3 },
      ]);
      // Stored flags change, but unbuilt modules are never announced to the apps.
      expect(cfg.features).toMatchObject({ community: false, news: false, tripPlanner: false });
      expect(cfg.legal).toEqual({
        privacyUrl: 'https://evcar.news/privacy',
        termsUrl: 'https://evcar.news/terms',
      });
      // app_links is private: never in /app-config.
      expect(JSON.stringify(cfg)).not.toContain('ABCDE12345');

      const features = await t
        .http()
        .get('/api/v1/admin/settings/features')
        .set(admin.auth)
        .expect(200);
      expect(features.body.data.value).toMatchObject({ community: true, tripPlanner: true });
      expect(features.body.data.warnings).toContain('trip_planner_hidden_routing_not_configured');
      expect(features.body.data.warnings).toContain('features_not_implemented_hidden');
    });

    it('uploads a logo (re-encoded PNG served publicly), rejects non-images, removes it', async () => {
      const png = await sharp({
        create: {
          width: 200,
          height: 120,
          channels: 4,
          background: { r: 10, g: 92, b: 255, alpha: 1 },
        },
      })
        .jpeg()
        .toBuffer();
      const res = await t
        .http()
        .post('/api/v1/admin/settings/branding/logo')
        .set(admin.auth)
        .attach('file', png, { filename: 'logo.jpg', contentType: 'image/jpeg' })
        .expect(201);
      const logoUrl = res.body.data.value.logoUrl as string;
      expect(logoUrl).toMatch(/^http:\/\/localhost:3000\/media\/branding\/logo-[0-9a-f]{20}\.png$/);
      const media = await t.http().get(new URL(logoUrl).pathname).expect(200);
      expect(media.headers['content-type']).toBe('image/png');
      const meta = await sharp(media.body as Buffer).metadata();
      expect(meta).toMatchObject({ format: 'png', width: 200, height: 120 });
      expect((await t.http().get('/api/v1/app-config')).body.data.branding.logoUrl).toBe(logoUrl);

      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      );
      const bad = await t
        .http()
        .post('/api/v1/admin/settings/branding/logo')
        .set(admin.auth)
        .attach('file', svg, { filename: 'logo.png', contentType: 'image/png' })
        .expect(422);
      expect(bad.body.error.code).toBe('LOGO_INVALID');

      await t.http().delete('/api/v1/admin/settings/branding/logo').set(admin.auth).expect(200);
      expect((await t.http().get('/api/v1/app-config')).body.data.branding.logoUrl).toBeNull();
      await t.http().get(new URL(logoUrl).pathname).expect(404);
    });

    it('resets a key to its default', async () => {
      const res = await t
        .http()
        .post('/api/v1/admin/settings/branding/reset')
        .set(admin.auth)
        .expect(200);
      expect(res.body.data.value).toMatchObject({
        appName: 'EV Car News',
        primaryColor: '#0A5CFF',
      });
    });
  });
});
