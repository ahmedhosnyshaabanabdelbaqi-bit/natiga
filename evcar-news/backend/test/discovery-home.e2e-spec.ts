/**
 * GET /home (REQUIREMENTS §4): admin-controlled order / visibility, feature
 * flags, location-only nearby stations, personalization that never hides
 * browse-all, cache headers + ETag. Fictional test data only.
 *
 * The effective feature flags come from /app-config, where every flag is
 * forced off until its module is listed in IMPLEMENTED_FEATURES (settings
 * module). The spec overrides HomeFlagsService to exercise both states.
 */
import { HomeFlagsService } from '../src/modules/home/services/home-flags.service';
import { HomeService } from '../src/modules/home/services/home.service';
import { SettingsService, type FeatureFlag } from '../src/modules/settings';
import { publishArticle, newsStaff, type NewsStaff } from './articles-helpers';
import { seedTestCatalog, type TestCatalog } from './comparisons-helpers';
import { createEntry } from './discovery-helpers';
import { userWithRoles, type PlatformUser } from './platform-helpers';
import { createStation } from './stations-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

interface Section {
  key: string;
  order: number;
  title: string;
  itemType: string;
  state: string;
  items: { id: string; [k: string]: unknown }[];
  browse: { resource: string; params: Record<string, string> };
}
interface HomeBody {
  data: {
    personalized: boolean;
    sections: Section[];
    hiddenSections: { key: string; reason: string }[];
  };
}

