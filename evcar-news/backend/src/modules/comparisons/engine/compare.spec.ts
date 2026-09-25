/**
 * Unit tests for every comparison rule of REQUIREMENTS §7 / §22:
 * mixed cycles → no winner, missing → no winner and never 0, SoC windows,
 * PHEV electric vs total range, peak vs average DC power, units keep their
 * original values, better directions, currencies, differences only.
 */
import { buildMetrics, compareCars } from './compare';
import { car, consumption, DEFS, inlet, point, price, range, time } from './test-fixtures';
import type { CarFacts, Metric } from './types';

const metric = (cars: CarFacts[], key: string, lang: 'ar' | 'en' = 'en'): Metric => {
  const m = buildMetrics(cars, DEFS, lang).find((x) => x.key === key);
  if (!m) throw new Error(`no metric ${key}`);
  return m;
};
const has = (cars: CarFacts[], key: string) =>
  buildMetrics(cars, DEFS, 'en').some((x) => x.key === key);

describe('comparison engine — range (cycles, never converted)', () => {
  it('declares a winner on the same cycle', () => {
    const m = metric(
      [car('a', { ranges: [range('WLTP', 500)] }), car('b', { ranges: [range('WLTP', 520)] })],
      'range.electric',
    );
    expect(m).toMatchObject({
      comparability: 'comparable',
      betterDirection: 'higher',
      outcome: 'winner',
      winners: ['b@EG'],
      basis: { cycle: 'WLTP' },
      unit: 'km',
    });
    expect(m.values.map((v) => v.condition?.cycle)).toEqual(['WLTP', 'WLTP']);
  });

  it('mixed cycles → not comparable, no winner, each value keeps its own cycle and number', () => {
    const m = metric(
      [car('a', { ranges: [range('WLTP', 500)] }), car('b', { ranges: [range('CLTC', 700)] })],
      'range.electric',
    );
    expect(m.comparability).toBe('not_comparable_cycles');
    expect(m.outcome).toBe('no_winner');
    expect(m.winners).toEqual([]);
    expect(m.values.map((v) => [v.value, v.condition?.cycle])).toEqual([
      [500, 'WLTP'],
      [700, 'CLTC'],
    ]);
    expect(m.comparabilityNote).toMatch(/WLTP vs CLTC/);
    expect(m.isDifferent).toBe(true);
  });

  it('same number on different cycles is still a difference and not a tie', () => {
    const m = metric(
      [car('a', { ranges: [range('WLTP', 500)] }), car('b', { ranges: [range('EPA', 500)] })],
      'range.electric',
    );
    expect(m.outcome).toBe('no_winner');
    expect(m.isDifferent).toBe(true);
  });

  it('uses a cycle shared by all cars and lists the other cycles as alternatives', () => {
    const m = metric(
      [
        car('a', { ranges: [range('WLTP', 500), range('CLTC', 610)] }),
        car('b', { ranges: [range('CLTC', 650)] }),
      ],
      'range.electric',
    );
    expect(m.comparability).toBe('comparable');
    expect(m.basis).toMatchObject({ cycle: 'CLTC' });
    expect(m.values[0]).toMatchObject({ value: 610, condition: { cycle: 'CLTC' } });
    expect(m.values[0].alternatives).toEqual([
      expect.objectContaining({
        value: 500,
        condition: expect.objectContaining({ cycle: 'WLTP' }),
      }),
    ]);
    expect(m.winners).toEqual(['b@EG']);
  });

  it('prefers WLTP when several cycles are shared', () => {
    const m = metric(
      [
        car('a', { ranges: [range('CLTC', 600), range('WLTP', 480)] }),
        car('b', { ranges: [range('CLTC', 590), range('WLTP', 500)] }),
      ],
      'range.electric',
    );
    expect(m.basis).toMatchObject({ cycle: 'WLTP' });
    expect(m.winners).toEqual(['b@EG']);
  });

  it('OTHER cycles are only comparable when they carry the same name', () => {
    const same = metric(
      [
        car('a', { ranges: [range('OTHER', 400, 'electric', { cycleNote: 'JC08' })] }),
        car('b', { ranges: [range('OTHER', 420, 'electric', { cycleNote: ' jc08 ' })] }),
      ],
      'range.electric',
    );
    expect(same.comparability).toBe('comparable');
    const differ = metric(
      [
        car('a', { ranges: [range('OTHER', 400, 'electric', { cycleNote: 'JC08' })] }),
        car('b', { ranges: [range('OTHER', 420, 'electric', { cycleNote: 'Real world' })] }),
      ],
      'range.electric',
    );
    expect(differ.comparability).toBe('not_comparable_cycles');
    expect(differ.comparabilityNote).toMatch(/JC08 vs Real world/);
  });

  it('several values in one cycle (wheel sizes) → the highest, with a note and alternatives', () => {
    const m = metric(
      [
        car('a', {
          ranges: [
            range('WLTP', 480, 'electric', { wheelSizeInch: 20 }),
            range('WLTP', 510, 'electric', { wheelSizeInch: 18 }),
          ],
        }),
        car('b', { ranges: [range('WLTP', 505)] }),
      ],
      'range.electric',
    );
    expect(m.values[0]).toMatchObject({ value: 510, condition: { wheelSizeInch: 18 } });
    expect(m.values[0].note).toMatch(/Highest of 2/);
    expect(m.values[0].alternatives).toHaveLength(1);
  });

  it('keeps the published value and unit next to the canonical km', () => {
    const m = metric(
      [
        car('a', {
          ranges: [range('EPA', 482.8, 'electric', { originalValue: '300', originalUnit: 'mi' })],
        }),
        car('b', { ranges: [range('EPA', 450)] }),
      ],
      'range.electric',
    );
    expect(m.values[0]).toMatchObject({
      value: 482.8,
      unit: 'km',
      originalValue: '300',
      originalUnit: 'mi',
    });
    expect(m.winners).toEqual(['a@EG']);
  });
});

