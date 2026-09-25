/**
 * Public catalog with the DEMO seed (clearly flagged fictional data): 360°
 * tour summary read from the tours tables, related articles, gallery images
 * (only ready + licensed images), HTTP caching, text search, admin detail
 * view, deletion guards and the search index rebuild.
 */
import { randomUUID } from 'node:crypto';
import { DEMO_IDS as I, runDemoSeed } from '../src/cli/seed-data/demo-seed';
import { STORAGE_PROVIDER } from '../src/providers/provider-tokens';
import type { StorageProvider } from '../src/providers/storage/storage.types';
import { userWithRoles, type PlatformUser } from './platform-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

describe('Vehicles public API with demo data (e2e)', () => {
  let t: TestApp;
  let manager: PlatformUser;
  let admin: PlatformUser;

  beforeAll(async () => {
    t = await createTestApp();
    await runDemoSeed(t.prisma, { storage: t.app.get<StorageProvider>(STORAGE_PROVIDER) });
    [manager, admin] = await Promise.all([
      userWithRoles(t, ['vehicle_data_manager', 'user']),
      userWithRoles(t, ['admin', 'user']),
    ]);
  });
  afterAll(async () => {
    await t?.close();
  });

  const get = (path: string) => t.http().get(`/api/v1${path}`);

  it('lists the demo car flagged as demo, with a 360° tour, and supports 304', async () => {
    const res = await get('/cars?market=EG&lang=en').expect(200);
    const card = res.body.data.find((c: { id: string }) => c.id === I.model);
    expect(card).toMatchObject({ isDemo: true, hasTour: true, slug: 'demo-motors-ev-one' });
    expect(card.brand).toMatchObject({ slug: 'demo-motors' });
    const again = await get('/cars?market=EG&lang=en')
      .set('If-None-Match', res.headers.etag)
      .expect(304);
    expect(again.text).toBe('');

    const search = await get('/cars?market=EG&q=' + encodeURIComponent('ديمو')).expect(200);
    expect(search.body.data.map((c: { id: string }) => c.id)).toContain(I.model);
    const none = await get('/cars?market=EG&q=zzzz-no-such-car').expect(200);
    expect(none.body).toMatchObject({ data: [], meta: { total: 0 } });
  });

  it('model page shows the tour summary and related (demo) articles', async () => {
    const res = await get('/cars/demo-motors-ev-one?market=EG&lang=en').expect(200);
    const d = res.body.data;
    expect(d.tours.available).toBe(true);
    const tour = d.tours.tours[0];
    expect(tour).toMatchObject({
      id: I.tour,
      variantId: I.variantBev,
      marketCode: 'EG',
      isReferenceForSimilarTrim: false,
      differenceNote: null,
      isDemo: true,
    });
    expect(tour.seatScenes.map((s: { position: string }) => s.position)).toEqual([
      'driver',
      'rear',
    ]);
    expect(tour.previewUrl).toMatch(/^http.*\/media\/demo\/panoramas\//);
    expect(d.relatedArticles.map((a: { id: string }) => a.id)).toContain(I.article);

    const bev = d.generations[0].years[0].variants.find(
      (v: { id: string }) => v.id === I.variantBev,
    );
    const phev = d.generations[0].years[0].variants.find(
      (v: { id: string }) => v.id === I.variantPhev,
    );
    expect(bev.hasTour).toBe(true);
    expect(phev.hasTour).toBe(false);

    const sheet = await get(`/variants/${I.variantPhev}?market=EG`).expect(200);
    expect(sheet.body.data.tours).toMatchObject({
      available: false,
      tours: [],
      unavailableLabel: 'الجولة غير متاحة لهذه الفئة',
    });
    // Another market: no tour there
    await t.prisma.variantMarket.create({
      data: { variantId: I.variantBev, marketCode: 'SA', availability: 'available' },
    });
    const sa = await get(`/variants/${I.variantBev}?market=SA`).expect(200);
    expect(sa.body.data.tours.available).toBe(false);
  });

  it('galleries accept only ready, licensed images and show them publicly', async () => {
    const license = await t.prisma.assetLicense.create({
      data: {
        licenseType: 'owned',
        rightsHolder: 'EV Car News (test)',
        attributionText: 'Test credit',
      },
    });
    const mk = (over: Record<string, unknown>) =>
      t.prisma.mediaAsset.create({
        data: {
          kind: 'image',
          status: 'ready',
          storageDriver: 'local',
          storageKey: `public/test/vehicles/${randomUUID()}.jpg`,
          width: 1600,
          height: 900,
          licenseId: license.id,
          altTextEn: 'Test image',
          altTextAr: 'صورة اختبار',
          isDemo: true,
          ...over,
        },
      });
    const good = await mk({});
    const unlicensed = await mk({ licenseId: null });
    const processing = await mk({ status: 'processing' });
    const panorama = await mk({ kind: 'panorama', projection: 'equirectangular' });

    const post = (body: object) =>
      t.http().post('/api/v1/admin/vehicle-media').set(manager.auth).send(body);
    for (const bad of [unlicensed, processing, panorama]) {
      const r = await post({ modelId: I.model, assetId: bad.id }).expect(422);
      expect(r.body.error.details[0].field).toBe('assetId');
    }
    await post({ modelId: I.model, variantId: I.variantBev, assetId: good.id }).expect(422);
    const created = await post({
      modelId: I.model,
      assetId: good.id,
      isCover: true,
      captionEn: 'Front view',
    }).expect(201);
    expect(created.body.data.image).toMatchObject({ credit: 'Test credit', caption: 'Front view' });

    const page = await get('/cars/demo-motors-ev-one?lang=ar').expect(200);
    expect(page.body.data.heroImage).toMatchObject({
      id: good.id,
      alt: 'صورة اختبار',
      licenseType: 'owned',
    });
    const list = await get('/cars?lang=en').expect(200);
    expect(list.body.data.find((c: { id: string }) => c.id === I.model).image.id).toBe(good.id);

    // The file loses its licence later → hidden publicly (admin view shows image null)
    await t.prisma.mediaAsset.update({ where: { id: good.id }, data: { licenseId: null } });
    const hidden = await get('/cars/demo-motors-ev-one').expect(200);
    expect(hidden.body.data.images).toEqual([]);
    const adminList = await t
      .http()
      .get(`/api/v1/admin/vehicle-media?modelId=${I.model}`)
      .set(manager.auth)
      .expect(200);
    expect(adminList.body.data[0]).toMatchObject({ assetId: good.id, image: null });
  });

  it('admin variant detail and deletion guards', async () => {
    const d = await t
      .http()
      .get(`/api/v1/admin/variants/${I.variantBev}`)
      .set(manager.auth)
      .expect(200);
    expect(d.body.data).toMatchObject({
      id: I.variantBev,
      isDemo: true,
      tourCount: 1,
      visibilityBlockers: [],
    });
    expect(d.body.data.markets.map((m: { marketCode: string }) => m.marketCode)).toContain('EG');
    expect(d.body.data.specs.length).toBeGreaterThan(0);

    // Used by the curated demo comparison → cannot remove the EG market row
    const inUse = await t
      .http()
      .delete(`/api/v1/admin/variants/${I.variantBev}/markets/EG`)
      .set(manager.auth)
      .expect(409);
    expect(inUse.body.error.details.counts).toMatchObject({ comparisons: 1, publishedTours: 1 });

    const source = await t
      .http()
      .delete(`/api/v1/admin/spec-sources/${I.source}`)
      .set(admin.auth)
      .expect(409);
    expect(source.body.error.code).toBe('IN_USE');

    const defs = await t.http().get('/api/v1/admin/spec-definitions').set(manager.auth).expect(200);
    expect(
      defs.body.data.find((x: { key: string }) => x.key === 'battery.usable_kwh'),
    ).toMatchObject({
      unit: 'kWh',
      dataType: 'number',
    });
  });

  it('reports incomplete / stale data of a market', async () => {
    const res = await t
      .http()
      .get('/api/v1/admin/vehicles/data-quality?marketCode=EG')
      .set(manager.auth)
      .expect(200);
    expect(res.body.meta.summary).toMatchObject({ marketCode: 'EG', stalePriceDays: 365 });
    expect(res.body.meta.summary.variants).toBeGreaterThanOrEqual(2);
    const bev = res.body.data.find((r: { variantId: string }) => r.variantId === I.variantBev);
    expect(bev.issues).toContain('missing_key_specs');
    expect(bev.missingKeySpecs).toContain('performance.torque_nm');
    const onlyPrice = await t
      .http()
      .get('/api/v1/admin/vehicles/data-quality?marketCode=EG&issue=no_local_price')
      .set(manager.auth)
      .expect(200);
    expect(
      onlyPrice.body.data.every((r: { issues: string[] }) => r.issues.includes('no_local_price')),
    ).toBe(true);
    expect(onlyPrice.body.data.map((r: { variantId: string }) => r.variantId)).toContain(
      I.variantPhev,
    );
  });

  it('rebuilds the search index for published cars', async () => {
    const res = await t
      .http()
      .post('/api/v1/admin/vehicles/search-index/rebuild')
      .set(manager.auth)
      .expect(200);
    expect(res.body.data.models).toBeGreaterThan(0);
    const docs = await t.prisma.searchDocument.findMany({
      where: { entityType: 'variant', entityId: I.variantBev },
    });
    expect(docs.map((x) => x.locale).sort()).toEqual(['ar', 'en']);
    expect(docs[0].marketCodes.sort()).toEqual(['EG', 'SA']);
  });
});
