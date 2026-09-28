import {
  CalcInputError,
  chargeCost,
  chargeTime,
  costPer100km,
  curvePowerAt,
  DEFAULT_EFFICIENCY,
  energyAddedKwh,
  gridEnergyKwh,
  integrateCurve,
  monthlyCost,
  tco,
  vsFuel,
} from './index';

/** Runs fn and returns the CalcInputError problems as { field: rule[] }. */
function problemsOf(fn: () => unknown): Record<string, string[]> {
  try {
    fn();
  } catch (err) {
    if (err instanceof CalcInputError) {
      const out: Record<string, string[]> = {};
      for (const p of err.problems) (out[p.field] ??= []).push(p.rule);
      return out;
    }
    throw err;
  }
  throw new Error('expected a CalcInputError');
}

const PRICE = { currency: 'EGP', priceDate: '2026-09-01' };

describe('energy formulas', () => {
  it('REQUIRED VECTOR: 60 kWh usable, 20% → 80% adds 36 kWh; at 90 % efficiency grid = 40 kWh', () => {
    const added = energyAddedKwh(60, 20, 80);
    expect(added).toBeCloseTo(36, 10);
    expect(gridEnergyKwh(added, 0.9)).toBeCloseTo(40, 10);
  });

  it('efficiency must be in (0, 1]', () => {
    expect(() => gridEnergyKwh(10, 0)).toThrow(RangeError);
    expect(() => gridEnergyKwh(10, 1.1)).toThrow(RangeError);
    expect(() => gridEnergyKwh(10, -0.5)).toThrow(RangeError);
    expect(gridEnergyKwh(10, 1)).toBe(10);
  });
});