describe('comparison engine — missing data never becomes 0 or a win', () => {
  it('missing range → missing_data, null value, no winner', () => {
    const m = metric(
      [car('a', { ranges: [range('WLTP', 500)] }), car('b', { ranges: [] })],
      'range.electric',
    );
    expect(m.comparability).toBe('missing_data');
    expect(m.outcome).toBe('no_winner');
    expect(m.values[1]).toMatchObject({ status: 'missing', value: null });
    expect(m.values[1].value).not.toBe(0);
  });

  it('missing spec value → no winner even when the other car has a great value', () => {
    const m = metric(
      [
        car('a', { specs: { 'performance.accel_0_100_s': point(3.2, 's') } }),
        car('b', { specs: {} }),
      ],
      'performance.accel_0_100_s',
    );
    expect(m).toMatchObject({ comparability: 'missing_data', outcome: 'no_winner', winners: [] });
    expect(m.values[1].value).toBeNull();
  });

  it('every definition is listed even when no car has a value (shown as Not available)', () => {
    const m = metric([car('a'), car('b')], 'practicality.trunk_l');
    expect(m.values.every((v) => v.status === 'missing' && v.value === null)).toBe(true);
    expect(m.isDifferent).toBe(false);
  });

  it('missing price → missing_data (never a free car)', () => {
    const m = metric([car('a', { price: price('1500000.00') }), car('b')], 'price.current');
    expect(m).toMatchObject({ comparability: 'missing_data', outcome: 'no_winner' });
  });

  it('a disputed value never decides a winner', () => {
    const m = metric(
      [
        car('a', {
          specs: { 'performance.power_kw': point(300, 'kW', { reliability: 'disputed' }) },
        }),
        car('b', { specs: { 'performance.power_kw': point(200, 'kW') } }),
      ],
      'performance.power_kw',
    );
    expect(m.comparability).toBe('comparable');
    expect(m.outcome).toBe('no_winner');
    expect(m.comparabilityNote).toMatch(/disputed/);
  });
});

