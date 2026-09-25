/**
 * Comparisons API (REQUIREMENTS §7, §22) against a synthetic test catalog:
 * compute rules end to end (cycles, SoC windows, PHEV electric vs total,
 * currencies, missing values never 0, original units), item validation,
 * save / share / isolation, featured comparisons (admin) and counters.
 */
import { item, seedTestCatalog, type TestCatalog } from './comparisons-helpers';
import { userWithRoles, waitForAudit, type PlatformUser } from './platform-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

interface Val {
  carKey: string;
  status: string;
  value: unknown;
  unit: string | null;
  originalValue: string | null;
  originalUnit: string | null;
  condition: Record<string, unknown> | null;
}
interface Row {
  key: string;
  comparability: string;
  outcome: string;
  winners: string[];
  betterDirection: string;
  isDifferent: boolean;
  isKey: boolean;
  comparabilityNote: string | null;
  basis: Record<string, unknown> | null;
  values: Val[];
}
interface Result {
  cars: {
    key: string;
    modelYearId: string;
    title: string;
    price: unknown;
    market: { code: string };
  }[];
  groups: { key: string; metrics: Row[] }[];
  warnings: { code: string }[];
  sponsored: boolean;
  disclosure: string;
  summary: { winsByCar: { carKey: string; wins: number }[] };
}

const rows = (r: Result): Row[] => r.groups.flatMap((g) => g.metrics);
const row = (r: Result, key: string): Row => {
  const m = rows(r).find((x) => x.key === key);
  if (!m) throw new Error(`row ${key} missing`);
  return m;
};