describe('charge-cost', () => {
  const base = {
    batteryUsableKwh: 60,
    fromSocPercent: 20,
    toSocPercent: 80,
    efficiency: 0.9,
    ...PRICE,
    tariff: { energyPerKwh: 2 },
  };

  it('uses the required vector: 36 kWh added, 40 kWh grid, cost = 40 × price', () => {
    const out = chargeCost(base, 'en');
    expect(out.result.energyAddedKwh).toBe(36);
    expect(out.result.gridEnergyKwh).toBe(40);
    expect(out.result.lossesKwh).toBe(4);
    expect(out.result.cost.energy).toEqual({ amount: '80.00', currency: 'EGP' });
    expect(out.result.cost.total).toEqual({ amount: '80.00', currency: 'EGP' });
    expect(out.result.costPerKwhAdded).toEqual({ amount: '2.2222', currency: 'EGP' });
    expect(out.confidence).toBe('high');
    expect(out.units).toMatchObject({ energy: 'kWh', money: 'EGP' });
    expect(out.steps.map((s) => s.key)).toEqual(
      expect.arrayContaining([
        'energyAddedKwh',
        'gridEnergyKwh',
        'lossesKwh',
        'energyCost',
        'total',
      ]),
    );
    expect(out.formula).toContain('efficiency');
    expect(out.disclaimer).toBeTruthy();
  });

  it('components not entered are null (not included), never 0', () => {
    const out = chargeCost(base);
    expect(out.result.cost).toMatchObject({
      time: null,
      sessionFee: null,
      parking: null,
      idle: null,
    });
  });

  it('defaults the efficiency to 0.9 as a visible, editable assumption (medium confidence)', () => {
    const { efficiency: _e, ...rest } = base;
    const out = chargeCost(rest);
    expect(DEFAULT_EFFICIENCY).toBe(0.9);
    expect(out.result.efficiencyApplied).toBe(0.9);
    expect(out.assumptions.find((a) => a.key === 'efficiency')).toMatchObject({
      value: 0.9,
      origin: 'default',
    });
    expect(out.confidence).toBe('medium');
  });

  it('grid-side energy is not divided by the efficiency again (no double counting)', () => {
    const out = chargeCost({
      energyKwh: 40,
      energyBasis: 'grid',
      efficiency: 0.9,
      ...PRICE,
      tariff: { energyPerKwh: 2 },
    });
    expect(out.result.gridEnergyKwh).toBe(40);
    expect(out.result.energyAddedKwh).toBeNull();
    expect(out.result.efficiencyApplied).toBeNull();
    expect(out.result.cost.total.amount).toBe('80.00');
    expect(out.warnings.map((w) => w.code)).toContain('EFFICIENCY_NOT_APPLIED');
  });

  it('battery-side energy entered directly is divided by the efficiency', () => {
    const out = chargeCost({
      energyKwh: 36,
      efficiency: 0.9,
      ...PRICE,
      tariff: { energyPerKwh: 1 },
    });
    expect(out.result.gridEnergyKwh).toBe(40);
  });

  it('applies time, session, parking and idle fees as entered', () => {
    const out = chargeCost({
      ...base,
      tariff: {
        energyPerKwh: 2,
        timePerHour: 6,
        sessionFee: 5,
        parkingPerMinute: 0.1,
        idlePerMinute: 1,
        idleGraceMinutes: 10,
      },
      chargingMinutes: 30,
      parkingMinutes: 60,
      idleMinutes: 25,
    });
    expect(out.result.cost).toEqual({
      energy: { amount: '80.00', currency: 'EGP' },
      time: { amount: '3.00', currency: 'EGP' },
      sessionFee: { amount: '5.00', currency: 'EGP' },
      parking: { amount: '6.00', currency: 'EGP' },
      idle: { amount: '15.00', currency: 'EGP' },
      total: { amount: '109.00', currency: 'EGP' },
    });
  });

  it('idle time inside the grace period costs nothing; flat parking fee', () => {
    const out = chargeCost({
      ...base,
      tariff: { idlePerHour: 60, idleGraceMinutes: 30, parkingFlat: 10 },
      idleMinutes: 20,
    });
    expect(out.result.cost.idle).toEqual({ amount: '0.00', currency: 'EGP' });
    expect(out.result.cost.parking).toEqual({ amount: '10.00', currency: 'EGP' });
    expect(out.result.cost.energy).toBeNull();
  });

  it('free charging (price 0) is valid', () => {
    const out = chargeCost({ ...base, tariff: { energyPerKwh: 0 } });
    expect(out.result.cost.total.amount).toBe('0.00');
  });

  it('there are no default prices: a tariff is required', () => {
    expect(problemsOf(() => chargeCost({ ...base, tariff: undefined }))).toEqual({
      tariff: ['required'],
    });
    expect(problemsOf(() => chargeCost({ ...base, tariff: {} }))).toEqual({ tariff: ['required'] });
  });

  it('warns when the price has no date', () => {
    const out = chargeCost({ ...base, priceDate: undefined });
    expect(out.result.priceDate).toBeNull();
    expect(out.warnings.map((w) => w.code)).toContain('PRICE_DATE_MISSING');
  });

  it('rejects missing, zero and negative inputs', () => {
    expect(problemsOf(() => chargeCost({ ...PRICE, tariff: { energyPerKwh: 1 } }))).toEqual({
      batteryUsableKwh: ['required'],
      fromSocPercent: ['required'],
      toSocPercent: ['required'],
    });
    expect(problemsOf(() => chargeCost({ ...base, batteryUsableKwh: 0 }))).toEqual({
      batteryUsableKwh: ['notZero'],
    });
    expect(problemsOf(() => chargeCost({ ...base, batteryUsableKwh: -60 }))).toEqual({
      batteryUsableKwh: ['positive'],
    });
    expect(problemsOf(() => chargeCost({ ...base, tariff: { energyPerKwh: -1 } }))).toEqual({
      'tariff.energyPerKwh': ['nonNegative'],
    });
    expect(problemsOf(() => chargeCost({ ...base, energyKwh: 0 }))).toEqual({
      energyKwh: ['notZero'],
    });
  });

  it('rejects SoC outside 0..100 and an end below the start', () => {
    expect(problemsOf(() => chargeCost({ ...base, toSocPercent: 120 }))).toEqual({
      toSocPercent: ['range'],
    });
    expect(problemsOf(() => chargeCost({ ...base, fromSocPercent: -5 }))).toEqual({
      fromSocPercent: ['range'],
    });
    expect(problemsOf(() => chargeCost({ ...base, fromSocPercent: 80, toSocPercent: 80 }))).toEqual(
      {
        toSocPercent: ['greaterThanFrom'],
      },
    );
  });

  it('rejects efficiency 0, above 1 and negative (never divides by zero)', () => {
    for (const efficiency of [0, 1.5, -0.9]) {
      expect(problemsOf(() => chargeCost({ ...base, efficiency }))).toEqual({
        efficiency: ['range'],
      });
    }
    expect(chargeCost({ ...base, efficiency: 1 }).result.gridEnergyKwh).toBe(36);
  });

  it('rejects non-numeric values and bad currencies / dates', () => {
    expect(
      problemsOf(() =>
        chargeCost({
          ...base,
          batteryUsableKwh: Number.NaN,
          currency: 'egp',
          priceDate: '2026-02-30',
        }),
      ),
    ).toEqual({ batteryUsableKwh: ['isNumber'], currency: ['currency'], priceDate: ['isDate'] });
  });

  it('time-based fees need their duration; one rate per component', () => {
    expect(problemsOf(() => chargeCost({ ...base, tariff: { timePerMinute: 1 } }))).toEqual({
      chargingMinutes: ['required'],
    });
    expect(
      problemsOf(() =>
        chargeCost({ ...base, tariff: { timePerMinute: 1, timePerHour: 60 }, chargingMinutes: 10 }),
      ),
    ).toEqual({ 'tariff.timePerHour': ['oneOf'] });
    expect(problemsOf(() => chargeCost({ ...base, tariff: { idlePerMinute: 1 } }))).toEqual({
      idleMinutes: ['required'],
    });
  });

  it('localizes labels (ar)', () => {
    const out = chargeCost(base, 'ar');
    expect(out.steps.find((s) => s.key === 'energyAddedKwh')?.label).toBe(
      'الطاقة المضافة للبطارية',
    );
    expect(out.formula).toContain('الكفاءة');
  });

  it('records catalog provenance of the battery capacity', () => {
    const out = chargeCost(base, 'en', {
      batteryUsableKwh: { origin: 'catalog', note: 'Source: X (verified)' },
    });
    expect(out.assumptions.find((a) => a.key === 'batteryUsableKwh')).toMatchObject({
      origin: 'catalog',
      note: 'Source: X (verified)',
      unit: 'kWh',
    });
  });
});

