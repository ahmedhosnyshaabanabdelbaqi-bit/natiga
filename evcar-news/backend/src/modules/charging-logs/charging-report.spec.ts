import { Decimal } from '../../common/money/money';
import { buildReport, type ReportLog, vehicleReport } from './charging-report';

const V = 'veh-1';
let day = 0;
function log(
  energyKwh: number,
  odometerKm: number | null,
  cost: number | null = null,
  currency: string | null = cost === null ? null : 'EGP',
  locationType = 'home',
): ReportLog {
  day += 1;
  return {
    userVehicleId: V,
    chargedAt: new Date(Date.UTC(2026, 6, day)),
    energyKwh,
    cost: cost === null ? null : new Decimal(cost),
    currency,
    odometerKm,
    locationType,
  };
}

beforeEach(() => {
  day = 0;
});

describe('vehicleReport (odometer-delta consumption)', () => {
  it('no sessions → insufficient data everywhere', () => {
    const r = vehicleReport(V, 'Car', []);
    expect(r.sessions).toBe(0);
    expect(r.consumption).toMatchObject({
      status: 'insufficient_data',
      reason: 'no_sessions',
      kwhPer100km: null,
    });
    expect(r.distance.km).toBeNull();
    expect(r.costPer100km.value).toBeNull();
  });

  it('needs two odometer readings', () => {
    const r = vehicleReport(V, 'Car', [log(30, 1000), log(20, null)]);
    expect(r.consumption).toMatchObject({
      status: 'insufficient_data',
      reason: 'fewer_than_two_odometer_readings',
    });
    expect(r.energyKwh).toBe(50);
  });

  it('no distance between readings → insufficient (never divides by zero)', () => {
    const r = vehicleReport(V, 'Car', [log(30, 1000), log(20, 1000)]);
    expect(r.consumption).toMatchObject({
      status: 'insufficient_data',
      reason: 'no_distance',
      kwhPer100km: null,
    });
  });

  it('computes consumption from energy after the first reading ÷ distance', () => {
    // first reading 1000 km (its energy is not counted), then 20 + 25 + 27 kWh over 400 km
    const r = vehicleReport(V, 'Car', [
      log(40, 1000, 80),
      log(20, 1100, 40),
      log(25, 1250, 50),
      log(27, 1400, 54),
    ]);
    expect(r.distance).toEqual({ km: 400, status: 'ok', reason: null });
    expect(r.consumption).toMatchObject({
      status: 'ok',
      kwhPer100km: 18,
      confidence: 'medium',
      intervals: 3,
    });
    // cost over the same window: 144 EGP / 400 km × 100
    expect(r.costPer100km).toEqual({
      value: { amount: '36.00', currency: 'EGP' },
      status: 'ok',
      reason: null,
    });
    expect(r.spend).toEqual([{ amount: '224.00', currency: 'EGP' }]);
  });

  it('low confidence with few intervals / short distance', () => {
    const r = vehicleReport(V, 'Car', [log(40, 1000), log(20, 1100)]);
    expect(r.consumption).toMatchObject({ kwhPer100km: 20, confidence: 'low' });
  });

  it('cost per 100 km needs costs on every session of the window, in one currency', () => {
    const missing = vehicleReport(V, 'Car', [
      log(40, 1000, 80),
      log(20, 1100, null),
      log(25, 1250, 50),
    ]);
    expect(missing.consumption.status).toBe('ok');
    expect(missing.costPer100km).toEqual({
      value: null,
      status: 'insufficient_data',
      reason: 'missing_costs',
    });
    day = 0;
    const mixed = vehicleReport(V, 'Car', [
      log(40, 1000, 80),
      log(20, 1100, 40, 'EGP'),
      log(25, 1250, 50, 'SAR'),
    ]);
    expect(mixed.costPer100km.reason).toBe('mixed_currencies');
    expect(mixed.spend).toEqual([
      { amount: '120.00', currency: 'EGP' },
      { amount: '50.00', currency: 'SAR' },
    ]);
  });
});

describe('buildReport', () => {
  it('totals, per-currency spend (never converted), locations and months', () => {
    const logs = [
      log(40, 1000, 80, 'EGP', 'home'),
      log(20, 1100, null, null, 'public'),
      log(10, null, 30, 'EGP', 'public'),
    ];
    const r = buildReport(logs, [{ id: V, displayName: 'Car' }]);
    expect(r.totals).toEqual({
      sessions: 3,
      energyKwh: 70,
      sessionsWithCost: 2,
      sessionsWithoutCost: 1,
      spend: [{ amount: '110.00', currency: 'EGP' }],
      averageCostPerKwh: [{ amount: '2.2', currency: 'EGP' }],
    });
    expect(r.byLocationType).toEqual([
      { locationType: 'home', sessions: 1, energyKwh: 40 },
      { locationType: 'public', sessions: 2, energyKwh: 30 },
    ]);
    expect(r.months).toEqual([
      {
        month: '2026-07',
        sessions: 3,
        energyKwh: 70,
        spend: [{ amount: '110.00', currency: 'EGP' }],
      },
    ]);
    expect(r.vehicles).toHaveLength(1);
  });

  it('an empty period is valid and all zeros are counts, not missing values', () => {
    const r = buildReport([], [{ id: V, displayName: 'Car' }]);
    expect(r.totals.spend).toEqual([]);
    expect(r.totals.averageCostPerKwh).toEqual([]);
    expect(r.vehicles[0].consumption.reason).toBe('no_sessions');
  });
});
