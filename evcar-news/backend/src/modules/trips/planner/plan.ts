/**
 * Trip planner core (REQUIREMENTS §12) — pure, unit-tested.
 *
 * Energy model (all assumptions are returned to the client):
 *   kWh per km = consumption (kWh/100 km) × (1 + margin %) ÷ 100, applied
 *   to the battery (conservative: catalog ratings are grid-side, i.e.
 *   include charging losses). Reserve = the minimum arrival SoC, kept at
 *   EVERY arrival (stops and destination).
 * Stops (greedy): from the current point, among compatible, usable stations
 * reachable with the reserve kept (distance along the road + detour), prefer
 * DC when the car has DC charging, then the farthest one; the next best
 * reachable station is proposed as the alternative. Stations closed at the
 * expected arrival, private, planned, closed or temporarily unavailable are
 * skipped; unknown hours / status are allowed but lower the confidence.
 * Charge at a stop only up to what is needed (+ reserve), capped at
 * `chargeToSoc`. When no station can be reached the plan is refused — no
 * plan is invented.
 */
import { CalcInputError, chargeTime, type CurvePoint } from '../../calculators/engine';

export type OpenAt = 'open' | 'closed' | 'unknown';

export interface PlannerVehicle {
  usableKwh: number;
  efficiency: number;
  acMaxKw: number | null;
  dcPeakKw: number | null;
  dcCurve: CurvePoint[] | null;
  hasDc: boolean;
}

export interface PlannerCandidate {
  id: string;
  /** Distance along the route from the origin (km, road-scaled). */
  alongKm: number;
  /** Perpendicular distance from the route (km); detour = 2 × offset. */
  offsetKm: number;
  connector: { typeCode: string; current: 'AC' | 'DC'; maxUsableKw: number | null };
  operationalStatus: string;
  accessType: string;
  openAt: (at: Date) => OpenAt;
}

export interface PlannerInput {
  routeKm: number;
  routeMinutes: number;
  departureAt: Date;
  vehicle: PlannerVehicle;
  consumptionKwhPer100km: number;
  consumptionMarginPercent: number;
  startSoc: number;
  reserveSoc: number;
  chargeToSoc: number;
  candidates: PlannerCandidate[];
  maxStops?: number;
}

export interface PlannedStop {
  candidate: PlannerCandidate;
  alternative: PlannerCandidate | null;
  /** Road km driven from the previous point (incl. detours). */
  driveKm: number;
  driveMinutes: number;
  arrivalSoc: number;
  departureSoc: number;
  chargeKwh: number;
  gridKwh: number;
  chargeMinutes: number | null;
  chargeMinutesRange: { low: number; high: number } | null;
  chargeMethod: string | null;
  etaLow: Date;
  etaHigh: Date;
  openAtEta: OpenAt;
}

export type PlanResult =
  | {
      feasible: true;
      stops: PlannedStop[];
      finalLegKm: number;
      finalLegMinutes: number;
      arrivalSoc: number;
      energyUsedKwh: number;
      kwhPerKm: number;
    }
  | {
      feasible: false;
      reason: 'no_reachable_station' | 'too_many_stops' | 'charge_time_unknown';
      atKm: number;
      rangeKm: number;
      stops: PlannedStop[];
      kwhPerKm: number;
    };

const EXCLUDED_STATUS = new Set(['permanently_closed', 'planned', 'temporarily_unavailable']);
const EXCLUDED_ACCESS = new Set(['private']);

const r1 = (v: number) => Math.round(v * 10) / 10;

export function combineOpen(a: OpenAt, b: OpenAt): OpenAt {
  if (a === 'open' && b === 'open') return 'open';
  if (a === 'closed' && b === 'closed') return 'closed';
  return 'unknown';
}

