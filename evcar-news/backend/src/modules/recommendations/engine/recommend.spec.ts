/**
 * Unit tests of the explainable recommendation engine (REQUIREMENTS §7):
 * visible weights, per-factor contributions, reasons, missing data, no
 * decisive verdict when data is not comparable, missing never becomes 0,
 * hard constraints, determinism.
 */
import {
  car,
  consumption,
  inlet,
  point,
  price,
  range,
} from '../../comparisons/engine/test-fixtures';
import type { CarFacts } from '../../comparisons/engine/types';
import { decide, DECISIVE_MARGIN, recommend, resolveWeights } from './recommend';
import type { Candidate, RecoInput } from './types';

const input = (over: Partial<RecoInput> = {}): RecoInput => ({
  budget: 2_000_000,
  currency: 'EGP',
  dailyKm: 40,
  longTripsPerMonth: 1,
  homeCharging: true,
  seatsNeeded: 5,
  bodyTypes: null,
  powertrains: ['BEV', 'PHEV', 'EREV'],
  limit: 10,
  ...over,
});

/** A complete synthetic BEV (every default factor available). */
function full(
  name: string,
  o: {
    price: string;
    range: number;
    dc: number;
    ac?: number;
    wh?: number;
    trunk?: number;
    accel?: number;
    cycle?: string;
    seats?: number;
    powertrainType?: string;
  },
): CarFacts {
  return car(name, {
    powertrainType: o.powertrainType ?? 'BEV',
    seats: o.seats ?? 5,
    price: price(o.price),
    ranges: [range(o.cycle ?? 'WLTP', o.range)],
    consumption: [consumption(o.cycle ?? 'WLTP', o.wh ?? 160)],
    specs: {
      'charging.dc_peak_kw': point(o.dc, 'kW'),
      'charging.ac_max_kw': point(o.ac ?? 11, 'kW'),
      'practicality.trunk_l': point(o.trunk ?? 400, 'l'),
      'performance.accel_0_100_s': point(o.accel ?? 7, 's'),
    },
  });
}

const cand = (facts: CarFacts, bodyType: string | null = 'suv'): Candidate => ({ facts, bodyType });

describe('recommendations — weights', () => {
  it('are visible, sum to 1 and follow the usage answers', () => {
    const base = resolveWeights(input(), 'en');
    const sum = base.weights.reduce((s, w) => s + w.weight, 0);
    expect(sum).toBeCloseTo(1, 3);
    expect(base.weights.map((w) => w.factor)).toEqual([
      'price',
      'range',
      'dcCharging',
      'acCharging',
      'efficiency',
      'space',
      'performance',
    ]);
    const trips = resolveWeights(input({ longTripsPerMonth: 3, homeCharging: false }), 'en');
    const w = (r: typeof base, f: string) => r.weights.find((x) => x.factor === f)!;
    expect(w(trips, 'range').raw).toBeGreaterThan(w(base, 'range').raw);
    expect(w(trips, 'dcCharging').raw).toBeGreaterThan(w(base, 'dcCharging').raw);
    expect(w(trips, 'dcCharging').source).toBe('usage');
    expect(trips.notes.join(' ')).toMatch(/long trips/);
    expect(trips.notes.join(' ')).toMatch(/cannot charge at home/);
  });

  it('user weights replace the defaults (0 switches a factor off)', () => {
    const r = resolveWeights(input({ weights: { price: 10, performance: 0 } }), 'ar');
    const price = r.weights.find((x) => x.factor === 'price')!;
    expect(price).toMatchObject({ raw: 10, source: 'user', label: 'السعر' });
    expect(r.weights.find((x) => x.factor === 'performance')!.weight).toBe(0);
  });
});

