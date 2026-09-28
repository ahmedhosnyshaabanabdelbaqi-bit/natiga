/**
 * Unified search + suggest + admin aliases (REQUIREMENTS §4, ARCHITECTURE §4.7).
 * Fictional test data only.
 */
import { VehicleSearchIndexer } from '../src/modules/vehicles';
import { seedTestCatalog } from './comparisons-helpers';
import { createEntry, createProvider } from './discovery-helpers';
import { userWithRoles, waitForAudit, type PlatformUser } from './platform-helpers';
import { createStation } from './stations-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

interface Hit {
  type: string;
  id: string;
  title: string;
  matchedBy: string;
  highlights: { title: { start: number; end: number }[]; snippet: unknown[] };
  isDemo: boolean;
  details: Record<string, unknown>;
}
interface Group {
  type: string;
  total: number;
  hasMore: boolean;
  items: Hit[];
}
interface SearchBody {
  data: {
    query: string;
    normalizedQuery: string;
    expansions: { term: string; canonical: string }[];
    totalHits: number;
    groups: Group[];
  };
}

describe('discovery: unified search (e2e)', () => {
  let t: TestApp;
  let owner: PlatformUser;
  let plain: PlatformUser;
  let brandId: string;
  let entryHome: string;
  let entryLevel: string;
  let draftEntry: string;
  let stationId: string;
  let sponsoredId: string;

  const search = async (q: string, extra: Record<string, string> = {}) => {
    const res = await t
      .http()
      .get('/api/v1/search')
      .query({ q, lang: 'ar', ...extra })
      .expect(200);
    return (res.body as SearchBody).data;
  };
  const group = (d: SearchBody['data'], type: string) => d.groups.find((g) => g.type === type)!;
  const ids = (d: SearchBody['data'], type: string) => group(d, type).items.map((i) => i.id);

  beforeAll(async () => {
    t = await createTestApp();
    [owner, plain] = await Promise.all([userWithRoles(t, ['owner']), userWithRoles(t, ['user'])]);
    // Fictional synthetic catalog (listed in EG), renamed "Voltrix Aurora" and
    // indexed through the vehicles module's indexer.
    const cat = await seedTestCatalog(t.prisma);
    brandId = cat.brandId;
    await t.prisma.brand.update({
      where: { id: brandId },
      data: { nameEn: 'Voltrix', nameAr: 'فولتريكس' },
    });
    await t.prisma.carModel.update({
      where: { id: cat.modelId },
      data: { nameEn: 'Aurora', nameAr: 'أورورا' },
    });
    await t.app.get(VehicleSearchIndexer).reindexBrand(brandId);

    entryHome = (
      await createEntry(t, {
        titleAr: 'أساسيات الشحن المنزليّ للسيارة الكهربائية',
        titleEn: 'Home charging basics',
      })
    ).id;
    entryLevel = (
      await createEntry(t, { titleAr: 'مستوى البطارية الآمن', categoryKey: 'batteries' })
    ).id;
    draftEntry = (await createEntry(t, { titleAr: 'أساسيات مسودة غير منشورة', status: 'draft' }))
      .id;
    stationId = (await createStation(t, { name: 'محطة اختبار الكورنيش', lat: 30.05, lng: 31.23 }))
      .id;
    await createStation(t, {
      name: 'محطة اختبار مخفية الكورنيش',
      lat: 30.06,
      lng: 31.24,
      publicationStatus: 'hidden',
    });
    sponsoredId = (
      await createProvider(t, { nameAr: 'صيانة كهرباء السيارات ممولة', sponsored: true })
    ).id;
    await createProvider(t, { nameAr: 'صيانة كهرباء السيارات', verified: true });
  });

  afterAll(async () => {
    await t?.close();
  });

  it('returns every group in fixed order with totals', async () => {
    const d = await search('فولتريكس');
    expect(d.groups.map((g) => g.type)).toEqual([
      'articles',
      'brands',
      'models',
      'variants',
      'stations',
      'encyclopedia',
      'services',
    ]);
    expect(ids(d, 'brands')).toContain(brandId);
    expect(group(d, 'brands').items[0].matchedBy).toBe('exact');
    expect(d.totalHits).toBe(d.groups.reduce((n, g) => n + g.total, 0));
  });

  it('normalizes Arabic: أ/ا, ة/ه, ى/ي and diacritics', async () => {
    // "اساسيات" (bare alef) finds "أساسيات"
    expect(ids(await search('اساسيات الشحن'), 'encyclopedia')).toContain(entryHome);
    // ه instead of ة
    expect(ids(await search('للسياره الكهربائيه'), 'encyclopedia')).toContain(entryHome);
    // diacritics in the query, shadda in the title
    expect(ids(await search('الشَّحْن المنزلي'), 'encyclopedia')).toContain(entryHome);
    // ي instead of ى
    expect(ids(await search('مستوي البطاريه'), 'encyclopedia')).toContain(entryLevel);
    // أ in the query matches ا in the index (model "أورورا")
    const d = await search('اورورا');
    expect(
      group(d, 'models')
        .items.map((i) => i.title)
        .join(' '),
    ).toContain('أورورا');
    expect(d.normalizedQuery).toBe('اورورا');
  });

  it('highlights the match inside the original (non-normalized) title', async () => {
    const d = await search('اساسيات');
    const hit = group(d, 'encyclopedia').items.find((i) => i.id === entryHome)!;
    const r = hit.highlights.title[0];
    expect(hit.title.slice(r.start, r.end)).toBe('أساسيات');
  });

  it('never returns unpublished content', async () => {
    const d = await search('مسودة غير منشورة');
    expect(ids(d, 'encyclopedia')).not.toContain(draftEntry);
    const s = await search('الكورنيش');
    expect(ids(s, 'stations')).toEqual([stationId]);
  });

  it('tolerates typos (trigram similarity)', async () => {
    const d = await search('Voltirx', { lang: 'en' });
    const hit = group(d, 'brands').items.find((i) => i.id === brandId);
    expect(hit).toBeDefined();
    expect(hit!.matchedBy).toBe('fuzzy');
  });

  it('station search: ه/ة in "محطه"', async () => {
    expect(ids(await search('محطه اختبار الكورنيش'), 'stations')).toContain(stationId);
  });

  it('directory hits label sponsorship and get no boost', async () => {
    const d = await search('صيانة كهرباء السيارات');
    const items = group(d, 'services').items;
    expect(items.length).toBe(2);
    const sponsored = items.find((i) => i.id === sponsoredId)!;
    expect(sponsored.details.isSponsored).toBe(true);
    expect(sponsored.details.sponsorLabel).toBe('Sponsored (test)');
    // The exact title match (not sponsored) ranks first.
    expect(items[0].id).not.toBe(sponsoredId);
    expect(items[0].details.isSponsored).toBe(false);
  });

  it('types + pagination', async () => {
    const d = await search('اختبار', { types: 'stations', limit: '1' });
    expect(d.groups.map((g) => g.type)).toEqual(['stations']);
    expect(group(d, 'stations').items.length).toBe(1);
  });

  it('rejects invalid input', async () => {
    await t.http().get('/api/v1/search').query({ q: '؟؟؟' }).expect(422);
    await t.http().get('/api/v1/search').query({ q: 'x', types: 'nope' }).expect(422);
    await t
      .http()
      .get('/api/v1/search')
      .query({ q: 'x'.repeat(101) })
      .expect(422);
    await t.http().get('/api/v1/search').expect(422);
  });

  it('is cacheable (public + ETag / 304)', async () => {
    const res = await t.http().get('/api/v1/search').query({ q: 'فولتريكس' }).expect(200);
    expect(res.headers['cache-control']).toContain('public');
    const etag = res.headers.etag;
    expect(etag).toBeTruthy();
    await t
      .http()
      .get('/api/v1/search')
      .query({ q: 'فولتريكس' })
      .set('If-None-Match', etag)
      .expect(304);
  });

  describe('aliases', () => {
    let aliasId: string;

    it('admin routes are permission-guarded', async () => {
      await t.http().get('/api/v1/admin/search-aliases').expect(401);
      await t.http().get('/api/v1/admin/search-aliases').set(plain.auth).expect(403);
    });

    it('an alias makes an alternative spelling find the entity', async () => {
      // before: the transliteration is unknown
      expect(ids(await search('VTX'), 'brands')).not.toContain(brandId);
      const res = await t
        .http()
        .post('/api/v1/admin/search-aliases')
        .set(owner.auth)
        .send({ term: 'VTX', canonical: 'Voltrix', locale: 'en' })
        .expect(201);
      aliasId = res.body.data.id;
      expect(res.body.data.termNormalized).toBe('vtx');
      const audit = await waitForAudit(t, 'search_aliases.create');
      expect(audit.entityId).toBe(aliasId);

      const d = await search('VTX');
      expect(d.expansions).toEqual([{ term: 'VTX', canonical: 'Voltrix' }]);
      const hit = group(d, 'brands').items.find((i) => i.id === brandId)!;
      expect(hit.matchedBy).toBe('alias');
    });

    it('an alias bound to an entity pins it', async () => {
      await t
        .http()
        .post('/api/v1/admin/search-aliases')
        .set(owner.auth)
        .send({
          term: 'شاحن البيت',
          canonical: 'home charger',
          entityType: 'encyclopedia',
          entityId: entryHome,
        })
        .expect(201);
      expect(ids(await search('شاحن البيت'), 'encyclopedia')).toContain(entryHome);
    });

    it('rejects duplicates, identical pairs and unknown entities', async () => {
      const dup = await t
        .http()
        .post('/api/v1/admin/search-aliases')
        .set(owner.auth)
        .send({ term: ' vtx ', canonical: 'voltrix' })
        .expect(409);
      expect(dup.body.error.code).toBe('SEARCH_ALIAS_EXISTS');
      await t
        .http()
        .post('/api/v1/admin/search-aliases')
        .set(owner.auth)
        .send({ term: 'Voltrix', canonical: 'VOLTRIX' })
        .expect(422);
      await t
        .http()
        .post('/api/v1/admin/search-aliases')
        .set(owner.auth)
        .send({
          term: 'x1',
          canonical: 'y1',
          entityType: 'brand',
          entityId: '00000000-0000-4000-8000-000000000000',
        })
        .expect(422);
      await t
        .http()
        .post('/api/v1/admin/search-aliases')
        .set(owner.auth)
        .send({ term: 'x1', canonical: 'y1', entityType: 'brand' })
        .expect(422);
    });

    it('system aliases can only be (de)activated', async () => {
      const list = await t
        .http()
        .get('/api/v1/admin/search-aliases')
        .query({ system: 'true', q: 'تسلا' })
        .set(owner.auth)
        .expect(200);
      const sys = list.body.data[0];
      expect(sys.isSystem).toBe(true);
      await t
        .http()
        .patch(`/api/v1/admin/search-aliases/${sys.id}`)
        .set(owner.auth)
        .send({ term: 'changed' })
        .expect(409);
      await t.http().delete(`/api/v1/admin/search-aliases/${sys.id}`).set(owner.auth).expect(409);
      const off = await t
        .http()
        .patch(`/api/v1/admin/search-aliases/${sys.id}`)
        .set(owner.auth)
        .send({ isActive: false })
        .expect(200);
      expect(off.body.data.isActive).toBe(false);
      await t
        .http()
        .patch(`/api/v1/admin/search-aliases/${sys.id}`)
        .set(owner.auth)
        .send({ isActive: true })
        .expect(200);
    });

    it('deactivated / deleted aliases stop matching', async () => {
      await t
        .http()
        .patch(`/api/v1/admin/search-aliases/${aliasId}`)
        .set(owner.auth)
        .send({ isActive: false })
        .expect(200);
      expect(ids(await search('VTX'), 'brands')).not.toContain(brandId);
      await t.http().delete(`/api/v1/admin/search-aliases/${aliasId}`).set(owner.auth).expect(204);
      await t.http().get(`/api/v1/admin/search-aliases/${aliasId}`).set(owner.auth).expect(404);
    });
  });

  describe('suggest', () => {
    it('suggests alias spellings (typing "تسل" → Tesla) and entities', async () => {
      const res = await t
        .http()
        .get('/api/v1/search/suggest')
        .query({ q: 'تسل', lang: 'ar' })
        .expect(200);
      const q = res.body.data.find((s: { kind: string; text: string }) => s.kind === 'query');
      expect(q?.text).toBe('Tesla');

      const e = await t
        .http()
        .get('/api/v1/search/suggest')
        .query({ q: 'فولتر', lang: 'ar' })
        .expect(200);
      const brand = e.body.data.find((s: { id: string }) => s.id === brandId);
      expect(brand).toMatchObject({ kind: 'entity', type: 'brand' });
      expect(brand.highlights[0]).toEqual({ start: 0, end: 5 });
      expect(e.body.meta.totalPages).toBe(1);
    });
  });

  it('admin index status + reindex', async () => {
    const st = await t.http().get('/api/v1/admin/search/status').set(owner.auth).expect(200);
    const brands = st.body.data.find((r: { entityType: string }) => r.entityType === 'brand');
    expect(brands.indexed).toBeGreaterThanOrEqual(1);
    const re = await t.http().post('/api/v1/admin/search/reindex').set(owner.auth).expect(200);
    expect(re.body.data.models).toBeGreaterThanOrEqual(1);
    await t.http().post('/api/v1/admin/search/reindex').set(plain.auth).expect(403);
  });
});