describe('discovery: home (e2e)', () => {
  let t: TestApp;
  const features: Partial<Record<FeatureFlag, boolean>> = {
    news: true,
    cars: true,
    comparisons: true,
    interiorTours: true,
    stations: true,
    encyclopedia: true,
  };
  let staff: NewsStaff;
  let owner: PlatformUser;
  let reader: PlatformUser;
  let cat: TestCatalog;
  let guideId: string;
  let unreviewedId: string;
  let stationId: string;
  let brandArticle: string;

  const home = async (query: Record<string, string> = {}, auth?: PlatformUser) => {
    const req = t
      .http()
      .get('/api/v1/home')
      .query({ lang: 'en', ...query });
    if (auth) req.set(auth.auth);
    const res = await req.expect(200);
    return { body: (res.body as HomeBody).data, res };
  };
  const section = (d: HomeBody['data'], key: string) => d.sections.find((s) => s.key === key);
  const invalidate = () => t.app.get(HomeService).invalidate();

  beforeAll(async () => {
    t = await createTestApp({
      override: (b) =>
        b.overrideProvider(HomeFlagsService).useFactory({
          factory: (settings: SettingsService) => ({
            features: () => Promise.resolve({ ...features }),
            sections: () => settings.get('home.sections'),
          }),
          inject: [SettingsService],
        }),
    });
    [staff, owner, reader] = await Promise.all([
      newsStaff(t),
      userWithRoles(t, ['owner']),
      userWithRoles(t, ['user']),
    ]);
    cat = await seedTestCatalog(t.prisma);
    // Published first (older), so it is not the top story.
    brandArticle = (
      await publishArticle(t, staff, { vehicleLinks: [{ type: 'brand', id: cat.brandId }] })
    ).id;
    await publishArticle(t, staff, { type: 'review' });
    await publishArticle(t, staff);
    guideId = (await createEntry(t, { titleEn: 'Home charging guide (test)' })).id;
    unreviewedId = (
      await createEntry(t, { titleEn: 'Unreviewed guide (test)', status: 'in_review' })
    ).id;
    stationId = (await createStation(t, { lat: 29.9, lng: 31.1 })).id;
    invalidate();
  });

  afterAll(async () => {
    await t?.close();
  });

  it('guest home follows the configured order; nearby stations need a location', async () => {
    const { body, res } = await home();
    expect(body.sections.map((s) => s.key)).toEqual([
      'top_story',
      'latest_news',
      'interior_tours',
      'new_cars',
      'featured_comparisons',
      'reviews',
      'nearby_stations',
      'charging_guides',
    ]);
    expect(body.sections.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(body.personalized).toBe(false);
    expect(body.hiddenSections).toEqual([]);

    const top = section(body, 'top_story')!;
    expect(top.items).toHaveLength(1);
    const latest = section(body, 'latest_news')!;
    expect(latest.items.map((a) => a.id)).not.toContain(top.items[0].id);
    expect(section(body, 'reviews')!.items.every((a) => a.type === 'review')).toBe(true);
    expect(section(body, 'new_cars')!.itemType).toBe('car');
    expect(section(body, 'new_cars')!.items.length).toBeGreaterThan(0);

    const nearby = section(body, 'nearby_stations')!;
    expect(nearby).toMatchObject({ state: 'location_required', items: [] });

    const guides = section(body, 'charging_guides')!;
    const guideIds = guides.items.map((g) => g.id);
    expect(guideIds).toContain(guideId);
    expect(guideIds).not.toContain(unreviewedId);

    expect(res.headers['cache-control']).toContain('public');
    expect(res.headers.etag).toBeTruthy();
    await t
      .http()
      .get('/api/v1/home')
      .query({ lang: 'en' })
      .set('If-None-Match', res.headers.etag)
      .expect(304);
  });

  it('nearby stations with a point (private response)', async () => {
    const { body, res } = await home({ lat: '29.9', lng: '31.1' });
    const nearby = section(body, 'nearby_stations')!;
    expect(nearby.state).toBe('ok');
    expect(nearby.items.map((s) => s.id)).toContain(stationId);
    expect(nearby.browse.params).toEqual({ lat: '29.9', lng: '31.1' });
    expect(res.headers['cache-control']).toBe('private, no-cache');
    await t.http().get('/api/v1/home').query({ lat: '29.9' }).expect(422);
  });

  it('admin order + visibility changes apply', async () => {
    await t
      .http()
      .put('/api/v1/admin/settings/home-sections')
      .set(owner.auth)
      .send({
        sections: [
          { key: 'charging_guides', enabled: true, order: 1 },
          { key: 'top_story', enabled: true, order: 2 },
          { key: 'latest_news', enabled: true, order: 3 },
          { key: 'reviews', enabled: false, order: 4 },
          { key: 'new_cars', enabled: true, order: 5 },
          { key: 'featured_comparisons', enabled: true, order: 6 },
          { key: 'interior_tours', enabled: true, order: 7 },
          { key: 'nearby_stations', enabled: true, order: 8 },
        ],
      })
      .expect(200);
    const { body } = await home();
    expect(body.sections[0].key).toBe('charging_guides');
    expect(body.sections.map((s) => s.key)).not.toContain('reviews');
    expect(body.hiddenSections).toContainEqual({ key: 'reviews', reason: 'disabled_by_admin' });
  });

  it('sections of a disabled feature are hidden', async () => {
    features.interiorTours = false;
    features.stations = false;
    try {
      const { body } = await home();
      expect(body.sections.map((s) => s.key)).not.toContain('interior_tours');
      expect(body.hiddenSections).toEqual(
        expect.arrayContaining([
          { key: 'interior_tours', reason: 'feature_off' },
          { key: 'nearby_stations', reason: 'feature_off' },
        ]),
      );
    } finally {
      features.interiorTours = true;
      features.stations = true;
    }
  });

  it('interests add a "for you" section without hiding anything', async () => {
    const guest = await home();
    await t
      .http()
      .put('/api/v1/me/interests')
      .set(reader.auth)
      .send({ brandIds: [cat.brandId], modelIds: [], categoryIds: [] })
      .expect(200);
    const mine = await t.http().get('/api/v1/me/interests').set(reader.auth).expect(200);
    expect(mine.body.data.brands.map((b: { id: string }) => b.id)).toEqual([cat.brandId]);

    const { body, res } = await home({}, reader);
    expect(body.personalized).toBe(true);
    const keys = body.sections.map((s) => s.key);
    expect(keys.indexOf('for_you')).toBe(keys.indexOf('top_story') + 1);
    // Every regular section is still there.
    for (const s of guest.body.sections) expect(keys).toContain(s.key);
    const forYou = section(body, 'for_you')!;
    expect(section(body, 'top_story')!.items[0].id).not.toBe(brandArticle);
    expect(forYou.items.map((a) => a.id)).toEqual([brandArticle]);
    expect(res.headers['cache-control']).toBe('private, no-cache');
  });

  it('interests validation', async () => {
    await t.http().get('/api/v1/me/interests').expect(401);
    const res = await t
      .http()
      .put('/api/v1/me/interests')
      .set(reader.auth)
      .send({ brandIds: ['00000000-0000-4000-8000-000000000000'], modelIds: [], categoryIds: [] })
      .expect(422);
    expect(res.body.error.details[0].field).toBe('brandIds[0]');
  });
});
