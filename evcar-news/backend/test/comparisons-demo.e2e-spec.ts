/**
 * Comparisons with the DEMO seed (clearly flagged fictional data): the
 * curated demo comparison is featured on the EG home, labelled as demo, and
 * its BEV vs PHEV rows keep electric and total range apart.
 */
import { DEMO_IDS as I, runDemoSeed } from '../src/cli/seed-data/demo-seed';
import { STORAGE_PROVIDER } from '../src/providers/provider-tokens';
import type { StorageProvider } from '../src/providers/storage/storage.types';
import { createTestApp, type TestApp } from './utils/test-app';

describe('Comparisons with demo data (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await runDemoSeed(t.prisma, { storage: t.app.get<StorageProvider>(STORAGE_PROVIDER) });
  });
  afterAll(async () => {
    await t?.close();
  });

  it('features the curated demo comparison, visibly labelled as demo', async () => {
    const res = await t.http().get('/api/v1/comparisons/featured?market=EG&lang=en').expect(200);
    const demo = res.body.data.find((c: { id: string }) => c.id === I.comparison);
    expect(demo).toMatchObject({
      kind: 'curated',
      isDemo: true,
      shareId: 'demo-cmp-0001',
      shareUrl: 'https://evcar.news/compare/demo-cmp-0001',
    });
    expect(demo.displayTitle).toMatch(/^\[DEMO\]/);
    expect(
      demo.items.map((i: { variantId: string; available: boolean }) => [i.variantId, i.available]),
    ).toEqual([
      [I.variantBev, true],
      [I.variantPhev, true],
    ]);
    const ar = await t.http().get('/api/v1/comparisons/featured?market=EG').expect(200);
    expect(ar.body.data.find((c: { id: string }) => c.id === I.comparison).displayTitle).toMatch(
      /^\[تجريبي\]/,
    );
  });

  it('opens the demo comparison: BEV vs PHEV rows and a demo warning', async () => {
    const res = await t.http().get('/api/v1/comparisons/s/demo-cmp-0001?lang=en').expect(200);
    const r = res.body.data.result;
    const row = (key: string) =>
      r.groups
        .flatMap((g: { metrics: { key: string }[] }) => g.metrics)
        .find((m: { key: string }) => m.key === key);
    expect(row('range.electric')).toMatchObject({
      comparability: 'comparable',
      winners: [`${I.variantBev}@EG`],
    });
    expect(row('range.total')).toMatchObject({
      comparability: 'not_applicable',
      outcome: 'no_winner',
    });
    expect(row('price.current')).toMatchObject({ comparability: 'missing_data' }); // the demo PHEV has no price
    expect(r.cars.every((c: { isDemo: boolean }) => c.isDemo)).toBe(true);
    expect(r.warnings.map((w: { code: string }) => w.code)).toEqual(
      expect.arrayContaining(['DEMO_DATA', 'MIXED_POWERTRAINS']),
    );
  });
});