describe('comparison engine — electric vs total range (PHEV / EREV / HEV)', () => {
  const bev = car('bev', { powertrainType: 'BEV', ranges: [range('WLTP', 420)] });
  const phev = car('phev', {
    powertrainType: 'PHEV',
    ranges: [range('WLTP', 90), range('WLTP', 900, 'total')],
  });

  it('electric range compares electric ranges only', () => {
    const m = metric([bev, phev], 'range.electric');
    expect(m.values.map((v) => v.value)).toEqual([420, 90]);
    expect(m.winners).toEqual(['bev@EG']);
    expect(m.values.every((v) => v.condition?.rangeType === 'electric')).toBe(true);
  });

  it('total range is a separate row: not applicable to the BEV, never filled with its electric range', () => {
    const m = metric([bev, phev], 'range.total');
    expect(m.comparability).toBe('not_applicable');
    expect(m.outcome).toBe('no_winner');
    expect(m.values[0]).toMatchObject({ status: 'not_applicable', value: null });
    expect(m.values[1]).toMatchObject({ value: 900, condition: { rangeType: 'total' } });
    expect(m.comparabilityNote).toMatch(/hybrids/);
  });

  it('two PHEVs compare both rows separately', () => {
    const other = car('phev2', {
      powertrainType: 'PHEV',
      ranges: [range('WLTP', 110), range('WLTP', 850, 'total')],
    });
    expect(metric([phev, other], 'range.electric').winners).toEqual(['phev2@EG']);
    expect(metric([phev, other], 'range.total').winners).toEqual(['phev@EG']);
  });

  it('BEV-only comparisons have no total-range or fuel rows; HEV has no electric range', () => {
    const b2 = car('b2', { ranges: [range('WLTP', 400)] });
    expect(has([bev, b2], 'range.total')).toBe(false);
    expect(has([bev, b2], 'consumption.fuel')).toBe(false);
    const hev = car('hev', { powertrainType: 'HEV', ranges: [range('WLTP', 1000, 'total')] });
    const m = metric([bev, hev], 'range.electric');
    expect(m.values[1].status).toBe('not_applicable');
    expect(metric([bev, hev], 'charging.dc_peak_kw').values[1].status).toBe('not_applicable');
  });
});

describe('comparison engine — consumption', () => {
  it('lower is better on the same cycle and mode', () => {
    const m = metric(
      [
        car('a', { consumption: [consumption('WLTP', 160)] }),
        car('b', { consumption: [consumption('WLTP', 150)] }),
      ],
      'consumption.electricity',
    );
    expect(m).toMatchObject({ betterDirection: 'lower', winners: ['b@EG'], unit: 'Wh/km' });
    expect(m.basis).toMatchObject({ cycle: 'WLTP', mode: 'combined' });
  });

  it('same cycle but different operating modes → not comparable (conditions)', () => {
    const m = metric(
      [
        car('a', { consumption: [consumption('WLTP', 160, 'electricity', 'combined')] }),
        car('b', {
          powertrainType: 'PHEV',
          consumption: [consumption('WLTP', 140, 'electricity', 'weighted')],
        }),
      ],
      'consumption.electricity',
    );
    expect(m.comparability).toBe('not_comparable_conditions');
    expect(m.outcome).toBe('no_winner');
  });

  it('different cycles → not_comparable_cycles', () => {
    const m = metric(
      [
        car('a', { consumption: [consumption('WLTP', 160)] }),
        car('b', { consumption: [consumption('EPA', 150)] }),
      ],
      'consumption.electricity',
    );
    expect(m.comparability).toBe('not_comparable_cycles');
  });

  it('fuel consumption does not apply to a BEV', () => {
    const m = metric(
      [
        car('a'),
        car('b', {
          powertrainType: 'PHEV',
          consumption: [consumption('WLTP', 1.5, 'fuel', 'weighted')],
        }),
      ],
      'consumption.fuel',
    );
    expect(m.comparability).toBe('not_applicable');
    expect(m.values[1]).toMatchObject({ value: 1.5, unit: 'L/100km' });
  });
});