describe('charge-time AC', () => {
  const ac = {
    currentType: 'AC' as const,
    batteryUsableKwh: 60,
    fromSocPercent: 20,
    toSocPercent: 80,
    efficiency: 0.9,
  };

  it('uses the lowest of car, station and supply limits', () => {
    const out = chargeTime({ ...ac, vehicleAcMaxKw: 11, stationPowerKw: 22 });
    // 40 kWh grid ÷ 11 kW = 3.636 h = 218 min
    expect(out.result).toMatchObject({
      minutes: 218,
      powerKw: 11,
      limitingFactor: 'vehicle',
      method: 'ac_power_limit',
      gridEnergyKwh: 40,
      energyAddedKwh: 36,
    });
    expect(out.confidence).toBe('medium');
  });

  it('computes the supply limit from phases × volts × amps', () => {
    const out = chargeTime({
      ...ac,
      vehicleAcMaxKw: 11,
      stationPowerKw: 22,
      supplyPhases: 1,
      supplyAmps: 16,
    });
    // 1 × 230 × 16 = 3.68 kW → 40 / 3.68 h = 652 min
    expect(out.result.limitingFactor).toBe('supply');
    expect(out.result.powerKw).toBe(3.68);
    expect(out.result.minutes).toBe(652);
    expect(out.assumptions.find((a) => a.key === 'supplyVoltsPerPhase')).toMatchObject({
      value: 230,
      origin: 'default',
    });
  });

  it('is low confidence (with a warning) when the car limit is unknown', () => {
    const out = chargeTime({ ...ac, stationPowerKw: 7.4 });
    expect(out.confidence).toBe('low');
    expect(out.warnings.map((w) => w.code)).toContain('VEHICLE_AC_LIMIT_UNKNOWN');
    expect(out.result.limitingFactor).toBe('station');
  });

  it('refuses without any power limit, a zero power, or a bad phase count', () => {
    expect(problemsOf(() => chargeTime(ac))).toEqual({ stationPowerKw: ['required'] });
    expect(problemsOf(() => chargeTime({ ...ac, stationPowerKw: 0 }))).toEqual({
      stationPowerKw: ['notZero', 'required'],
    });
    expect(
      problemsOf(() => chargeTime({ ...ac, stationPowerKw: 7, supplyPhases: 2, supplyAmps: 16 })),
    ).toEqual({
      supplyPhases: ['isIn'],
    });
    expect(problemsOf(() => chargeTime({ ...ac, stationPowerKw: 7, supplyAmps: 16 }))).toEqual({
      supplyPhases: ['required'],
    });
  });

  it('requires the current type', () => {
    expect(
      problemsOf(() => chargeTime({ ...ac, currentType: undefined, stationPowerKw: 7 })),
    ).toEqual({
      currentType: ['required'],
    });
  });

  it('warns that charging above 90 % is slower', () => {
    const out = chargeTime({ ...ac, toSocPercent: 100, vehicleAcMaxKw: 11, stationPowerKw: 11 });
    expect(out.warnings.map((w) => w.code)).toContain('TOP_OFF_SLOWER');
  });
});

