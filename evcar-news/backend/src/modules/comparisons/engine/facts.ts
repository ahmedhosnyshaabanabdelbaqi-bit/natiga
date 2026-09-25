/**
 * CarFacts helpers: building facts from a vehicles spec sheet, powertrain
 * applicability rules and measuring-basis identities (cycles, modes, SoC
 * windows). Pure functions.
 */
import type { DataPointDto, InletDto } from '../../vehicles/dto/shared.dto';
import type { VariantSheetDto } from '../../vehicles/dto/public.dto';
import type { CarFacts } from './types';

export const carKey = (variantId: string, market: string): string =>
  `${variantId.toLowerCase()}@${market.toUpperCase()}`;

/** Facts of one trim from its public spec sheet (already scoped to the market). */
export function factsFromSheet(sheet: VariantSheetDto): CarFacts {
  const specs = new Map<string, DataPointDto>();
  for (const g of sheet.specGroups) {
    for (const item of g.items) if (item.point) specs.set(item.key, item.point);
  }
  return {
    key: carKey(sheet.id, sheet.market.code),
    powertrainType: sheet.powertrainType,
    seats: sheet.seats,
    doors: sheet.doors,
    driveType: sheet.driveType,
    marketCurrency: sheet.market.currencyCode,
    price: sheet.price.current,
    ranges: sheet.ranges,
    consumption: sheet.consumption,
    chargingTimes: sheet.charging.times,
    inlets: sheet.charging.inlets,
    specs,
  };
}

// --- powertrain applicability (vehicles decisions §3 "Powertrain separation") ---

const PLUG_IN = new Set(['BEV', 'PHEV', 'EREV']);

export const isPlugIn = (p: string): boolean => PLUG_IN.has(p);
/** Electric range / electricity consumption / charging: plug-ins only. */
export const hasElectricDrive = isPlugIn;
/** Total range and fuel consumption: hybrids with an engine. */
export const hasEngine = (p: string): boolean => p !== 'BEV';

/** DC capability from structured inlet data: true / false / null (unknown). */
export function dcCapability(car: Pick<CarFacts, 'inlets' | 'powertrainType'>): boolean | null {
  if (!isPlugIn(car.powertrainType)) return false;
  if (car.inlets.length === 0) return null;
  return car.inlets.some((i) => i.currentType === 'DC');
}

/** Max inlet power of a current type (market data), null when unknown. */
export function inletMax(inlets: InletDto[], current: 'AC' | 'DC'): InletDto | null {
  let best: InletDto | null = null;
  for (const i of inlets) {
    if (i.currentType !== current || i.maxPowerKw === null) continue;
    if (!best || (i.maxPowerKw ?? 0) > (best.maxPowerKw ?? 0)) best = i;
  }
  return best;
}

// --- measuring bases ------------------------------------------------------------

export const CYCLE_ORDER = ['WLTP', 'EPA', 'CLTC', 'NEDC', 'OTHER'];

/** Identity of a test cycle: OTHER cycles are only equal when their names are. */
export function cycleId(cycle: string, cycleNote: string | null | undefined): string {
  if (cycle !== 'OTHER') return cycle;
  const note = (cycleNote ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `OTHER:${note}`;
}

export function cycleLabel(cycle: string, cycleNote: string | null | undefined): string {
  return cycle === 'OTHER' && cycleNote?.trim() ? cycleNote.trim() : cycle;
}

/** Preference order of cycle ids (WLTP first; unnamed OTHER last). */
export function cycleRank(id: string): number {
  const base = id.startsWith('OTHER') ? 'OTHER' : id;
  const i = CYCLE_ORDER.indexOf(base);
  return (i === -1 ? CYCLE_ORDER.length : i) * 10 + (id === 'OTHER:' ? 1 : 0);
}

export const MODE_ORDER = ['combined', 'weighted', 'charge_depleting', 'charge_sustaining'];
export const modeOf = (mode: string | null | undefined): string => mode ?? 'combined';

export const SOC_WINDOW_ORDER = ['10-80', '20-80', '10-90', '0-100', '0-80', '10-100', '20-100'];
export const windowId = (from: number, to: number): string => `${from}-${to}`;
export function windowRank(id: string): number {
  const i = SOC_WINDOW_ORDER.indexOf(id);
  if (i !== -1) return i;
  const [from, to] = id.split('-').map(Number);
  // Unknown windows after the usual ones: wider windows first, then lower start.
  return 100 + (100 - (to - from)) * 1000 + from;
}
export const windowLabel = (from: number, to: number): string => `${from}–${to}%`;

// --- reliability ---------------------------------------------------------------

const RELIABILITY_RANK: Record<string, number> = {
  disputed: 0,
  unverified: 1,
  estimated: 2,
  manufacturer_claim: 3,
  verified: 4,
};

/** Least reliable of a list (null when empty). */
export function weakestReliability(values: (string | null | undefined)[]): string | null {
  let out: string | null = null;
  for (const v of values) {
    if (!v) continue;
    if (out === null || (RELIABILITY_RANK[v] ?? 1) < (RELIABILITY_RANK[out] ?? 1)) out = v;
  }
  return out;
}

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Equality of canonical values (numbers within a tiny epsilon). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (isNum(a) && isNum(b)) return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  if (typeof a === 'string' && typeof b === 'string') {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }
  return a === b;
}