describe('recommendations — ranking and explanations', () => {
  const a = full('a', { price: '1500000.00', range: 520, dc: 200, wh: 150, trunk: 500, accel: 6 });
  const b = full('b', { price: '1200000.00', range: 350, dc: 80, wh: 180, trunk: 350, accel: 9 });
  const c = full('c', { price: '1900000.00', range: 450, dc: 150, wh: 170, trunk: 420, accel: 7 });

  it('ranks with per-factor contributions that add up to the score', () => {
    const r = recommend([cand(a), cand(b), cand(c)], input(), 'en');
    expect(r.ranked).toHaveLength(3);
    for (const x of r.ranked) {
      const sum = x.contributions.reduce((s, k) => s + k.points, 0);
      expect(Math.abs(sum - x.score)).toBeLessThan(0.1);
      expect(x.sponsored).toBe(false);
      expect(x.contributions.every((k) => k.score >= 0 && k.score <= 1)).toBe(true);
    }
    expect(r.ranked[0].key).toBe('a@EG');
    expect(r.decision).toMatchObject({ decisive: true, topPickKey: 'a@EG', reason: null });
    expect(r.basis).toMatchObject({
      rangeCycle: 'WLTP',
      consumptionCycle: 'WLTP',
      currency: 'EGP',
    });
  });

  it('explains each factor in the request language', () => {
    const r = recommend([cand(a), cand(b)], input({ dailyKm: 40, longTripsPerMonth: 2 }), 'en');
    const texts = r.ranked[0].reasons.map((x) => x.text).join('\n');
    expect(texts).toMatch(/Electric range 520 km \(WLTP\) — about 13 days of your 40 km/);
    expect(texts).toMatch(/DC fast charging up to 200 kW \(peak\), useful for your 2 long trips/);
    expect(texts).toMatch(/Price 1,500,000 EGP/);
    const ar = recommend([cand(a), cand(b)], input(), 'ar');
    expect(ar.ranked[0].reasons.map((x) => x.text).join(' ')).toMatch(/المدى الكهربائي 520 كم/);
    expect(ar.decision.message).toMatch(/الترشيح الأول/);
  });

  it('flags a range below the daily distance as a negative reason', () => {
    const phev = car('p', {
      powertrainType: 'PHEV',
      seats: 5,
      price: price('1300000.00'),
      ranges: [range('WLTP', 60), range('WLTP', 800, 'total')],
      consumption: [consumption('WLTP', 170)],
      specs: {
        'charging.dc_peak_kw': point(50, 'kW'),
        'charging.ac_max_kw': point(7, 'kW'),
        'practicality.trunk_l': point(380, 'l'),
        'performance.accel_0_100_s': point(8, 's'),
      },
    });
    const r = recommend([cand(a), cand(phev)], input({ dailyKm: 80 }), 'en');
    const reason = r.ranked
      .find((x) => x.key === 'p@EG')!
      .reasons.find((x) => x.code === 'RANGE_BELOW_DAILY_HYBRID');
    expect(reason).toMatchObject({ sentiment: 'negative' });
    expect(reason!.text).toMatch(/the rest would run on fuel/);
  });

  it('is deterministic and never reads sponsorship (identical input → identical output)', () => {
    const x = recommend([cand(a), cand(b), cand(c)], input(), 'en');
    const y = recommend([cand(c), cand(b), cand(a)], input(), 'en');
    expect(x.ranked.map((r) => [r.key, r.score])).toEqual(y.ranked.map((r) => [r.key, r.score]));
  });
});

describe('recommendations — hard constraints', () => {
  it('filters budget, seats, body type and powertrain; counts the exclusions', () => {
    const cheap = full('cheap', { price: '900000.00', range: 300, dc: 60 });
    const pricey = full('pricey', { price: '3000000.00', range: 600, dc: 250 });
    const small = full('small', { price: '800000.00', range: 250, dc: 50, seats: 4 });
    const hev = car('hev', { powertrainType: 'HEV', price: price('700000.00') });
    const r = recommend(
      [
        cand(cheap),
        cand(pricey),
        cand(small),
        cand(hev),
        cand(full('sedan', { price: '1000000.00', range: 400, dc: 100 }), 'sedan'),
      ],
      input({ budget: 1_500_000, bodyTypes: ['suv'] }),
      'en',
    );
    expect(r.excluded).toEqual({
      total: 4,
      overBudget: 1,
      seatsTooFew: 1,
      bodyType: 1,
      powertrain: 1,
    });
    expect(r.ranked.map((x) => x.key)).toEqual(['cheap@EG']);
  });

  it('never guesses an unknown price or seat count: listed as not ranked', () => {
    const noPrice = { ...full('np', { price: '1.00', range: 400, dc: 100 }), price: null };
    const foreign = full('fx', { price: '30000.00', range: 400, dc: 100 });
    foreign.price = price('30000.00', 'USD', 'market_estimate', { inMarketCurrency: false });
    const noSeats = { ...full('ns', { price: '1000000.00', range: 400, dc: 100 }), seats: null };
    const r = recommend([cand(noPrice), cand(foreign), cand(noSeats)], input(), 'en');
    expect(r.ranked).toEqual([]);
    expect(r.notRanked.map((x) => [x.key, x.reason])).toEqual([
      ['np@EG', 'price_not_available'],
      ['fx@EG', 'price_not_available'],
      ['ns@EG', 'seats_not_available'],
    ]);
  });
});

