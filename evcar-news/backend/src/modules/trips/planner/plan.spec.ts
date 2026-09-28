import { cumulativeKm, haversineKm, projectOnLine, simplify } from './geo';
import { combineOpen, planStops, type PlannerCandidate, type PlannerInput } from './plan';

const always = () => 'open' as const;

function station(
  id: string,
  alongKm: number,
  opts: Partial<PlannerCandidate> = {},
): PlannerCandidate {
  return {
    id,
    alongKm,
    offsetKm: 0,
    connector: { typeCode: 'ccs2', current: 'DC', maxUsableKw: 100 },
    operationalStatus: 'operational',
    accessType: 'public',
    openAt: always,
    ...opts,
  };
}

// 60 kWh usable, 20 kWh/100 km, no margin → 0.2 kWh/km; 10 % reserve = 6 kWh.
const base: PlannerInput = {
  routeKm: 420,
  routeMinutes: 252,
  departureAt: new Date('2026-09-25T06:00:00Z'),
  vehicle: {
    usableKwh: 60,
    efficiency: 0.9,
    acMaxKw: 11,
    dcPeakKw: 100,
    dcCurve: [
      { socPercent: 0, powerKw: 100 },
      { socPercent: 100, powerKw: 100 },
    ],
    hasDc: true,
  },
  consumptionKwhPer100km: 20,
  consumptionMarginPercent: 0,
  startSoc: 90,
  reserveSoc: 10,
  chargeToSoc: 80,
  candidates: [],
};

describe('geo helpers', () => {
  it('haversine ~ 111 km per degree of latitude', () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.19, 1);
  });

  it('projects a point on a polyline', () => {
    const line: [number, number][] = [
      [0, 0],
      [0, 1],
      [0, 2],
    ];
    const cum = cumulativeKm(line);
    const p = projectOnLine(line, cum, { lat: 1.5, lng: 0.01 });
    expect(p.alongKm).toBeCloseTo(166.8, 0);
    expect(p.offsetKm).toBeCloseTo(1.11, 1);
  });

  it('simplify keeps first and last', () => {
    const line = Array.from({ length: 100 }, (_, i) => [i, 0] as [number, number]);
    const s = simplify(line, 10);
    expect(s).toHaveLength(10);
    expect(s[0]).toEqual([0, 0]);
    expect(s[9]).toEqual([99, 0]);
  });
});

describe('planStops', () => {
  it('no stop when the destination is reachable with the reserve', () => {
    const r = planStops({ ...base, routeKm: 200 });
    // range = (54 − 6) / 0.2 = 240 km
    expect(r).toMatchObject({ feasible: true, stops: [], arrivalSoc: 23.3, energyUsedKwh: 40 });
  });

  it('picks the farthest reachable DC station, keeps the reserve and proposes an alternative', () => {
    const r = planStops({
      ...base,
      candidates: [
        station('near', 100),
        station('far', 230),
        station('too-far', 260),
        station('ac', 235, { connector: { typeCode: 'type2', current: 'AC', maxUsableKw: 22 } }),
      ],
    });
    expect(r.feasible).toBe(true);
    if (!r.feasible) return;
    expect(r.stops.map((s) => s.candidate.id)).toEqual(['far']);
    const s = r.stops[0];
    expect(s.alternative?.id).toBe('near');
    expect(s.arrivalSoc).toBeCloseTo(13.3, 1); // 90 % − 46 kWh / 60 kWh
    // still 190 km = 38 kWh + 6 kWh reserve = 73.3 % (+1 % margin) → charge to 75 % only
    expect(s.departureSoc).toBe(75);
    expect(s.chargeKwh).toBeCloseTo(37, 1);
    expect(s.gridKwh).toBeCloseTo(41.11, 1);
    expect(s.chargeMethod).toBe('dc_curve');
    expect(s.chargeMinutes).toBe(22); // 37 kWh at 100 kW
    expect(s.driveKm).toBe(230);
    expect(s.driveMinutes).toBe(138);
    expect(r.arrivalSoc).toBeCloseTo(11.7, 1); // reserve kept (≥ 10 %)
  });

  it('refuses (no invented plan) when no station is reachable', () => {
    const r = planStops({ ...base, candidates: [station('x', 300)] });
    expect(r).toMatchObject({
      feasible: false,
      reason: 'no_reachable_station',
      atKm: 0,
      rangeKm: 240,
    });
  });

  it('several stops; charges only what is needed on the last one', () => {
    const r = planStops({
      ...base,
      routeKm: 700,
      routeMinutes: 420,
      candidates: [station('a', 230), station('b', 430), station('c', 600)],
    });
    expect(r.feasible).toBe(true);
    if (!r.feasible) return;
    expect(r.stops.map((s) => s.candidate.id)).toEqual(['a', 'b', 'c']);
    expect(r.stops.map((s) => s.departureSoc)).toEqual([80, 80, 45]);
    expect(r.arrivalSoc).toBeCloseTo(11.7, 1);
    // later ETAs include the earlier charging time
    // stop b = stop a + 24 min charging (40 kWh at 100 kW) + 200 km at 0.6 min/km
    expect(r.stops[1].etaLow.getTime()).toBe(r.stops[0].etaLow.getTime() + (24 + 120) * 60_000);
  });

  it('skips stations closed at the expected arrival, private or not operating', () => {
    const r = planStops({
      ...base,
      routeKm: 400,
      candidates: [
        station('closed', 230, { openAt: () => 'closed' }),
        station('private', 229, { accessType: 'private' }),
        station('down', 228, { operationalStatus: 'temporarily_unavailable' }),
        station('unknown-hours', 200, { openAt: () => 'unknown' }),
      ],
    });
    expect(r.feasible).toBe(true);
    if (!r.feasible) return;
    expect(r.stops[0].candidate.id).toBe('unknown-hours');
    expect(r.stops[0].openAtEta).toBe('unknown');
  });

  it('counts the detour to and from a station off the route', () => {
    const r = planStops({ ...base, candidates: [station('off', 230, { offsetKm: 15 })] });
    // 230 + 15 = 245 km > 240 km range → not reachable
    expect(r.feasible).toBe(false);
  });

  it('DC without a curve gives a charge-time range', () => {
    const r = planStops({
      ...base,
      vehicle: { ...base.vehicle, dcCurve: null },
      candidates: [station('far', 230)],
    });
    expect(r.feasible).toBe(true);
    if (!r.feasible) return;
    expect(r.stops[0].chargeMinutes).toBeNull();
    expect(r.stops[0].chargeMinutesRange).toEqual({ low: 25, high: 44 });
    expect(r.stops[0].etaHigh.getTime()).toBeGreaterThanOrEqual(r.stops[0].etaLow.getTime());
  });

  it('applies the consumption margin', () => {
    const r = planStops({ ...base, routeKm: 200, consumptionMarginPercent: 25 });
    // 0.25 kWh/km → range 192 km < 200 → a stop would be needed; none available
    expect(r.feasible).toBe(false);
  });

  it('combineOpen', () => {
    expect(combineOpen('open', 'open')).toBe('open');
    expect(combineOpen('closed', 'closed')).toBe('closed');
    expect(combineOpen('open', 'closed')).toBe('unknown');
  });
});