describe('comparison engine — charging (SoC windows, peak ≠ average)', () => {
  it('10–80 % vs 30–80 % are never compared as equivalent', () => {
    const m = metric(
      [
        car('a', { chargingTimes: [time('DC', 10, 80, 30)] }),
        car('b', { chargingTimes: [time('DC', 30, 80, 20)] }),
      ],
      'charging.dc_time',
    );
    expect(m.comparability).toBe('not_comparable_soc_window');
    expect(m.outcome).toBe('no_winner');
    expect(m.values.map((v) => v.condition?.socWindow)).toEqual(['10–80%', '30–80%']);
    expect(m.comparabilityNote).toMatch(/10–80% vs 30–80%/);
  });

  it('same window → faster wins (lower is better)', () => {
    const m = metric(
      [
        car('a', { chargingTimes: [time('DC', 10, 80, 30), time('DC', 30, 80, 15)] }),
        car('b', { chargingTimes: [time('DC', 10, 80, 26)] }),
      ],
      'charging.dc_time',
    );
    expect(m).toMatchObject({
      comparability: 'comparable',
      basis: { socWindow: '10–80%' },
      winners: ['b@EG'],
      unit: 'min',
    });
    expect(m.values[0].alternatives).toHaveLength(1);
  });

  it('a slower charger that limited one car makes the times incomparable', () => {
    const m = metric(
      [
        car('a', {
          specs: { 'charging.dc_peak_kw': point(250, 'kW') },
          chargingTimes: [time('DC', 10, 80, 45, { chargerPowerKw: 50 })],
        }),
        car('b', {
          specs: { 'charging.dc_peak_kw': point(150, 'kW') },
          chargingTimes: [time('DC', 10, 80, 30, { chargerPowerKw: 350 })],
        }),
      ],
      'charging.dc_time',
    );
    expect(m.comparability).toBe('not_comparable_conditions');
    expect(m.comparabilityNote).toMatch(/50 kW vs 350 kW/);
  });

  it('peak DC power and average DC power are separate rows with their own winners', () => {
    const cars = [
      car('a', {
        specs: { 'charging.dc_peak_kw': point(250, 'kW') },
        chargingTimes: [time('DC', 10, 80, 30, { averagePowerKw: 100 })],
      }),
      car('b', {
        specs: { 'charging.dc_peak_kw': point(150, 'kW') },
        chargingTimes: [time('DC', 10, 80, 28, { averagePowerKw: 120 })],
      }),
    ];
    const peak = metric(cars, 'charging.dc_peak_kw');
    const avg = metric(cars, 'charging.dc_average_kw');
    expect(peak.label).toMatch(/Peak/);
    expect(peak.winners).toEqual(['a@EG']);
    expect(avg.values.map((v) => v.value)).toEqual([100, 120]);
    expect(avg.winners).toEqual(['b@EG']);
    expect(avg.basis).toMatchObject({ socWindow: '10–80%' });
  });

  it('average power is never derived from the peak (missing → missing_data)', () => {
    const cars = [
      car('a', {
        specs: { 'charging.dc_peak_kw': point(250, 'kW') },
        chargingTimes: [time('DC', 10, 80, 30, { averagePowerKw: 100 })],
      }),
      car('b', {
        specs: { 'charging.dc_peak_kw': point(150, 'kW') },
        chargingTimes: [time('DC', 10, 80, 28)],
      }),
    ];
    const avg = metric(cars, 'charging.dc_average_kw');
    expect(avg.comparability).toBe('missing_data');
    expect(avg.values[1]).toMatchObject({ status: 'missing', value: null });
  });

  it('uses market inlet data when the spec is missing, and a PHEV without a DC inlet is not applicable', () => {
    const cars = [
      car('a', { inlets: [inlet('ccs2', 'DC', 135), inlet('type2', 'AC', 11)] }),
      car('b', { powertrainType: 'PHEV', inlets: [inlet('type2', 'AC', 6.6)] }),
    ];
    const peak = metric(cars, 'charging.dc_peak_kw');
    expect(peak.values[0]).toMatchObject({ value: 135, note: expect.stringMatching(/inlet/) });
    expect(peak.values[1]).toMatchObject({ status: 'not_applicable', value: null });
    expect(peak.comparability).toBe('not_applicable');
    const ac = metric(cars, 'charging.ac_max_kw');
    expect(ac.winners).toEqual(['a@EG']);
    const inlets = metric(cars, 'charging.inlets');
    expect(inlets.values[0].valueLabel).toContain('CCS2 (DC 135 kW)');
    expect(inlets.betterDirection).toBe('none');
  });
});