describe('recommendations — insufficient / incomparable data', () => {
  it('missing data → not ranked with the missing list (never scored as 0)', () => {
    const a = full('a', { price: '1500000.00', range: 520, dc: 200 });
    const b = full('b', { price: '1400000.00', range: 480, dc: 150 });
    const noRange = full('c', { price: '1000000.00', range: 1, dc: 100 });
    noRange.ranges = [];
    const r = recommend([cand(a), cand(b), cand(noRange)], input(), 'en');
    expect(r.ranked.map((x) => x.key)).not.toContain('c@EG');
    const nr = r.notRanked.find((x) => x.key === 'c@EG')!;
    expect(nr.reason).toBe('missing_data');
    expect(nr.missingData).toEqual([
      expect.objectContaining({ factor: 'range', reason: 'missing', detail: 'Not available' }),
    ]);
    const avail = r.factorAvailability.find((f) => f.factor === 'range')!;
    expect(avail).toMatchObject({ available: 2, missing: 1 });
    expect(avail.suggestion).toMatch(/weight to 0/);
  });

  it('a range on another cycle is not comparable (never converted)', () => {
    const a = full('a', { price: '1500000.00', range: 520, dc: 200 });
    const b = full('b', { price: '1400000.00', range: 480, dc: 150 });
    const cltc = full('c', { price: '1000000.00', range: 600, dc: 100, cycle: 'CLTC' });
    const r = recommend([cand(a), cand(b), cand(cltc)], input(), 'en');
    const nr = r.notRanked.find((x) => x.key === 'c@EG')!;
    expect(nr.reason).toBe('not_comparable');
    expect(nr.missingData.map((m) => m.reason)).toEqual(['cycle_mismatch', 'cycle_mismatch']);
    expect(r.basis.rangeCycle).toBe('WLTP');
  });

  it('only cars on different cycles → no decisive recommendation', () => {
    const a = full('a', { price: '1500000.00', range: 520, dc: 200, cycle: 'WLTP' });
    const b = full('b', { price: '1400000.00', range: 610, dc: 150, cycle: 'CLTC' });
    const r = recommend([cand(a), cand(b)], input(), 'en');
    expect(r.ranked).toHaveLength(1);
    expect(r.decision).toMatchObject({
      decisive: false,
      reason: 'fewer_than_two_comparable',
      topPickKey: null,
    });
    expect(r.decision.message).toMatch(/No decisive recommendation/);
  });

  it('switching a missing factor off (weight 0) lets the car be ranked', () => {
    const a = full('a', { price: '1500000.00', range: 520, dc: 200 });
    const noTrunk = full('b', { price: '1400000.00', range: 480, dc: 150 });
    noTrunk.specs.delete('practicality.trunk_l');
    expect(recommend([cand(a), cand(noTrunk)], input(), 'en').ranked).toHaveLength(1);
    const r = recommend([cand(a), cand(noTrunk)], input({ weights: { space: 0 } }), 'en');
    expect(r.ranked).toHaveLength(2);
    expect(r.ranked[0].contributions.map((c) => c.factor)).not.toContain('space');
  });

  it('a recorded absence of a DC inlet is a real 0 with a negative reason', () => {
    const a = full('a', { price: '1500000.00', range: 520, dc: 200 });
    const phev = car('p', {
      powertrainType: 'PHEV',
      price: price('1300000.00'),
      ranges: [range('WLTP', 80)],
      consumption: [consumption('WLTP', 170)],
      inlets: [inlet('type2', 'AC', 7.4)],
      specs: {
        'practicality.trunk_l': point(380, 'l'),
        'performance.accel_0_100_s': point(8, 's'),
      },
    });
    const r = recommend([cand(a), cand(phev)], input(), 'en');
    const p = r.ranked.find((x) => x.key === 'p@EG')!;
    expect(p.contributions.find((c) => c.factor === 'dcCharging')).toMatchObject({
      value: 0,
      score: 0,
    });
    expect(p.contributions.find((c) => c.factor === 'acCharging')).toMatchObject({ value: 7.4 });
    expect(p.reasons.find((x) => x.code === 'NO_DC_CHARGING')).toMatchObject({
      sentiment: 'negative',
    });
  });

  it('close scores → no decisive recommendation', () => {
    const a = full('a', { price: '1500000.00', range: 500, dc: 150 });
    const b = full('b', { price: '1500000.00', range: 500, dc: 150 });
    const r = recommend([cand(a), cand(b)], input(), 'en');
    expect(r.decision).toMatchObject({ decisive: false, reason: 'scores_too_close' });
  });

  it('no matching car at all → no_candidates', () => {
    const r = recommend(
      [cand(full('a', { price: '5000000.00', range: 500, dc: 150 }))],
      input(),
      'en',
    );
    expect(r.decision.reason).toBe('no_candidates');
    expect(r.ranked).toEqual([]);
  });

  it('decision thresholds', () => {
    expect(decide([], 0, 'en').reason).toBe('no_candidates');
    expect(decide([], 3, 'en').reason).toBe('no_comparable_candidates');
    expect(decide([{ key: 'x', total: 80 }], 1, 'en').reason).toBe('fewer_than_two_comparable');
    expect(
      decide(
        [
          { key: 'x', total: 80 },
          { key: 'y', total: 80 - DECISIVE_MARGIN + 0.1 },
        ],
        2,
        'en',
      ).reason,
    ).toBe('scores_too_close');
    expect(
      decide(
        [
          { key: 'x', total: 80 },
          { key: 'y', total: 70 },
        ],
        2,
        'en',
      ),
    ).toMatchObject({
      decisive: true,
      topPickKey: 'x',
    });
  });
});