describe('charge-time DC', () => {
  const curve = [
    { socPercent: 0, powerKw: 100 },
    { socPercent: 50, powerKw: 100 },
    { socPercent: 80, powerKw: 50 },
    { socPercent: 100, powerKw: 10 },
  ];
  const dc = {
    currentType: 'DC' as const,
    batteryUsableKwh: 60,
    fromSocPercent: 10,
    toSocPercent: 50,
    efficiency: 0.9,
  };

  it('interpolates the curve linearly', () => {
    expect(curvePowerAt(curve, 25)).toBe(100);
    expect(curvePowerAt(curve, 65)).toBeCloseTo(75, 10);
    expect(curvePowerAt(curve, 90)).toBeCloseTo(30, 10);
  });

  it('integrates a flat section exactly: 24 kWh at 100 kW = 14.4 min', () => {
    const r = integrateCurve(curve, 60, 10, 50)!;
    expect(r.minutes).toBeCloseTo(14.4, 6);
    const out = chargeTime({ ...dc, curve });
    expect(out.result).toMatchObject({
      minutes: 14,
      method: 'dc_curve',
      isRoughEstimate: false,
      minutesRange: null,
    });
    expect(out.confidence).toBe('medium');
  });

  it('caps the curve at the station power', () => {
    const out = chargeTime({ ...dc, curve, stationPowerKw: 50 });
    // 24 kWh at 50 kW = 28.8 min
    expect(out.result.minutes).toBe(29);
    expect(out.result.limitingFactor).toBe('station');
  });

  it('integrates the tapering part (50 → 80 %)', () => {
    const r = integrateCurve(curve, 60, 50, 80)!;
    // analytic: ∫ 0.6 kWh/% ÷ P(s) ds with P from 100 → 50 linear = 0.6 × 30/50 × ln 2 h
    const expected = ((0.6 * 30) / 50) * Math.log(2) * 60;
    expect(r.minutes).toBeCloseTo(expected, 1);
  });

  it('without a curve returns a low-confidence RANGE, never energy ÷ peak as the answer', () => {
    const out = chargeTime({ ...dc, vehicleDcPeakKw: 150, stationPowerKw: 60 });
    expect(out.confidence).toBe('low');
    expect(out.result.minutes).toBeNull();
    expect(out.result.isRoughEstimate).toBe(true);
    expect(out.result.method).toBe('dc_rough_estimate');
    // 24 kWh / (0.9 × 60) = 26.7 min; / (0.5 × 60) = 48 min
    expect(out.result.minutesRange).toEqual({ low: 27, high: 48 });
    expect(out.warnings.map((w) => w.code)).toContain('NO_CHARGING_CURVE');
  });

  it('falls back to the rough range when the curve does not cover the window', () => {
    const partial = [
      { socPercent: 20, powerKw: 100 },
      { socPercent: 60, powerKw: 60 },
    ];
    const out = chargeTime({ ...dc, curve: partial, vehicleDcPeakKw: 100 });
    expect(out.result.method).toBe('dc_rough_estimate');
    expect(out.warnings.map((w) => w.code)).toContain('CURVE_NOT_USABLE');
    expect(problemsOf(() => chargeTime({ ...dc, curve: partial }))).toEqual({
      curve: ['coverage'],
    });
  });

  it('refuses a curve with zero power inside the window instead of dividing by zero', () => {
    const zero = [
      { socPercent: 0, powerKw: 0 },
      { socPercent: 100, powerKw: 0 },
    ];
    expect(integrateCurve(zero, 60, 10, 50)).toBeNull();
    expect(problemsOf(() => chargeTime({ ...dc, curve: zero }))).toEqual({ curve: ['coverage'] });
  });

  it('validates curves', () => {
    expect(
      problemsOf(() => chargeTime({ ...dc, curve: [{ socPercent: 0, powerKw: 50 }] })),
    ).toHaveProperty('curve');
    expect(
      problemsOf(() =>
        chargeTime({
          ...dc,
          curve: [
            { socPercent: 50, powerKw: 50 },
            { socPercent: 10, powerKw: 50 },
          ],
        }),
      ),
    ).toHaveProperty('curve', ['ascending']);
    expect(
      problemsOf(() =>
        chargeTime({
          ...dc,
          curve: [
            { socPercent: 0, powerKw: -1 },
            { socPercent: 100, powerKw: 50 },
          ],
        }),
      ),
    ).toHaveProperty(['curve.0.powerKw'], ['nonNegative']);
  });

  it('refuses without any DC data', () => {
    expect(problemsOf(() => chargeTime(dc))).toEqual({ stationPowerKw: ['required'] });
  });
});