describe('comparison engine — directions and battery', () => {
  it('lower is better for acceleration and weight, higher for power', () => {
    const cars = [
      car('a', {
        specs: {
          'performance.accel_0_100_s': point(5.9, 's'),
          'dimensions.curb_weight_kg': point(1900, 'kg'),
          'performance.power_kw': point(230, 'kW'),
        },
      }),
      car('b', {
        specs: {
          'performance.accel_0_100_s': point(6.5, 's'),
          'dimensions.curb_weight_kg': point(1750, 'kg'),
          'performance.power_kw': point(250, 'kW'),
        },
      }),
    ];
    expect(metric(cars, 'performance.accel_0_100_s').winners).toEqual(['a@EG']);
    expect(metric(cars, 'dimensions.curb_weight_kg').winners).toEqual(['b@EG']);
    expect(metric(cars, 'performance.power_kw').winners).toEqual(['b@EG']);
  });

  it('a bigger battery is never an automatic win (direction none, even if configured)', () => {
    const cars = [
      car('a', {
        specs: { 'battery.usable_kwh': point(82, 'kWh'), 'battery.voltage_v': point(800, 'V') },
      }),
      car('b', {
        specs: { 'battery.usable_kwh': point(60, 'kWh'), 'battery.voltage_v': point(400, 'V') },
      }),
    ];
    const usable = metric(cars, 'battery.usable_kwh');
    expect(usable).toMatchObject({
      betterDirection: 'none',
      comparability: 'comparable',
      outcome: 'no_winner',
      isDifferent: true,
    });
    expect(usable.comparabilityNote).toMatch(/not an automatic win/);
    expect(metric(cars, 'battery.voltage_v').betterDirection).toBe('none');
  });

  it('battery warranty belongs to the warranty group and higher wins there', () => {
    const cars = [
      car('a', { specs: { 'battery.warranty_years': point(8, 'year') } }),
      car('b', { specs: { 'battery.warranty_years': point(10, 'year') } }),
    ];
    const m = metric(cars, 'battery.warranty_years');
    expect(m.group).toBe('warranty');
    expect(m.winners).toEqual(['b@EG']);
  });

  it('booleans follow their definition: none → no winner, higher → "yes" wins', () => {
    const cars = [
      car('a', { specs: { 'comfort.heat_pump': point(true), 'safety.aeb': point(true) } }),
      car('b', { specs: { 'comfort.heat_pump': point(false), 'safety.aeb': point(false) } }),
    ];
    expect(metric(cars, 'comfort.heat_pump')).toMatchObject({
      outcome: 'no_winner',
      isDifferent: true,
    });
    expect(metric(cars, 'safety.aeb').winners).toEqual(['a@EG']);
  });

  it('equal values are a tie, not a win', () => {
    const cars = [
      car('a', { specs: { 'safety.airbags': point(8) } }),
      car('b', { specs: { 'safety.airbags': point(8) } }),
    ];
    expect(metric(cars, 'safety.airbags')).toMatchObject({
      outcome: 'tie',
      winners: [],
      isDifferent: false,
    });
  });

  it('several winners when the best value is shared by some cars', () => {
    const cars = [
      car('a', { specs: { 'safety.airbags': point(8) } }),
      car('b', { specs: { 'safety.airbags': point(8) } }),
      car('c', { specs: { 'safety.airbags': point(6) } }),
    ];
    expect(metric(cars, 'safety.airbags')).toMatchObject({
      outcome: 'winner',
      winners: ['a@EG', 'b@EG'],
    });
  });

  it('non-comparable definitions are left out; engine displacement is not applicable to a BEV', () => {
    const cars = [car('a'), car('b', { powertrainType: 'PHEV' })];
    expect(has(cars, 'tech.screen_in')).toBe(false);
    expect(metric(cars, 'performance.engine_displacement_l').values[0].status).toBe(
      'not_applicable',
    );
  });
});

describe('comparison engine — price', () => {
  it('lower price wins in the same currency, with type, date and source kept', () => {
    const m = metric(
      [
        car('a', { price: price('1500000.00') }),
        car('b', { price: price('1450000.00', 'EGP', 'dealer') }),
      ],
      'price.current',
    );
    expect(m).toMatchObject({
      comparability: 'comparable',
      winners: ['b@EG'],
      unit: 'EGP',
      kind: 'money',
    });
    expect(m.values[0]).toMatchObject({
      value: '1500000.00',
      condition: { priceType: 'official_msrp', currency: 'EGP', effectiveFrom: '2026-01-01' },
    });
    expect(m.comparabilityNote).toMatch(/different price types/);
  });

  it('different currencies are never converted and never decide a winner', () => {
    const m = metric(
      [
        car('a', { price: price('1500000.00', 'EGP') }),
        car('b', { key: 'b@SA', price: price('150000.00', 'SAR') }),
      ],
      'price.current',
    );
    expect(m.comparability).toBe('different_currency');
    expect(m.outcome).toBe('no_winner');
    expect(m.values.map((v) => v.value)).toEqual(['1500000.00', '150000.00']);
  });

  it('a foreign-currency estimate is flagged as not an official local price', () => {
    const m = metric(
      [
        car('a', {
          price: price('30000.00', 'USD', 'market_estimate', { inMarketCurrency: false }),
        }),
        car('b', { price: price('1450000.00') }),
      ],
      'price.current',
    );
    expect(m.comparability).toBe('different_currency');
    expect(m.values[0].note).toMatch(/not an official local price/);
  });
});

