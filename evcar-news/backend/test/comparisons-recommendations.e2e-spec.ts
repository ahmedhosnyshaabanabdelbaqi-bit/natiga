/**
 * Recommendations API (REQUIREMENTS §7) against the synthetic test catalog:
 * visible weights and per-factor contributions, localized reasons, missing /
 * non-comparable data explained (never scored as 0), "no decisive
 * recommendation" for insufficient data, hard constraints, validation and
 * independence from ads.
 */
import { seedTestCatalog, type TestCatalog } from './comparisons-helpers';
import { createTestApp, type TestApp } from './utils/test-app';

interface Ranked {
  rank: number;
  key: string;
  score: number;
  sponsored: boolean;
  car: { variantId: string; title: string; price: { amount: { amount: string } } | null };
  contributions: {
    factor: string;
    weight: number;
    score: number;
    points: number;
    value: number | null;
  }[];
  reasons: { factor: string; code: string; sentiment: string; text: string }[];
}
interface NotRanked {
  key: string;
  reason: string;
  missingData: { factor: string; reason: string }[];
  car: { variantId: string };
}

describe('Recommendations API (e2e)', () => {
  let t: TestApp;
  let cat: TestCatalog;
  const k = (id: string) => `${id}@EG`;
  const base = {
    budget: 1_600_000,
    dailyKm: 40,
    longTripsPerMonth: 2,
    homeCharging: true,
    seatsNeeded: 5,
  };
  const post = (body: object, query = '?lang=en') =>
    t.http().post(`/api/v1/recommendations${query}`).send(body);

  beforeAll(async () => {
    t = await createTestApp();
    cat = await seedTestCatalog(t.prisma);
  });
  afterAll(async () => {
    await t?.close();
  });

  it('ranks with visible weights, contributions and reasons; explains who is not ranked', async () => {
    const res = await post({ ...base, market: 'EG' }).expect(200);
    const d = res.body.data;
    expect(res.headers['cache-control']).toBe('no-store');
    expect(d.sponsored).toBe(false);
    expect(d.disclosure).toMatch(/never change/);
    expect(d.market).toEqual({ code: 'EG', name: 'Egypt', currencyCode: 'EGP' });
    expect(d.input.budget).toEqual({ amount: '1600000.00', currency: 'EGP' });
    expect(d.candidatesConsidered).toBe(5); // the draft trim is not public

    const weightSum = d.weights.reduce((s: number, w: { weight: number }) => s + w.weight, 0);
    expect(weightSum).toBeCloseTo(1, 2);
    const w = (f: string) => d.weights.find((x: { factor: string }) => x.factor === f);
    expect(w('range')).toMatchObject({ source: 'usage', betterDirection: 'higher' });
    expect(w('price')).toMatchObject({ source: 'default', betterDirection: 'lower' });
    expect(d.weightNotes.join(' ')).toMatch(/long trips/);
    expect(d.basis).toEqual({
      rangeCycle: 'WLTP',
      consumptionCycle: 'WLTP',
      consumptionMode: 'combined',
      currency: 'EGP',
    });

    const ranked = d.ranked as Ranked[];
    expect(ranked.map((r) => r.key)).toEqual([k(cat.a), k(cat.b)]);
    for (const r of ranked) {
      expect(r.sponsored).toBe(false);
      const sum = r.contributions.reduce((s, c) => s + c.points, 0);
      expect(Math.abs(sum - r.score)).toBeLessThan(0.1);
    }
    expect(ranked[0].car).toMatchObject({
      variantId: cat.a,
      title: 'E2E Volt One 2025 A Long Range',
    });
    const texts = ranked[0].reasons.map((r) => r.text).join('\n');
    expect(texts).toMatch(
      /Electric range 520 km \(WLTP\) — about 13 days of your 40 km daily driving/,
    );
    expect(texts).toMatch(/DC fast charging up to 200 kW \(peak\)/);
    expect(d.decision).toMatchObject({ decisive: true, topPickKey: k(cat.a), reason: null });

    const nr = d.notRanked as NotRanked[];
    const byKey = new Map(nr.map((n) => [n.key, n]));
    expect(byKey.get(k(cat.e))).toMatchObject({ reason: 'price_not_available' });
    expect(byKey.get(k(cat.c))).toMatchObject({ reason: 'not_comparable' });
    expect(byKey.get(k(cat.c))!.missingData.map((m) => [m.factor, m.reason])).toEqual([
      ['range', 'cycle_mismatch'],
      ['efficiency', 'cycle_mismatch'],
    ]);
    expect(byKey.get(k(cat.d))!.missingData.map((m) => [m.factor, m.reason])).toEqual([
      ['efficiency', 'mode_mismatch'],
    ]);
    const eff = d.factorAvailability.find((f: { factor: string }) => f.factor === 'efficiency');
    expect(eff).toMatchObject({ available: 2, notComparable: 2 });
    expect(eff.suggestion).toMatch(/weight to 0/);
  });

  it('a factor switched off (weight 0) lets more cars be ranked; known absence of DC is explained', async () => {
    const d = (await post({ ...base, weights: { efficiency: 0 } }).expect(200)).body.data;
    const ranked = d.ranked as Ranked[];
    expect(ranked.map((r) => r.key)).toEqual(
      expect.arrayContaining([k(cat.a), k(cat.b), k(cat.d)]),
    );
    const phev = ranked.find((r) => r.key === k(cat.d))!;
    expect(phev.contributions.find((c) => c.factor === 'dcCharging')).toMatchObject({
      value: 0,
      score: 0,
    });
    expect(phev.contributions.map((c) => c.factor)).not.toContain('efficiency');
    expect(phev.reasons.find((r) => r.code === 'NO_DC_CHARGING')).toMatchObject({
      sentiment: 'negative',
    });
    expect(phev.reasons.find((r) => r.code === 'RANGE_BELOW_DAILY_HYBRID')).toBeUndefined();
    expect(d.weights.find((w: { factor: string }) => w.factor === 'efficiency')).toMatchObject({
      weight: 0,
      source: 'user',
    });
  });

  it('insufficient data → no decisive recommendation, with the reason', async () => {
    // Only the PHEV fits: one comparable car is not a comparison.
    const one = (await post({ ...base, powertrains: ['PHEV'] }).expect(200)).body.data;
    expect(one.ranked).toHaveLength(1);
    expect(one.decision).toMatchObject({
      decisive: false,
      reason: 'fewer_than_two_comparable',
      topPickKey: null,
    });
    expect(one.decision.message).toMatch(/No decisive recommendation/);
    expect(one.excluded.powertrain).toBe(4);

    // Only a car without a price matches the body type: never guessed.
    const sedan = (await post({ ...base, budget: 5_000_000, bodyTypes: ['sedan'] }).expect(200))
      .body.data;
    expect(sedan.ranked).toEqual([]);
    expect(sedan.notRanked.map((n: NotRanked) => [n.key, n.reason])).toEqual([
      [k(cat.e), 'price_not_available'],
    ]);
    expect(sedan.decision.reason).toBe('no_comparable_candidates');
    expect(sedan.excluded.bodyType).toBe(4);

    // Nothing fits the budget.
    const poor = (await post({ ...base, budget: 1_000_000 }).expect(200)).body.data;
    expect(poor.excluded.overBudget).toBe(4);
    expect(poor.decision.decisive).toBe(false);

    const seats = (await post({ ...base, seatsNeeded: 7 }).expect(200)).body.data;
    expect(seats.excluded.seatsTooFew).toBe(5);
    expect(seats.decision.reason).toBe('no_candidates');
  });

  it('answers in Arabic by default', async () => {
    const d = (await post(base, '').expect(200)).body.data;
    expect(d.ranked[0].reasons.map((r: { text: string }) => r.text).join(' ')).toMatch(
      /المدى الكهربائي 520 كم/,
    );
    expect(d.weights[0].label).toBe('السعر');
    expect(d.notAvailableLabel).toBe('غير متوفر');
  });

  it('validates the answers', async () => {
    const fields = async (body: object) =>
      ((await post(body).expect(422)).body.error.details as { field: string }[]).map(
        (x) => x.field,
      );
    expect(await fields({ ...base, budget: undefined })).toContain('budget');
    expect(await fields({ ...base, seatsNeeded: 0 })).toContain('seatsNeeded');
    expect(await fields({ ...base, bodyTypes: ['spaceship'] })).toContain('bodyTypes');
    expect(await fields({ ...base, market: 'ZZ' })).toEqual(['market']);
    expect(
      await fields({
        ...base,
        weights: {
          price: 0,
          range: 0,
          dcCharging: 0,
          acCharging: 0,
          efficiency: 0,
          space: 0,
          performance: 0,
        },
      }),
    ).toEqual(['weights']);
    expect(await fields({ ...base, weights: { price: 11 } })).toContain('weights.price');
    await post({ ...base, sponsoredBoost: true }).expect(422);
  });

  it('active ad campaigns never change the ranking', async () => {
    type Body = { ranked: Ranked[]; notRanked: NotRanked[]; decision: unknown };
    const strip = (d: Body) =>
      JSON.stringify({ ranked: d.ranked, notRanked: d.notRanked, decision: d.decision });
    const before = (await post(base).expect(200)).body.data as Body;
    const placement = await t.prisma.adPlacement.findFirstOrThrow();
    await t.prisma.adPlacement.update({ where: { id: placement.id }, data: { isEnabled: true } });
    const campaign = await t.prisma.adCampaign.create({
      data: {
        name: 'E2E campaign (synthetic)',
        advertiserName: 'E2E advertiser',
        status: 'active',
        startsAt: new Date(Date.now() - 86_400_000),
        isDemo: true,
      },
    });
    await t.prisma.adCreative.create({
      data: {
        campaignId: campaign.id,
        placementId: placement.id,
        headline: 'Buy E2E Volt B',
        targetUrl: 'https://example.com/e2e',
      },
    });
    const after = (await post(base).expect(200)).body.data as Body;
    expect(strip(after)).toBe(strip(before));
    expect(after.ranked.every((r) => r.sponsored === false)).toBe(true);
  });
});