describe('cost per 100 km / monthly / vs fuel', () => {
  const ev = { consumptionKwhPer100km: 18, electricityPricePerKwh: 2, ...PRICE };

  it('grid-basis consumption × price', () => {
    const out = costPer100km(ev);
    expect(out.result).toMatchObject({
      gridKwhPer100km: 18,
      costPer100km: { amount: '36.00', currency: 'EGP' },
      costPerKm: { amount: '0.36', currency: 'EGP' },
    });
    expect(out.confidence).toBe('high');
  });

  it('battery-basis consumption is divided by the efficiency; Wh/km is accepted', () => {
    const out = costPer100km({
      consumptionWhPerKm: 162,
      consumptionBasis: 'battery',
      efficiency: 0.9,
      electricityPricePerKwh: 2,
      ...PRICE,
    });
    expect(out.result.gridKwhPer100km).toBe(18);
    expect(out.result.costPer100km.amount).toBe('36.00');
  });

  it('does not apply efficiency to grid-basis consumption (warns instead)', () => {
    const out = costPer100km({ ...ev, efficiency: 0.8 });
    expect(out.result.gridKwhPer100km).toBe(18);
    expect(out.warnings.map((w) => w.code)).toContain('EFFICIENCY_NOT_APPLIED');
  });

  it('blends home and public prices by share', () => {
    const out = costPer100km({ ...ev, publicPricePerKwh: 6, publicSharePercent: 25 });
    // 2 × 0.75 + 6 × 0.25 = 3
    expect(out.result.pricePerKwh.amount).toBe('3');
    expect(out.result.costPer100km.amount).toBe('54.00');
  });

  it('requires consumption and price (no defaults); rejects zero/negative', () => {
    expect(problemsOf(() => costPer100km({ ...PRICE }))).toEqual({
      consumptionKwhPer100km: ['required'],
      electricityPricePerKwh: ['required'],
    });
    expect(problemsOf(() => costPer100km({ ...ev, consumptionKwhPer100km: 0 }))).toEqual({
      consumptionKwhPer100km: ['notZero'],
    });
    expect(problemsOf(() => costPer100km({ ...ev, electricityPricePerKwh: -2 }))).toEqual({
      electricityPricePerKwh: ['nonNegative'],
    });
    expect(problemsOf(() => costPer100km({ ...ev, publicSharePercent: 30 }))).toEqual({
      publicPricePerKwh: ['required'],
    });
    expect(problemsOf(() => costPer100km({ ...ev, consumptionWhPerKm: 180 }))).toEqual({
      consumptionWhPerKm: ['oneOf'],
    });
  });

  it('monthly cost from km per month (+ fixed fees) and per day', () => {
    const out = monthlyCost({ ...ev, kmPerMonth: 1000, fixedMonthlyFees: 50 });
    expect(out.result).toMatchObject({
      gridKwhPerMonth: 180,
      energyCostPerMonth: { amount: '360.00', currency: 'EGP' },
      fixedMonthlyFees: { amount: '50.00', currency: 'EGP' },
      totalPerMonth: { amount: '410.00', currency: 'EGP' },
      totalPerYear: { amount: '4920.00', currency: 'EGP' },
    });
    const daily = monthlyCost({ ...ev, kmPerDay: 40 });
    expect(daily.result.kmPerMonth).toBe(1217.5);
    expect(daily.result.fixedMonthlyFees).toBeNull();
    expect(problemsOf(() => monthlyCost(ev))).toEqual({ kmPerMonth: ['required'] });
    expect(problemsOf(() => monthlyCost({ ...ev, kmPerMonth: -5 }))).toEqual({
      kmPerMonth: ['positive'],
    });
  });

  it('EV vs fuel per 100 km and per month', () => {
    const out = vsFuel({
      ...ev,
      fuelConsumptionLPer100km: 8,
      fuelPricePerLiter: 15,
      kmPerMonth: 1500,
    });
    expect(out.result).toMatchObject({
      evCostPer100km: { amount: '36.00' },
      fuelCostPer100km: { amount: '120.00' },
      differencePer100km: { amount: '84.00' },
      savingPercent: 70,
      monthly: {
        km: 1500,
        ev: { amount: '540.00' },
        fuel: { amount: '1800.00' },
        difference: { amount: '1260.00' },
      },
      yearlyDifference: { amount: '15120.00' },
    });
    expect(out.warnings.map((w) => w.code)).toContain('ENERGY_ONLY');
  });

  it('vs fuel without a distance has no monthly part; free fuel → savingPercent null', () => {
    const out = vsFuel({ ...ev, fuelConsumptionLPer100km: 8, fuelPricePerLiter: 0 });
    expect(out.result.monthly).toBeNull();
    expect(out.result.savingPercent).toBeNull();
    expect(problemsOf(() => vsFuel(ev))).toEqual({
      fuelConsumptionLPer100km: ['required'],
      fuelPricePerLiter: ['required'],
    });
  });
});

