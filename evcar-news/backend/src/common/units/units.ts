/**
 * Physical units and conversions to the canonical units of the API
 * (contract §4.3): km, kWh, kW, Wh/km, minutes, mm, liters, kg, seconds
 * (0–100 km/h), Nm; power is stored both as kW and hp.
 *
 * Always keep the ORIGINAL value/unit next to a converted value
 * (vehicle_specifications.original_value/original_unit). Never convert
 * between range test cycles (WLTP/EPA/CLTC/NEDC) — that is not a unit change.
 */
export type Dimension =
  | 'length'
  | 'energy'
  | 'power'
  | 'energy_per_distance'
  | 'fuel_per_distance'
  | 'time'
  | 'volume'
  | 'mass'
  | 'torque'
  | 'speed'
  | 'voltage'
  | 'current'
  | 'ratio';

interface UnitDef {
  dimension: Dimension;
  /** value in this unit → value in the dimension base unit */
  toBase: (v: number) => number;
  /** value in the dimension base unit → value in this unit */
  fromBase: (v: number) => number;
}

const linear = (dimension: Dimension, factor: number): UnitDef => ({
  dimension,
  toBase: (v) => v * factor,
  fromBase: (v) => v / factor,
});

/** Inverse units (distance per energy, e.g. mi/kWh) relative to base Wh/km. */
const inverse = (dimension: Dimension, k: number): UnitDef => ({
  dimension,
  toBase: (v) => k / v,
  fromBase: (v) => k / v,
});

const MILE_KM = 1.609344;
const HP_KW = 0.745699872; // mechanical horsepower
const PS_KW = 0.73549875; // metric horsepower (PS / CV)
const LBFT_NM = 1.3558179483314;
const US_GAL_L = 3.785411784;
const IMP_GAL_L = 4.54609;

/**
 * Base units per dimension: length=m, energy=kWh, power=kW,
 * energy_per_distance=Wh/km, fuel_per_distance=L/100km, time=s, volume=l,
 * mass=kg, torque=Nm, speed=km/h, voltage=V, current=A, ratio=%.
 */
export const UNITS: Readonly<Record<string, UnitDef>> = {
  // length
  m: linear('length', 1),
  km: linear('length', 1000),
  mm: linear('length', 0.001),
  cm: linear('length', 0.01),
  in: linear('length', 0.0254),
  ft: linear('length', 0.3048),
  mi: linear('length', MILE_KM * 1000),
  // energy
  kWh: linear('energy', 1),
  Wh: linear('energy', 0.001),
  MWh: linear('energy', 1000),
  // power
  kW: linear('power', 1),
  W: linear('power', 0.001),
  hp: linear('power', HP_KW),
  bhp: linear('power', HP_KW),
  PS: linear('power', PS_KW),
  // energy consumption (base Wh/km)
  'Wh/km': linear('energy_per_distance', 1),
  'kWh/100km': linear('energy_per_distance', 10),
  'Wh/mi': linear('energy_per_distance', 1 / MILE_KM),
  'kWh/100mi': linear('energy_per_distance', 10 / MILE_KM),
  'km/kWh': inverse('energy_per_distance', 1000),
  'mi/kWh': inverse('energy_per_distance', 1000 / MILE_KM),
  // fuel consumption (base L/100km)
  'L/100km': linear('fuel_per_distance', 1),
  'km/L': inverse('fuel_per_distance', 100),
  'mpg(US)': inverse('fuel_per_distance', (100 * US_GAL_L) / MILE_KM),
  'mpg(UK)': inverse('fuel_per_distance', (100 * IMP_GAL_L) / MILE_KM),
  // time
  s: linear('time', 1),
  min: linear('time', 60),
  h: linear('time', 3600),
  // volume
  l: linear('volume', 1),
  ml: linear('volume', 0.001),
  'cu ft': linear('volume', 28.316846592),
  'gal(US)': linear('volume', US_GAL_L),
  // mass
  kg: linear('mass', 1),
  g: linear('mass', 0.001),
  t: linear('mass', 1000),
  lb: linear('mass', 0.45359237),
  // torque
  Nm: linear('torque', 1),
  'lb-ft': linear('torque', LBFT_NM),
  kgm: linear('torque', 9.80665),
  // speed
  'km/h': linear('speed', 1),
  mph: linear('speed', MILE_KM),
  'm/s': linear('speed', 3.6),
  // electrical
  V: linear('voltage', 1),
  kV: linear('voltage', 1000),
  A: linear('current', 1),
  // ratio
  '%': linear('ratio', 1),
};

/** Canonical API unit per dimension. */
export const CANONICAL_UNIT: Readonly<Record<Dimension, string>> = {
  length: 'km',
  energy: 'kWh',
  power: 'kW',
  energy_per_distance: 'Wh/km',
  fuel_per_distance: 'L/100km',
  time: 'min',
  volume: 'l',
  mass: 'kg',
  torque: 'Nm',
  speed: 'km/h',
  voltage: 'V',
  current: 'A',
  ratio: '%',
};

export class UnitConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnitConversionError';
  }
}

export function isKnownUnit(unit: string): boolean {
  return Object.prototype.hasOwnProperty.call(UNITS, unit);
}

export function dimensionOf(unit: string): Dimension {
  const def = UNITS[unit];
  if (!def) throw new UnitConversionError(`Unknown unit "${unit}"`);
  return def.dimension;
}

/**
 * Converts `value` from `from` to `to`. Throws for unknown units, mixed
 * dimensions, non-finite input, or a zero value for inverse units.
 * `null`/`undefined` stay null (missing ≠ 0).
 */
export function convertUnit(value: number, from: string, to: string): number;
export function convertUnit(
  value: number | null | undefined,
  from: string,
  to: string,
): number | null;
export function convertUnit(
  value: number | null | undefined,
  from: string,
  to: string,
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) throw new UnitConversionError('Value must be a finite number');
  const src = UNITS[from];
  const dst = UNITS[to];
  if (!src) throw new UnitConversionError(`Unknown unit "${from}"`);
  if (!dst) throw new UnitConversionError(`Unknown unit "${to}"`);
  if (src.dimension !== dst.dimension) {
    throw new UnitConversionError(
      `Cannot convert ${src.dimension} (${from}) to ${dst.dimension} (${to})`,
    );
  }
  if (from === to) return value;
  const base = src.toBase(value);
  if (!Number.isFinite(base)) throw new UnitConversionError(`Cannot convert ${value} ${from}`);
  const out = dst.fromBase(base);
  if (!Number.isFinite(out))
    throw new UnitConversionError(`Cannot convert ${value} ${from} to ${to}`);
  return out;
}

/** Rounds half away from zero to `decimals` places (avoids 1.005 → 1.00). */
export function roundTo(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return (Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * factor)) / factor;
}

export const kwToHp = (kw: number): number => kw / HP_KW;
export const hpToKw = (hp: number): number => hp * HP_KW;
