/**
 * Battery ↔ grid energy (REQUIREMENTS §13):
 *   energy added to the battery  E_batt = usable capacity × (to% − from%) / 100
 *   energy drawn from the grid   E_grid = E_batt ÷ efficiency
 * Efficiency is in (0, 1] (default 0.90, always shown as an editable
 * assumption). When the user already entered grid-side energy (a meter /
 * charger reading, `energyBasis = "grid"`) no efficiency is applied — losses
 * are never counted twice.
 */
import {
  num,
  originOf,
  type CalcLang,
  type Problems,
  type ProvenanceMap,
  round,
  type Trace,
} from './core';

export const DEFAULT_EFFICIENCY = 0.9;
export type EnergyBasis = 'battery' | 'grid';

export const ENERGY_LABELS = {
  usable: { ar: 'السعة القابلة للاستخدام', en: 'Usable battery capacity' },
  fromSoc: { ar: 'نسبة الشحن في البداية', en: 'Start state of charge' },
  toSoc: { ar: 'نسبة الشحن في النهاية', en: 'End state of charge' },
  energyAdded: { ar: 'الطاقة المضافة للبطارية', en: 'Energy added to the battery' },
  gridEnergy: { ar: 'الطاقة المسحوبة من الشبكة', en: 'Energy drawn from the grid' },
  losses: { ar: 'فاقد الشحن', en: 'Charging losses' },
  efficiency: { ar: 'كفاءة الشحن', en: 'Charging efficiency' },
  energyBasis: { ar: 'أساس الطاقة المُدخلة', en: 'Basis of the entered energy' },
} as const;

export function energyAddedKwh(usableKwh: number, fromSoc: number, toSoc: number): number {
  return (usableKwh * (toSoc - fromSoc)) / 100;
}

export function gridEnergyKwh(batteryKwh: number, efficiency: number): number {
  if (!(efficiency > 0 && efficiency <= 1)) throw new RangeError('efficiency must be in (0, 1]');
  return batteryKwh / efficiency;
}

export interface SocWindow {
  usable: number;
  from: number;
  to: number;
}

/** Validates usable capacity + SoC window (0 ≤ from < to ≤ 100). */
export function readSocWindow(
  p: Problems,
  input: { batteryUsableKwh?: unknown; fromSocPercent?: unknown; toSocPercent?: unknown },
  required = true,
): SocWindow | undefined {
  const usable = num(p, 'batteryUsableKwh', input.batteryUsableKwh, {
    required,
    positive: true,
    max: 1000,
  });
  const from = num(p, 'fromSocPercent', input.fromSocPercent, { required, min: 0, max: 100 });
  const to = num(p, 'toSocPercent', input.toSocPercent, { required, min: 0, max: 100 });
  if (from !== undefined && to !== undefined && to <= from) {
    p.add('toSocPercent', 'greaterThanFrom', {
      ar: 'يجب أن تكون نسبة النهاية أكبر من نسبة البداية.',
      en: 'The end state of charge must be above the start.',
    });
    return undefined;
  }
  if (usable === undefined || from === undefined || to === undefined) return undefined;
  return { usable, from, to };
}

export function readEfficiency(p: Problems, raw: unknown): number | undefined {
  return num(p, 'efficiency', raw, { min: 0, max: 1, minExclusive: true });
}

/** Records the efficiency assumption and returns the value used. */
export function useEfficiency(
  trace: Trace,
  given: number | undefined,
  prov?: ProvenanceMap,
): { value: number; defaulted: boolean } {
  const defaulted = given === undefined;
  const value = given ?? DEFAULT_EFFICIENCY;
  trace.assume(
    'efficiency',
    ENERGY_LABELS.efficiency,
    value,
    null,
    defaulted ? 'default' : originOf(prov, 'efficiency').origin,
    defaulted
      ? pickNote(trace.lang, {
          ar: 'افتراض افتراضي قابل للتعديل (0 < الكفاءة ≤ 1).',
          en: 'Editable default assumption (0 < efficiency ≤ 1).',
        })
      : originOf(prov, 'efficiency').note,
  );
  return { value, defaulted };
}

function pickNote(lang: CalcLang, text: { ar: string; en: string }): string {
  return text[lang];
}

/** Adds the "energy added" step for a SoC window and returns kWh. */
export function traceEnergyAdded(trace: Trace, w: SocWindow, prov?: ProvenanceMap): number {
  trace.assume(
    'batteryUsableKwh',
    ENERGY_LABELS.usable,
    w.usable,
    'kWh',
    originOf(prov, 'batteryUsableKwh').origin,
    originOf(prov, 'batteryUsableKwh').note,
  );
  trace.assume('fromSocPercent', ENERGY_LABELS.fromSoc, w.from, '%', 'user');
  trace.assume('toSocPercent', ENERGY_LABELS.toSoc, w.to, '%', 'user');
  const added = energyAddedKwh(w.usable, w.from, w.to);
  trace.step(
    'energyAddedKwh',
    ENERGY_LABELS.energyAdded,
    `${w.usable} kWh × (${w.to}% − ${w.from}%) = ${round(added, 3)} kWh`,
    round(added, 3),
    'kWh',
  );
  return added;
}

export function traceGridEnergy(trace: Trace, added: number, efficiency: number): number {
  const grid = gridEnergyKwh(added, efficiency);
  trace.step(
    'gridEnergyKwh',
    ENERGY_LABELS.gridEnergy,
    `${round(added, 3)} kWh ÷ ${efficiency} = ${round(grid, 3)} kWh`,
    round(grid, 3),
    'kWh',
  );
  trace.step(
    'lossesKwh',
    ENERGY_LABELS.losses,
    `${round(grid, 3)} kWh − ${round(added, 3)} kWh = ${round(grid - added, 3)} kWh`,
    round(grid - added, 3),
    'kWh',
  );
  return grid;
}