describe('Comparisons API (e2e)', () => {
  let t: TestApp;
  let cat: TestCatalog;
  let alice: PlatformUser;
  let bob: PlatformUser;
  let editor: PlatformUser;
  let admin: PlatformUser;
  const k = (id: string, m = 'EG') => `${id}@${m}`;

  beforeAll(async () => {
    t = await createTestApp();
    cat = await seedTestCatalog(t.prisma);
    [alice, bob, editor, admin] = await Promise.all([
      userWithRoles(t, ['user']),
      userWithRoles(t, ['user']),
      userWithRoles(t, ['editor', 'user']),
      userWithRoles(t, ['admin', 'user']),
    ]);
  });
  afterAll(async () => {
    await t?.close();
  });

  const compute = (body: object, query = '') =>
    t.http().post(`/api/v1/comparisons/compute${query}`).send(body);

  describe('compute', () => {
    it('compares two BEVs on the same cycle and SoC window with winners, provenance and original units', async () => {
      const res = await compute({ items: [item(cat.a), item(cat.b)] }, '?lang=en').expect(200);
      const r = res.body.data as Result;
      expect(res.headers['cache-control']).toBe('no-store');
      expect(r.sponsored).toBe(false);
      expect(r.disclosure).toMatch(/never change/);
      expect(r.cars.map((c) => c.key)).toEqual([k(cat.a), k(cat.b)]);
      expect(r.cars[0]).toMatchObject({
        modelYearId: cat.modelYear2025,
        title: 'E2E Volt One 2025 A Long Range',
        market: { code: 'EG' },
      });
      expect(r.groups.map((g) => g.key)).toEqual([
        'price',
        'range',
        'battery',
        'consumption',
        'charging',
        'performance',
        'space',
        'safety',
        'warranty',
        'features',
      ]);

      const range = row(r, 'range.electric');
      expect(range).toMatchObject({
        comparability: 'comparable',
        outcome: 'winner',
        winners: [k(cat.a)],
        basis: { cycle: 'WLTP' },
      });
      expect(range.values[1]).toMatchObject({
        value: 399.9,
        unit: 'km',
        originalValue: '248.5',
        originalUnit: 'mi',
        condition: { cycle: 'WLTP', rangeType: 'electric' },
      });
      expect(row(r, 'price.current')).toMatchObject({
        winners: [k(cat.b)],
        comparability: 'comparable',
      });
      expect(row(r, 'price.current').values[0]).toMatchObject({
        value: '1500000.00',
        unit: 'EGP',
        condition: { priceType: 'official_msrp', currency: 'EGP' },
      });
      const battery = row(r, 'battery.usable_kwh');
      expect(battery).toMatchObject({
        betterDirection: 'none',
        outcome: 'no_winner',
        isDifferent: true,
      });
      expect(row(r, 'charging.dc_time')).toMatchObject({
        winners: [k(cat.a)],
        basis: { socWindow: '10–80%' },
      });
      expect(row(r, 'charging.dc_peak_kw')).toMatchObject({ winners: [k(cat.a)] });
      expect(row(r, 'charging.dc_average_kw').values.map((v) => v.value)).toEqual([110, 70]);
      expect(row(r, 'performance.accel_0_100_s')).toMatchObject({
        betterDirection: 'lower',
        winners: [k(cat.a)],
      });
      // Missing values are null, never 0.
      const airbags = row(r, 'safety.airbags');
      expect(airbags.values.map((v) => [v.status, v.value])).toEqual([
        ['missing', null],
        ['missing', null],
      ]);
      expect(airbags.outcome).toBe('no_winner');
    });

    it('mixed cycles and different SoC windows → not comparable, no winner, nothing converted', async () => {
      const r = (await compute({ items: [item(cat.a), item(cat.c)] }, '?lang=en').expect(200)).body
        .data as Result;
      const range = row(r, 'range.electric');
      expect(range).toMatchObject({
        comparability: 'not_comparable_cycles',
        outcome: 'no_winner',
        winners: [],
      });
      expect(range.values.map((v) => [v.value, v.condition?.cycle])).toEqual([
        [520, 'WLTP'],
        [600, 'CLTC'],
      ]);
      expect(range.comparabilityNote).toMatch(/never converted/);
      expect(row(r, 'charging.dc_time')).toMatchObject({
        comparability: 'not_comparable_soc_window',
        outcome: 'no_winner',
      });
      expect(row(r, 'consumption.electricity').comparability).toBe('not_comparable_cycles');
    });

    it('BEV vs PHEV keeps electric and total range apart and marks what does not apply', async () => {
      const r = (await compute({ items: [item(cat.a), item(cat.d)] }).expect(200)).body
        .data as Result;
      expect(row(r, 'range.electric').values.map((v) => v.value)).toEqual([520, 90]);
      const total = row(r, 'range.total');
      expect(total.comparability).toBe('not_applicable');
      expect(total.values[0]).toMatchObject({ status: 'not_applicable', value: null });
      expect(total.values[1]).toMatchObject({ value: 900, condition: { rangeType: 'total' } });
      expect(row(r, 'consumption.fuel').values[0].status).toBe('not_applicable');
      expect(row(r, 'consumption.electricity').comparability).toBe('not_comparable_conditions');
      // The PHEV has an AC inlet only in this market → DC does not apply (not 0, not missing).
      expect(row(r, 'charging.dc_peak_kw').values[1]).toMatchObject({
        status: 'not_applicable',
        value: null,
      });
      expect(r.warnings.map((w) => w.code)).toEqual(
        expect.arrayContaining(['MIXED_POWERTRAINS', 'DEMO_DATA']),
      );
      // Arabic labels
      const ar = (await compute({ items: [item(cat.a), item(cat.d)] }, '?lang=ar').expect(200)).body
        .data as Result & { groups: { label: string }[] };
      expect(ar.groups[0].label).toBe('السعر');
    });

    it('same trim in two markets: prices in different currencies are never compared', async () => {
      const r = (await compute({ items: [item(cat.a, 'EG'), item(cat.a, 'SA')] }).expect(200)).body
        .data as Result;
      const price = row(r, 'price.current');
      expect(price).toMatchObject({ comparability: 'different_currency', outcome: 'no_winner' });
      expect(price.values.map((v) => [v.value, v.unit])).toEqual([
        ['1500000.00', 'EGP'],
        ['150000.00', 'SAR'],
      ]);
      expect(r.warnings.map((w) => w.code)).toContain('MIXED_MARKETS');
    });

    it('a missing price is Not available (null), never a free car', async () => {
      const r = (await compute({ items: [item(cat.a), item(cat.e)] }).expect(200)).body
        .data as Result;
      const price = row(r, 'price.current');
      expect(price.comparability).toBe('missing_data');
      expect(price.values[1]).toMatchObject({ status: 'missing', value: null });
      expect(r.cars[1].price).toBeNull();
    });

    it('summary view and differences only', async () => {
      const summary = (
        await compute({ items: [item(cat.a), item(cat.b)], view: 'summary' }).expect(200)
      ).body.data as Result;
      expect(rows(summary).every((m) => m.isKey)).toBe(true);
      expect(rows(summary).map((m) => m.key)).toEqual(
        expect.arrayContaining(['price.current', 'range.electric', 'charging.dc_peak_kw']),
      );
      const diff = (
        await compute({ items: [item(cat.a), item(cat.b)], differencesOnly: true }).expect(200)
      ).body.data as Result;
      expect(rows(diff).every((m) => m.isDifferent)).toBe(true);
      expect(rows(diff).map((m) => m.key)).not.toContain('safety.airbags');
    });

    it('validates items: count, duplicates, year, market record, publication', async () => {
      const err = async (body: object) => (await compute(body).expect(422)).body.error;
      expect((await err({ items: [item(cat.a)] })).code).toBe('VALIDATION_FAILED');
      await err({ items: [item(cat.a), item(cat.b), item(cat.c), item(cat.d), item(cat.e)] });
      const fields = async (body: object) =>
        ((await err(body)).details as { field: string; constraints: Record<string, string> }[]).map(
          (d) => [d.field, Object.keys(d.constraints)[0]],
        );
      expect(await fields({ items: [item(cat.a), item(cat.a)] })).toEqual([
        ['items.1', 'duplicate'],
      ]);
      expect(await fields({ items: [item(cat.a, 'EG', 2026), item(cat.b)] })).toEqual([
        ['items.0.modelYear', 'mismatch'],
      ]);
      expect(
        await fields({
          items: [{ variantId: cat.a, modelYearId: cat.modelYear2026, market: 'EG' }, item(cat.b)],
        }),
      ).toEqual([['items.0.modelYearId', 'mismatch']]);
      expect(await fields({ items: [{ variantId: cat.a, market: 'EG' }, item(cat.b)] })).toEqual([
        ['items.0.modelYear', 'required'],
      ]);
      expect(await fields({ items: [item(cat.draft), item(cat.b)] })).toEqual([
        ['items.0.variantId', 'notFound'],
      ]);
      expect(await fields({ items: [item(cat.a, 'AE'), item(cat.b)] })).toEqual([
        ['items.0.market', 'notInMarket'],
      ]);
      expect(await fields({ items: [item(cat.a, 'ZZ'), item(cat.b)] })).toEqual([
        ['items.0.market', 'unknownMarket'],
      ]);
      // modelYearId accepted instead of the year number; lower-case market normalized
      await compute({
        items: [{ variantId: cat.a, modelYearId: cat.modelYear2025, market: 'eg' }, item(cat.b)],
      }).expect(200);
      // unknown fields are rejected
      await compute({ items: [item(cat.a), item(cat.b)], sponsorBoost: 1 }).expect(422);
    });

    it('counts each trim once per client and comparison (anonymous counters)', async () => {
      const before = await t.prisma.contentDailyStat.findMany({
        where: { entityType: 'variant', entityId: { in: [cat.b, cat.c] } },
      });
      const sum = (rs: { comparisons: number }[]) => rs.reduce((s, x) => s + x.comparisons, 0);
      const ua = 'counter-test-agent';
      await compute({ items: [item(cat.b), item(cat.c)] })
        .set('User-Agent', ua)
        .expect(200);
      await compute({ items: [item(cat.b), item(cat.c)] })
        .set('User-Agent', ua)
        .expect(200);
      const after = await t.prisma.contentDailyStat.findMany({
        where: { entityType: 'variant', entityId: { in: [cat.b, cat.c] } },
      });
      expect(sum(after) - sum(before)).toBe(2); // +1 per trim, second request deduped
    });
  });

  describe('save / share / isolation', () => {
    it('guest share link: created once, reused when identical, opened publicly', async () => {
      const body = { items: [item(cat.a), item(cat.b)] };
      const first = await t.http().post('/api/v1/comparisons?lang=en').send(body).expect(201);
      const c = first.body.data;
      expect(c).toMatchObject({
        kind: 'shared',
        saved: false,
        reused: false,
        isMine: false,
        title: null,
      });
      expect(c.shareId).toMatch(/^[A-Za-z0-9_-]{6,24}$/);
      expect(c.shareUrl).toBe(`https://evcar.news/compare/${c.shareId}`);
      expect(c.items.map((i: { variantId: string }) => i.variantId)).toEqual([cat.a, cat.b]);
      expect(c.displayTitle).toBe('E2E Volt One vs E2E Volt One');
      const again = await t.http().post('/api/v1/comparisons').send(body).expect(200);
      expect(again.body.data).toMatchObject({ shareId: c.shareId, reused: true });
      const row = await t.prisma.comparison.findUniqueOrThrow({ where: { id: c.id } });
      expect(row.userId).toBeNull();

      const opened = await t
        .http()
        .get(`/api/v1/comparisons/s/${c.shareId}?lang=en&view=summary`)
        .set('User-Agent', 'share-open')
        .expect(200);
      expect(opened.body.data.comparison).toMatchObject({ id: c.id, kind: 'shared' });
      expect(opened.body.data.result.view).toBe('summary');
      expect(opened.body.data.unavailableItems).toEqual([]);
      expect((await t.prisma.comparison.findUniqueOrThrow({ where: { id: c.id } })).viewCount).toBe(
        1,
      );
      await t.http().get('/api/v1/comparisons/s/nope-not-there').expect(404);
      await t.http().get('/api/v1/comparisons/s/bad%20id').expect(404);
    });

    it('signed-in users save to their account; others can neither list, read nor delete it', async () => {
      const created = await t
        .http()
        .post('/api/v1/comparisons')
        .set(alice.auth)
        .send({ items: [item(cat.b), item(cat.a)], title: 'My shortlist' })
        .expect(201);
      const c = created.body.data;
      expect(c).toMatchObject({ kind: 'saved', saved: true, isMine: true, title: 'My shortlist' });
      expect((await t.prisma.comparison.findUniqueOrThrow({ where: { id: c.id } })).userId).toBe(
        alice.id,
      );
      // identical → reused (title updated)
      const again = await t
        .http()
        .post('/api/v1/comparisons')
        .set(alice.auth)
        .send({ items: [item(cat.b), item(cat.a)], title: 'Renamed' })
        .expect(200);
      expect(again.body.data).toMatchObject({ id: c.id, reused: true, title: 'Renamed' });

      const mine = await t.http().get('/api/v1/me/comparisons').set(alice.auth).expect(200);
      expect(mine.body.meta).toMatchObject({ total: 1, page: 1 });
      expect(mine.body.data[0]).toMatchObject({ id: c.id, displayTitle: 'Renamed' });
      const bobs = await t.http().get('/api/v1/me/comparisons').set(bob.auth).expect(200);
      expect(bobs.body.data).toEqual([]);
      await t.http().get(`/api/v1/me/comparisons/${c.id}`).set(bob.auth).expect(404);
      await t
        .http()
        .patch(`/api/v1/me/comparisons/${c.id}`)
        .set(bob.auth)
        .send({ title: 'x' })
        .expect(404);
      await t.http().delete(`/api/v1/me/comparisons/${c.id}`).set(bob.auth).expect(404);
      await t.http().get('/api/v1/me/comparisons').expect(401);

      // The share link works for others but never reveals the owner's label.
      const asBob = await t
        .http()
        .get(`/api/v1/comparisons/s/${c.shareId}`)
        .set(bob.auth)
        .expect(200);
      expect(asBob.body.data.comparison).toMatchObject({
        isMine: false,
        title: null,
        kind: 'saved',
      });
      expect(JSON.stringify(asBob.body)).not.toContain(alice.id);
      const asAlice = await t
        .http()
        .get(`/api/v1/comparisons/s/${c.shareId}`)
        .set(alice.auth)
        .expect(200);
      expect(asAlice.body.data.comparison).toMatchObject({ isMine: true, title: 'Renamed' });

      const detail = await t
        .http()
        .get(`/api/v1/me/comparisons/${c.id}?lang=en`)
        .set(alice.auth)
        .expect(200);
      expect(detail.body.data.result.cars.map((x: { key: string }) => x.key)).toEqual([
        k(cat.b),
        k(cat.a),
      ]);
      const renamed = await t
        .http()
        .patch(`/api/v1/me/comparisons/${c.id}`)
        .set(alice.auth)
        .send({ title: null })
        .expect(200);
      expect(renamed.body.data.title).toBeNull();

      await t.http().delete(`/api/v1/me/comparisons/${c.id}`).set(alice.auth).expect(204);
      await t.http().get(`/api/v1/me/comparisons/${c.id}`).set(alice.auth).expect(404);
      await t.http().get(`/api/v1/comparisons/s/${c.shareId}`).expect(404);
    });

    it('a trim unpublished later is reported as unavailable (no draft data leaks)', async () => {
      const c = (
        await t
          .http()
          .post('/api/v1/comparisons')
          .set(bob.auth)
          .send({ items: [item(cat.c), item(cat.b)] })
          .expect(201)
      ).body.data;
      await t.prisma.vehicleVariant.update({ where: { id: cat.c }, data: { status: 'draft' } });
      try {
        const res = await t.http().get(`/api/v1/comparisons/s/${c.shareId}`).expect(200);
        expect(res.body.data.result).toBeNull();
        expect(res.body.data.unavailableItems).toEqual([
          expect.objectContaining({ variantId: cat.c, available: false, title: null, image: null }),
        ]);
      } finally {
        await t.prisma.vehicleVariant.update({
          where: { id: cat.c },
          data: { status: 'published' },
        });
      }
    });

    it('a stale token never turns an intended save into a guest share (401 TOKEN_EXPIRED)', async () => {
      const res = await t
        .http()
        .post('/api/v1/comparisons')
        .set('Authorization', 'Bearer not-a-valid-token')
        .send({ items: [item(cat.c), item(cat.d)] })
        .expect(401);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('rejects bad bodies for saving (422)', async () => {
      await t
        .http()
        .post('/api/v1/comparisons')
        .send({ items: [item(cat.a)] })
        .expect(422);
      await t
        .http()
        .post('/api/v1/comparisons')
        .set(alice.auth)
        .send({ items: [item(cat.a), item(cat.b)], title: 'x'.repeat(201) })
        .expect(422);
    });
  });

  describe('featured comparisons (admin) and reports', () => {
    it('only comparisons.curate may manage featured comparisons', async () => {
      await t.http().get('/api/v1/admin/comparisons').set(alice.auth).expect(403);
      await t.http().get('/api/v1/admin/comparisons').expect(401);
      await t
        .http()
        .post('/api/v1/admin/comparisons')
        .set(alice.auth)
        .send({ items: [item(cat.a), item(cat.b)], marketCode: 'EG' })
        .expect(403);
    });

    it('draft → publish (needs ar + en titles) → featured on the market home → delete', async () => {
      const created = await t
        .http()
        .post('/api/v1/admin/comparisons?lang=en')
        .set(editor.auth)
        .send({ items: [item(cat.a), item(cat.b)], marketCode: 'EG' })
        .expect(201);
      const c = created.body.data;
      expect(c).toMatchObject({ kind: 'curated', status: 'draft', titleAr: null, isDemo: true });
      const audit = await waitForAudit(t, 'comparisons.curated.create');
      expect(audit).toMatchObject({ entityId: c.id, actorId: editor.id });

      // Draft is neither featured nor openable.
      await t.http().get(`/api/v1/comparisons/s/${c.shareId}`).expect(404);
      const none = await t.http().get('/api/v1/comparisons/featured?market=EG').expect(200);
      expect(none.body.data.map((x: { id: string }) => x.id)).not.toContain(c.id);

      const bad = await t
        .http()
        .patch(`/api/v1/admin/comparisons/${c.id}`)
        .set(editor.auth)
        .send({ status: 'published' })
        .expect(422);
      expect(bad.body.error.details.map((d: { field: string }) => d.field)).toEqual([
        'titleAr',
        'titleEn',
      ]);

      const published = await t
        .http()
        .patch(`/api/v1/admin/comparisons/${c.id}`)
        .set(editor.auth)
        .send({
          status: 'published',
          titleAr: 'مقارنة اختبار',
          titleEn: 'Test comparison',
          order: 1,
          items: [item(cat.b), item(cat.a), item(cat.d)],
        })
        .expect(200);
      expect(published.body.data).toMatchObject({ status: 'published', order: 1 });
      expect(published.body.data.items.map((i: { variantId: string }) => i.variantId)).toEqual([
        cat.b,
        cat.a,
        cat.d,
      ]);
      const upd = await waitForAudit(t, 'comparisons.curated.update');
      expect(upd.before).toMatchObject({ status: 'draft' });
      expect(upd.after).toMatchObject({ status: 'published' });

      const featured = await t
        .http()
        .get('/api/v1/comparisons/featured?market=EG&lang=en')
        .expect(200);
      expect(featured.headers['cache-control']).toMatch(/public/);
      const f = featured.body.data.find((x: { id: string }) => x.id === c.id);
      expect(f).toMatchObject({ kind: 'curated', displayTitle: 'Test comparison', isMine: false });
      const other = await t.http().get('/api/v1/comparisons/featured?market=SA').expect(200);
      expect(other.body.data.map((x: { id: string }) => x.id)).not.toContain(c.id);
      const opened = await t.http().get(`/api/v1/comparisons/s/${c.shareId}?lang=ar`).expect(200);
      expect(opened.body.data.comparison.displayTitle).toBe('مقارنة اختبار');

      const list = await t
        .http()
        .get('/api/v1/admin/comparisons?status=published')
        .set(editor.auth)
        .expect(200);
      expect(list.body.data.map((x: { id: string }) => x.id)).toContain(c.id);
      await t.http().get(`/api/v1/admin/comparisons/${c.id}`).set(editor.auth).expect(200);

      await t.http().delete(`/api/v1/admin/comparisons/${c.id}`).set(editor.auth).expect(204);
      await t.http().get(`/api/v1/admin/comparisons/${c.id}`).set(editor.auth).expect(404);
      await waitForAudit(t, 'comparisons.curated.delete');
    });

    it('most-compared report needs analytics.read', async () => {
      await compute({ items: [item(cat.a), item(cat.b)] })
        .set('User-Agent', 'report-test')
        .expect(200);
      await t
        .http()
        .get('/api/v1/admin/comparisons/stats/most-compared')
        .set(editor.auth)
        .expect(403);
      const res = await t
        .http()
        .get('/api/v1/admin/comparisons/stats/most-compared?days=7&lang=en')
        .set(admin.auth)
        .expect(200);
      const ids = res.body.data.map((x: { variantId: string }) => x.variantId);
      expect(ids).toEqual(expect.arrayContaining([cat.a, cat.b]));
      expect(res.body.data[0].comparisons).toBeGreaterThan(0);
      expect(res.body.data.find((x: { variantId: string }) => x.variantId === cat.a).title).toBe(
        'E2E Volt One 2025 A Long Range',
      );
      expect(res.body.meta).toMatchObject({ from: expect.any(String), to: expect.any(String) });
    });
  });
});
