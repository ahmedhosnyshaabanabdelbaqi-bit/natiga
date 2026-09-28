/**
 * Charging-log report (REQUIREMENTS §14): spend, energy, distance,
 * consumption and cost per 100 km computed ONLY from what the user logged.
 * Pure (no I/O). When the logs cannot support a figure it is null with
 * `status: 'insufficient_data'` and a reason code — nothing is estimated
 * from the catalog or filled with 0.
 *
 * Consumption (odometer-delta method), per car, over the period:
 *   first = earliest log with an odometer reading, last = latest one
 *   distance = odometer(last) − odometer(first)
 *   energy   = Σ energy of the logs AFTER `first` up to and including `last`
 *              (the energy that replaced what was used over that distance)
 *   kWh/100 km = energy ÷ distance × 100 (energy as logged, i.e. usually
 *              measured by the charger / meter — grid side)
 * It assumes a similar battery level at the first and last sessions; more
 * sessions make it more accurate (confidence low under 3 intervals or 300 km).
 */
import { Decimal } from '../../common/money/money';
import type { Money } from '../../common/money/money';

export interface ReportLog {
  userVehicleId: string;
  chargedAt: Date;
  energyKwh: number;
  cost: Decimal | null;
  currency: string | null;
  odometerKm: number | null;
  locationType: string;
}

export type InsufficientReason =
  | 'no_sessions'
  | 'fewer_than_two_odometer_readings'
  | 'no_distance'
  | 'missing_costs'
  | 'mixed_currencies';

export interface Figure<T> {
  status: 'ok' | 'insufficient_data';
  reason: InsufficientReason | null;
  value: T | null;
}

export interface VehicleReport {
  vehicleId: string;
  displayName: string;
  sessions: number;
  energyKwh: number;
  spend: Money[];
  distance: {
    km: number | null;
    status: Figure<number>['status'];
    reason: InsufficientReason | null;
  };
  consumption: {
    kwhPer100km: number | null;
    status: Figure<number>['status'];
    reason: InsufficientReason | null;
    method: 'odometer_delta';
    basis: 'energy_logged';
    confidence: 'medium' | 'low' | null;
    intervals: number;
  };
  costPer100km: {
    value: Money | null;
    status: Figure<Money>['status'];
    reason: InsufficientReason | null;
  };
}