describe('tco', () => {
  const input = {
    years: 5,
    kmPerYear: 15000,
    consumptionKwhPer100km: 18,
    electricityPricePerKwh: 2,
    ...PRICE,
    ev: {
      purchasePrice: 1_000_000,
      residualValue: 400_000,
      insurancePerYear: 20_000,
      maintenancePerYear: 3000,
    },
  };

  it('separates energy from the other costs and lists what was not entered', () => {
    const out = tco(input);
    // energy = 75,000 km × 0.36 = 27,000
    expect(out.result.totalKm).toBe(75000);
    expect(out.result.ev).toMatchObject({
      purchase: { amount: '1000000.00' },
      residualValue: { amount: '400000.00' },
      energy: { amount: '27000.00' },
      insurance: { amount: '100000.00' },
      maintenance: { amount: '15000.00' },
      incentives: null,
      fees: null,
      oneOff: null,
      nonEnergy: { amount: '715000.00' },
      total: { amount: '742000.00' },
      perKm: { amount: '9.8933' },
      excluded: ['incentives', 'feesPerYear', 'oneOffCosts'],
    });
    expect(out.result.fuelCar).toBeNull();
    expect(out.result.difference).toBeNull();
    expect(out.warnings.map((w) => w.code)).toContain('COMPONENTS_NOT_INCLUDED');
    expect(out.assumptions.find((a) => a.key === 'constantPrices')).toMatchObject({
      origin: 'default',
    });
  });

  it('compares with a fuel car', () => {
    const out = tco({
      ...input,
      fuelCar: { purchasePrice: 800_000, fuelConsumptionLPer100km: 8, fuelPricePerLiter: 15 },
    });
    // fuel = 750 × 8 × 15 = 90,000 → total 890,000
    expect(out.result.fuelCar?.total.amount).toBe('890000.00');
    expect(out.result.difference?.amount).toBe('148000.00');
  });

  it('validates years, distance and purchase price', () => {
    expect(problemsOf(() => tco({ ...input, years: 0, kmPerYear: -1, ev: {} }))).toEqual({
      years: ['notZero'],
      kmPerYear: ['positive'],
      'ev.purchasePrice': ['required'],
    });
    expect(problemsOf(() => tco({ ...input, fuelCar: { purchasePrice: 1 } }))).toEqual({
      'fuelCar.fuelConsumptionLPer100km': ['required'],
      'fuelCar.fuelPricePerLiter': ['required'],
    });
  });
});