export function planStops(input: PlannerInput): PlanResult {
  const v = input.vehicle;
  const kwhPerKm =
    (input.consumptionKwhPer100km * (1 + input.consumptionMarginPercent / 100)) / 100;
  const minPerKm = input.routeKm > 0 ? input.routeMinutes / input.routeKm : 1;
  const reserveKwh = (input.reserveSoc / 100) * v.usableKwh;
  const rangeFrom = (soc: number) =>
    Math.max(0, ((soc / 100) * v.usableKwh - reserveKwh) / kwhPerKm);
  const maxStops = input.maxStops ?? 12;

  let pos = 0;
  let back = 0; // detour km to get back to the route from the previous stop
  let soc = input.startSoc;
  let tLow = input.departureAt.getTime();
  let tHigh = tLow;
  let used = 0;
  const stops: PlannedStop[] = [];

  const usable = input.candidates.filter(
    (c) => !EXCLUDED_STATUS.has(c.operationalStatus) && !EXCLUDED_ACCESS.has(c.accessType),
  );

  for (;;) {
    const range = rangeFrom(soc);
    const toDest = input.routeKm - pos + back;
    if (toDest <= range + 1e-9) {
      used += toDest * kwhPerKm;
      return {
        feasible: true,
        stops,
        finalLegKm: r1(toDest),
        finalLegMinutes: Math.round(toDest * minPerKm),
        arrivalSoc: r1(soc - ((toDest * kwhPerKm) / v.usableKwh) * 100),
        energyUsedKwh: Math.round(used * 100) / 100,
        kwhPerKm,
      };
    }
    if (stops.length >= maxStops) {
      return {
        feasible: false,
        reason: 'too_many_stops',
        atKm: r1(pos),
        rangeKm: r1(range),
        stops,
        kwhPerKm,
      };
    }

    const reachable = usable
      .map((c) => {
        const driveKm = c.alongKm - pos + back + c.offsetKm;
        const etaLow = new Date(tLow + driveKm * minPerKm * 60_000);
        const etaHigh = new Date(tHigh + driveKm * minPerKm * 60_000);
        return {
          c,
          driveKm,
          etaLow,
          etaHigh,
          open: combineOpen(c.openAt(etaLow), c.openAt(etaHigh)),
        };
      })
      .filter((x) => x.c.alongKm > pos + 1 && x.driveKm <= range && x.open !== 'closed');
    const preferDc = v.hasDc && reachable.some((x) => x.c.connector.current === 'DC');
    const pool = (
      preferDc ? reachable.filter((x) => x.c.connector.current === 'DC') : reachable
    ).sort(
      (a, b) =>
        b.c.alongKm - a.c.alongKm ||
        (b.c.connector.maxUsableKw ?? 0) - (a.c.connector.maxUsableKw ?? 0),
    );
    const best = pool[0];
    if (!best) {
      return {
        feasible: false,
        reason: 'no_reachable_station',
        atKm: r1(pos),
        rangeKm: r1(range),
        stops,
        kwhPerKm,
      };
    }
    const alt =
      pool.find((x) => x.c.id !== best.c.id) ??
      reachable.filter((x) => x.c.id !== best.c.id).sort((a, b) => b.c.alongKm - a.c.alongKm)[0] ??
      null;

    const arrivalSoc = soc - ((best.driveKm * kwhPerKm) / v.usableKwh) * 100;
    used += best.driveKm * kwhPerKm;
    const needKwh = (input.routeKm - best.c.alongKm + best.c.offsetKm) * kwhPerKm + reserveKwh;
    const needSoc = Math.ceil((needKwh / v.usableKwh) * 100 + 1); // +1 % rounding margin
    const target = Math.min(input.chargeToSoc, Math.max(needSoc, Math.ceil(arrivalSoc) + 1));
    if (target <= arrivalSoc) {
      return {
        feasible: false,
        reason: 'no_reachable_station',
        atKm: r1(pos),
        rangeKm: r1(range),
        stops,
        kwhPerKm,
      };
    }

    let chargeMinutes: number | null;
    let chargeRange: { low: number; high: number } | null;
    let method: string | null;
    try {
      const out = chargeTime({
        currentType: best.c.connector.current,
        batteryUsableKwh: v.usableKwh,
        fromSocPercent: Math.max(0, r1(arrivalSoc)),
        toSocPercent: target,
        efficiency: v.efficiency,
        stationPowerKw: best.c.connector.maxUsableKw,
        vehicleAcMaxKw: best.c.connector.current === 'AC' ? v.acMaxKw : null,
        vehicleDcPeakKw: best.c.connector.current === 'DC' ? v.dcPeakKw : null,
        curve: best.c.connector.current === 'DC' ? v.dcCurve : null,
      });
      chargeMinutes = out.result.minutes;
      chargeRange = out.result.minutesRange;
      method = out.result.method;
    } catch (err) {
      if (!(err instanceof CalcInputError)) throw err;
      return {
        feasible: false,
        reason: 'charge_time_unknown',
        atKm: r1(pos),
        rangeKm: r1(range),
        stops,
        kwhPerKm,
      };
    }
    const chargeKwh = ((target - arrivalSoc) / 100) * v.usableKwh;
    const driveMinutes = best.driveKm * minPerKm;
    stops.push({
      candidate: best.c,
      alternative: alt?.c ?? null,
      driveKm: r1(best.driveKm),
      driveMinutes: Math.round(driveMinutes),
      arrivalSoc: r1(arrivalSoc),
      departureSoc: target,
      chargeKwh: Math.round(chargeKwh * 100) / 100,
      gridKwh: Math.round((chargeKwh / v.efficiency) * 100) / 100,
      chargeMinutes,
      chargeMinutesRange: chargeRange,
      chargeMethod: method,
      etaLow: best.etaLow,
      etaHigh: best.etaHigh,
      openAtEta: best.open,
    });
    tLow = best.etaLow.getTime() + (chargeMinutes ?? chargeRange!.low) * 60_000;
    tHigh = best.etaHigh.getTime() + (chargeMinutes ?? chargeRange!.high) * 60_000;
    pos = best.c.alongKm;
    back = best.c.offsetKm;
    soc = target;
  }
}