export interface ChargingReport {
  totals: {
    sessions: number;
    energyKwh: number;
    sessionsWithCost: number;
    sessionsWithoutCost: number;
    spend: Money[];
    averageCostPerKwh: Money[];
  };
  byLocationType: { locationType: string; sessions: number; energyKwh: number }[];
  months: { month: string; sessions: number; energyKwh: number; spend: Money[] }[];
  vehicles: VehicleReport[];
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r1 = (v: number) => Math.round(v * 10) / 10;

function spendOf(logs: ReportLog[]): Money[] {
  const by = new Map<string, Decimal>();
  for (const l of logs) {
    if (l.cost === null || !l.currency) continue;
    by.set(l.currency, (by.get(l.currency) ?? new Decimal(0)).plus(l.cost));
  }
  return [...by.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => ({ amount: amount.toFixed(2), currency }));
}

export const CONSUMPTION_MIN_INTERVALS = 3;
export const CONSUMPTION_MIN_KM = 300;

export function vehicleReport(
  vehicleId: string,
  displayName: string,
  logs: ReportLog[],
): VehicleReport {
  const sorted = [...logs].sort((a, b) => a.chargedAt.getTime() - b.chargedAt.getTime());
  const energy = sorted.reduce((s, l) => s + l.energyKwh, 0);
  const base = {
    vehicleId,
    displayName,
    sessions: sorted.length,
    energyKwh: r3(energy),
    spend: spendOf(sorted),
  };
  const insufficient = (reason: InsufficientReason, intervals = 0): VehicleReport => ({
    ...base,
    distance: { km: null, status: 'insufficient_data', reason },
    consumption: {
      kwhPer100km: null,
      status: 'insufficient_data',
      reason,
      method: 'odometer_delta',
      basis: 'energy_logged',
      confidence: null,
      intervals,
    },
    costPer100km: { value: null, status: 'insufficient_data', reason },
  });
  if (!sorted.length) return insufficient('no_sessions');

  const withOdo = sorted.filter((l) => l.odometerKm !== null);
  if (withOdo.length < 2) return insufficient('fewer_than_two_odometer_readings');
  const first = withOdo[0];
  const last = withOdo[withOdo.length - 1];
  const km = last.odometerKm! - first.odometerKm!;
  if (!(km > 0)) return insufficient('no_distance', withOdo.length - 1);

  const iFirst = sorted.indexOf(first);
  const iLast = sorted.indexOf(last);
  const window = sorted.slice(iFirst + 1, iLast + 1);
  const windowEnergy = window.reduce((s, l) => s + l.energyKwh, 0);
  const intervals = withOdo.length - 1;
  const kwhPer100 = (windowEnergy / km) * 100;
  const confidence: 'medium' | 'low' =
    intervals < CONSUMPTION_MIN_INTERVALS || km < CONSUMPTION_MIN_KM ? 'low' : 'medium';

  let costPer100km: VehicleReport['costPer100km'];
  const currencies = new Set(window.map((l) => l.currency).filter((c): c is string => !!c));
  if (window.some((l) => l.cost === null)) {
    costPer100km = { value: null, status: 'insufficient_data', reason: 'missing_costs' };
  } else if (currencies.size !== 1) {
    costPer100km = { value: null, status: 'insufficient_data', reason: 'mixed_currencies' };
  } else {
    const total = window.reduce((s, l) => s.plus(l.cost!), new Decimal(0));
    costPer100km = {
      value: { amount: total.div(km).times(100).toFixed(2), currency: [...currencies][0] },
      status: 'ok',
      reason: null,
    };
  }

  return {
    ...base,
    distance: { km: r1(km), status: 'ok', reason: null },
    consumption: {
      kwhPer100km: Math.round(kwhPer100 * 100) / 100,
      status: 'ok',
      reason: null,
      method: 'odometer_delta',
      basis: 'energy_logged',
      confidence,
      intervals,
    },
    costPer100km,
  };
}

export function buildReport(
  logs: ReportLog[],
  vehicles: { id: string; displayName: string }[],
): ChargingReport {
  const withCost = logs.filter((l) => l.cost !== null && l.currency);
  const energyByCurrency = new Map<string, number>();
  for (const l of withCost)
    energyByCurrency.set(l.currency!, (energyByCurrency.get(l.currency!) ?? 0) + l.energyKwh);
  const spend = spendOf(logs);

  const byLoc = new Map<string, { sessions: number; energyKwh: number }>();
  for (const l of logs) {
    const e = byLoc.get(l.locationType) ?? { sessions: 0, energyKwh: 0 };
    e.sessions += 1;
    e.energyKwh += l.energyKwh;
    byLoc.set(l.locationType, e);
  }

  const byMonth = new Map<string, ReportLog[]>();
  for (const l of logs) {
    const key = l.chargedAt.toISOString().slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), l]);
  }

  return {
    totals: {
      sessions: logs.length,
      energyKwh: r3(logs.reduce((s, l) => s + l.energyKwh, 0)),
      sessionsWithCost: withCost.length,
      sessionsWithoutCost: logs.length - withCost.length,
      spend,
      averageCostPerKwh: spend.map((m) => ({
        amount: new Decimal(m.amount)
          .div(energyByCurrency.get(m.currency)!)
          .toDecimalPlaces(4)
          .toString(),
        currency: m.currency,
      })),
    },
    byLocationType: [...byLoc.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([locationType, v]) => ({
        locationType,
        sessions: v.sessions,
        energyKwh: r3(v.energyKwh),
      })),
    months: [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, ls]) => ({
        month,
        sessions: ls.length,
        energyKwh: r3(ls.reduce((s, l) => s + l.energyKwh, 0)),
        spend: spendOf(ls),
      })),
    vehicles: vehicles.map((v) =>
      vehicleReport(
        v.id,
        v.displayName,
        logs.filter((l) => l.userVehicleId === v.id),
      ),
    ),
  };
}