describe('comparison engine — views and summary', () => {
  const cars = [
    car('a', {
      price: price('1500000.00'),
      ranges: [range('WLTP', 500)],
      specs: {
        'battery.usable_kwh': point(75, 'kWh'),
        'performance.accel_0_100_s': point(6, 's'),
        'safety.airbags': point(8),
        'dimensions.length_mm': point(4700, 'mm'),
      },
    }),
    car('b', {
      price: price('1400000.00'),
      ranges: [range('WLTP', 480)],
      specs: {
        'battery.usable_kwh': point(70, 'kWh'),
        'performance.accel_0_100_s': point(7, 's'),
        'safety.airbags': point(8),
        'dimensions.length_mm': point(4700, 'mm'),
      },
    }),
  ];

  it('groups follow the §7 order and the detailed view lists every row', () => {
    const r = compareCars(cars, DEFS, { lang: 'en', view: 'detailed', differencesOnly: false });
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
    const all = r.groups.flatMap((g) => g.metrics.map((m) => m.key));
    expect(all).toContain('dimensions.length_mm');
    expect(all).toContain('consumption.electricity');
  });

  it('summary view keeps the key rows only', () => {
    const r = compareCars(cars, DEFS, { lang: 'en', view: 'summary', differencesOnly: false });
    const keys = r.groups.flatMap((g) => g.metrics.map((m) => m.key));
    expect(keys).toEqual(
      expect.arrayContaining([
        'price.current',
        'range.electric',
        'battery.usable_kwh',
        'charging.dc_peak_kw',
      ]),
    );
    expect(keys).not.toContain('dimensions.length_mm');
    expect(r.groups.flatMap((g) => g.metrics).every((m) => m.isKey)).toBe(true);
  });

  it('differences only hides rows where every car shows the same value', () => {
    const r = compareCars(cars, DEFS, { lang: 'en', view: 'detailed', differencesOnly: true });
    const keys = r.groups.flatMap((g) => g.metrics.map((m) => m.key));
    expect(keys).not.toContain('safety.airbags');
    expect(keys).not.toContain('dimensions.length_mm');
    expect(keys).not.toContain('practicality.trunk_l'); // missing for both → same
    expect(keys).toEqual(
      expect.arrayContaining(['price.current', 'range.electric', 'battery.usable_kwh']),
    );
  });

  it('summary counts decided rows per car and never names an overall winner', () => {
    const r = compareCars(cars, DEFS, { lang: 'en', view: 'detailed', differencesOnly: false });
    expect(r.summary.winsByCar).toEqual([
      { carKey: 'a@EG', wins: 2 }, // range, acceleration
      { carKey: 'b@EG', wins: 1 }, // price
    ]);
    expect(r.summary.decidedMetrics).toBe(3);
    expect(r.summary).not.toHaveProperty('overallWinner');
    expect(r.summary.missingDataMetrics).toBeGreaterThan(0);
  });

  it('labels and notes are localized', () => {
    const ar = metric(
      [car('a', { ranges: [range('WLTP', 500)] }), car('b', { ranges: [range('CLTC', 700)] })],
      'range.electric',
      'ar',
    );
    expect(ar.label).toBe('المدى الكهربائي');
    expect(ar.comparabilityNote).toMatch(/دورات قياس مختلفة/);
    const r = compareCars(cars, DEFS, { lang: 'ar', view: 'summary', differencesOnly: false });
    expect(r.groups[0].label).toBe('السعر');
  });

  it('is deterministic (same facts, same result)', () => {
    const a = compareCars(cars, DEFS, { lang: 'en', view: 'detailed', differencesOnly: false });
    const b = compareCars(cars, DEFS, { lang: 'en', view: 'detailed', differencesOnly: false });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
