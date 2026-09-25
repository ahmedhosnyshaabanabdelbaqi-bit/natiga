/**
 * Metric builders of the comparison engine (REQUIREMENTS §7):
 * - ranges only on the SAME test cycle, cycles shown, never converted;
 *   electric and total range are separate rows (PHEV / EREV);
 * - consumption only on the same cycle AND operating mode;
 * - DC peak power (spec / inlet) is a different row from the average power;
 * - charging times only for the same SoC window (10–80 % ≠ 30–80 %) and only
 *   when no charger limited one car differently;
 * - prices never across currencies;
 * - missing values stay null (never 0) and block the winner;
 * - battery rows never have a "better" direction.
 */
import type {
  ChargingTimeDto,
  ConsumptionDto,
  DataPointDto,
  InletDto,
  RangeDto,
} from '../../vehicles/dto/shared.dto';
import {
  cycleId,
  cycleLabel,
  cycleRank,
  dcCapability,
  hasElectricDrive,
  hasEngine,
  inletMax,
  isNum,
  isPlugIn,
  MODE_ORDER,
  modeOf,
  sameValue,
  weakestReliability,
  windowId,
  windowLabel,
  windowRank,
} from './facts';
import { DRIVE_LABELS, METRIC_LABELS, MODE_LABELS, NOTES, t } from './labels';
import type {
  AlternativeValue,
  CarFacts,
  Comparability,
  Direction,
  Lang,
  Metric,
  MetricCondition,
  MetricGroupKey,
  MetricKind,
  MetricValue,
  SpecDefLite,
} from './types';

export interface Ctx {
  lang: Lang;
  cars: CarFacts[];
}

// --- value constructors -------------------------------------------------------------

export function emptyValue(carKey: string, status: 'missing' | 'not_applicable'): MetricValue {
  return {
    carKey,
    status,
    value: null,
    valueLabel: null,
    unit: null,
    originalValue: null,
    originalUnit: null,
    condition: null,
    reliability: null,
    verifiedAt: null,
    source: null,
    derived: false,
    note: null,
    alternatives: [],
  };
}

function pointValue(carKey: string, p: DataPointDto, unit: string | null): MetricValue {
  return {
    carKey,
    status: 'present',
    value: p.value,
    valueLabel: null,
    unit: p.unit ?? unit,
    originalValue: p.originalValue,
    originalUnit: p.originalUnit,
    condition: null,
    reliability: p.reliability,
    verifiedAt: p.verifiedAt,
    source: p.source,
    derived: p.derived,
    note: null,
    alternatives: [],
  };
}

function inletValue(carKey: string, inlet: InletDto, note: string): MetricValue {
  return {
    carKey,
    status: 'present',
    value: inlet.maxPowerKw,
    valueLabel: null,
    unit: 'kW',
    originalValue: null,
    originalUnit: null,
    condition: { currentType: inlet.currentType },
    reliability: inlet.reliability,
    verifiedAt: inlet.verifiedAt,
    source: inlet.source,
    derived: false,
    note,
    alternatives: [],
  };
}

// --- decision -------------------------------------------------------------------------

function numeric(v: MetricValue): number | null {
  if (v.status !== 'present') return null;
  if (isNum(v.value)) return v.value;
  if (typeof v.value === 'boolean') return v.value ? 1 : 0;
  if (typeof v.value === 'string' && /^-?\d+(\.\d+)?$/.test(v.value)) return Number(v.value);
  return null;
}

function signature(v: MetricValue): string {
  const c = v.condition ?? {};
  const basis = [
    c.cycle ? cycleId(c.cycle, c.cycleNote) : '',
    c.mode ?? '',
    c.socWindow ?? '',
    c.currency ?? '',
  ].join('/');
  const value =
    typeof v.value === 'string' ? v.value.trim().toLowerCase() : JSON.stringify(v.value);
  return `${v.status}|${value}|${basis}`;
}

export interface MetricSpec {
  key: string;
  group: MetricGroupKey;
  label: string;
  description: string | null;
  kind: MetricKind;
  unit: string | null;
  betterDirection: Direction;
  isKey: boolean;
}

/**
 * Final row: winner only when the row is comparable, has a direction, every
 * value is present and none is disputed. All equal → tie.
 */
export function finalize(
  spec: MetricSpec,
  values: MetricValue[],
  comparability: Comparability,
  note: string | null,
  basis: MetricCondition | null,
  lang: Lang,
): Metric {
  let outcome: Metric['outcome'] = 'no_winner';
  let winners: string[] = [];
  let comparabilityNote = note;
  const allPresent = values.every((v) => v.status === 'present');
  if (comparability === 'comparable' && allPresent) {
    if (spec.betterDirection === 'none') {
      // §7: a bigger battery is never an automatic win — say so explicitly.
      if (spec.group === 'battery' && spec.kind === 'number') {
        comparabilityNote ??= NOTES.batteryNoWinner(lang);
      }
    } else if (values.some((v) => v.reliability === 'disputed')) {
      comparabilityNote = NOTES.disputed(lang);
    } else {
      const nums = values.map(numeric);
      if (nums.every((n): n is number => n !== null)) {
        const best = spec.betterDirection === 'higher' ? Math.max(...nums) : Math.min(...nums);
        const top = values.filter((_, i) => sameValue(nums[i], best)).map((v) => v.carKey);
        if (top.length === values.length) outcome = 'tie';
        else {
          outcome = 'winner';
          winners = top;
        }
      }
    }
  }
  const isDifferent = new Set(values.map(signature)).size > 1;
  return {
    ...spec,
    comparability,
    comparabilityNote,
    basis,
    outcome,
    winners,
    isDifferent,
    values,
  };
}

/** not_applicable > missing_data > the basis status computed by the caller. */
function precedence(values: MetricValue[]): Comparability | null {
  if (values.some((v) => v.status === 'not_applicable')) return 'not_applicable';
  if (values.some((v) => v.status === 'missing')) return 'missing_data';
  return null;
}

function computedSpec(
  key: string,
  group: MetricGroupKey,
  kind: MetricKind,
  unit: string | null,
  dir: Direction,
  isKey: boolean,
  lang: Lang,
): MetricSpec {
  const l = METRIC_LABELS[key];
  return {
    key,
    group,
    label: l ? t(lang, l.label) : key,
    description: l?.description ? t(lang, l.description) : null,
    kind,
    unit,
    betterDirection: dir,
    isKey,
  };
}

const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];

// --- price ------------------------------------------------------------------------------

export function priceMetric(ctx: Ctx): Metric {
  const { lang, cars } = ctx;
  const values = cars.map((car): MetricValue => {
    const p = car.price;
    if (!p) return emptyValue(car.key, 'missing');
    return {
      carKey: car.key,
      status: 'present',
      value: p.amount.amount,
      valueLabel: null,
      unit: p.amount.currency,
      originalValue: null,
      originalUnit: null,
      condition: {
        priceType: p.priceType,
        priceTypeLabel: p.priceTypeLabel,
        currency: p.amount.currency,
        effectiveFrom: p.effectiveFrom,
        inMarketCurrency: p.inMarketCurrency,
      },
      reliability: p.reliability,
      verifiedAt: p.verifiedAt,
      source: p.source,
      derived: false,
      note: p.inMarketCurrency ? null : NOTES.foreignEstimate(lang),
      alternatives: [],
    };
  });
  const spec = computedSpec('price.current', 'price', 'money', null, 'lower', true, lang);
  if (values.some((v) => v.status === 'missing')) {
    return finalize(spec, values, 'missing_data', NOTES.missing(lang), null, lang);
  }
  const currencies = uniq(values.map((v) => v.condition!.currency!));
  if (currencies.length > 1) {
    return finalize(
      spec,
      values,
      'different_currency',
      NOTES.currencies(lang, currencies),
      null,
      lang,
    );
  }
  const types = uniq(values.map((v) => v.condition!.priceTypeLabel!));
  return finalize(
    { ...spec, unit: currencies[0] },
    values,
    'comparable',
    types.length > 1 ? NOTES.priceTypes(lang, types) : null,
    { currency: currencies[0] },
    lang,
  );
}

// --- cycle-bound measurements (range, consumption) -----------------------------------

interface CycleRow {
  cycle: string;
  cycleNote: string | null;
  value: number;
  row: RangeDto | ConsumptionDto;
  mode: string | null;
}

function rangeRows(car: CarFacts, rangeType: string): CycleRow[] {
  return car.ranges
    .filter((r) => r.rangeType === rangeType)
    .map((r) => ({ cycle: r.cycle, cycleNote: r.cycleNote, value: r.valueKm, row: r, mode: null }));
}

function consumptionRows(car: CarFacts, kind: string): CycleRow[] {
  return car.consumption
    .filter((c) => c.kind === kind)
    .map((c) => ({
      cycle: c.cycle,
      cycleNote: c.cycleNote,
      value: c.value,
      row: c,
      mode: modeOf(c.mode),
    }));
}

const basisKey = (r: CycleRow, withMode: boolean): string =>
  withMode ? `${cycleId(r.cycle, r.cycleNote)}|${r.mode}` : cycleId(r.cycle, r.cycleNote);

function keyRank(key: string): number {
  const [cycle, mode] = key.split('|');
  const m = mode ? MODE_ORDER.indexOf(mode) : 0;
  return cycleRank(cycle) * 10 + (m === -1 ? 9 : m);
}

function preferredKey(rows: CycleRow[], withMode: boolean): string {
  return uniq(rows.map((r) => basisKey(r, withMode))).sort((a, b) => keyRank(a) - keyRank(b))[0];
}

function commonKeys(perCar: CycleRow[][], withMode: boolean): string[] {
  const sets = perCar.map((rows) => new Set(rows.map((r) => basisKey(r, withMode))));
  return [...sets[0]]
    .filter((k) => sets.every((s) => s.has(k)))
    .sort((a, b) => keyRank(a) - keyRank(b));
}

function cycleValue(
  carKey: string,
  rows: CycleRow[],
  key: string,
  withMode: boolean,
  higherIsBetter: boolean,
  unit: string,
  lang: Lang,
): MetricValue {
  const onBasis = rows.filter((r) => basisKey(r, withMode) === key);
  const chosen = [...onBasis].sort((a, b) =>
    higherIsBetter ? b.value - a.value : a.value - b.value,
  )[0];
  const r = chosen.row;
  const condition: MetricCondition = {
    cycle: r.cycle,
    cycleNote: r.cycleNote,
    ...('rangeType' in r ? { rangeType: r.rangeType, wheelSizeInch: r.wheelSizeInch } : {}),
    ...('kind' in r ? { mode: r.mode } : {}),
    conditions: r.conditions,
  };
  const alternatives: AlternativeValue[] = rows
    .filter((x) => x !== chosen)
    .map((x) => ({
      value: x.value,
      unit,
      originalValue: x.row.originalValue,
      originalUnit: x.row.originalUnit,
      condition: {
        cycle: x.cycle,
        cycleNote: x.cycleNote,
        ...('rangeType' in x.row
          ? { rangeType: x.row.rangeType, wheelSizeInch: x.row.wheelSizeInch }
          : { mode: x.row.mode }),
        conditions: x.row.conditions,
      },
      reliability: x.row.reliability,
    }));
  return {
    carKey,
    status: 'present',
    value: chosen.value,
    valueLabel: null,
    unit,
    originalValue: r.originalValue,
    originalUnit: r.originalUnit,
    condition,
    reliability: r.reliability,
    verifiedAt: r.verifiedAt,
    source: r.source,
    derived: false,
    note: onBasis.length > 1 ? NOTES.bestOf(lang, onBasis.length, higherIsBetter) : null,
    alternatives,
  };
}

function cycleMetric(
  ctx: Ctx,
  spec: MetricSpec,
  applicable: (powertrain: string) => boolean,
  rowsOf: (car: CarFacts) => CycleRow[],
  withMode: boolean,
): Metric | null {
  const { lang, cars } = ctx;
  if (!cars.some((c) => applicable(c.powertrainType))) return null;
  const higher = spec.betterDirection === 'higher';
  const unit = spec.unit ?? '';
  const perCar = cars.map((c) => (applicable(c.powertrainType) ? rowsOf(c) : null));
  const withRows = perCar.filter((r): r is CycleRow[] => r !== null && r.length > 0);

  const common =
    withRows.length === cars.length ? commonKeys(withRows, withMode) : ([] as string[]);
  const basis = common[0] ?? null;
  const values = cars.map((car, i) => {
    const rows = perCar[i];
    if (rows === null) return emptyValue(car.key, 'not_applicable');
    if (rows.length === 0) return emptyValue(car.key, 'missing');
    const key = basis ?? preferredKey(rows, withMode);
    return cycleValue(car.key, rows, key, withMode, higher, unit, lang);
  });

  const blocked = precedence(values);
  if (blocked) {
    const note =
      blocked === 'not_applicable' ? NOTES.notApplicable(lang, spec.key) : NOTES.missing(lang);
    return finalize(spec, values, blocked, note, null, lang);
  }
  if (basis) {
    const [cycle, mode] = basis.split('|');
    const first = values[0].condition!;
    const basisCond: MetricCondition = {
      cycle: cycle.startsWith('OTHER') ? 'OTHER' : cycle,
      cycleNote: cycle.startsWith('OTHER') ? (first.cycleNote ?? null) : null,
      ...(withMode ? { mode } : {}),
    };
    return finalize(spec, values, 'comparable', null, basisCond, lang);
  }
  // Same cycle but different modes → conditions; otherwise → cycles.
  const cycleCommon = withMode ? commonKeys(withRows, false) : [];
  if (cycleCommon.length > 0) {
    const modes = uniq(
      values.map((v) => {
        const m = v.condition?.mode ?? 'combined';
        return MODE_LABELS[m] ? t(lang, MODE_LABELS[m]) : m;
      }),
    );
    return finalize(
      spec,
      values,
      'not_comparable_conditions',
      NOTES.modes(lang, modes),
      null,
      lang,
    );
  }
  const cycles = uniq(values.map((v) => cycleLabel(v.condition!.cycle!, v.condition!.cycleNote)));
  return finalize(spec, values, 'not_comparable_cycles', NOTES.cycles(lang, cycles), null, lang);
}

export function rangeMetric(ctx: Ctx, rangeType: 'electric' | 'total'): Metric | null {
  const spec = computedSpec(
    `range.${rangeType}`,
    'range',
    'number',
    'km',
    'higher',
    true,
    ctx.lang,
  );
  return cycleMetric(
    ctx,
    spec,
    rangeType === 'electric' ? hasElectricDrive : hasEngine,
    (c) => rangeRows(c, rangeType),
    false,
  );
}

export function consumptionMetric(ctx: Ctx, kind: 'electricity' | 'fuel'): Metric | null {
  const unit = kind === 'fuel' ? 'L/100km' : 'Wh/km';
  const spec = computedSpec(
    `consumption.${kind}`,
    'consumption',
    'number',
    unit,
    'lower',
    true,
    ctx.lang,
  );
  return cycleMetric(
    ctx,
    spec,
    kind === 'electricity' ? hasElectricDrive : hasEngine,
    (c) => consumptionRows(c, kind),
    true,
  );
}

// --- charging power (peak) -------------------------------------------------------------

function chargePowerMetric(ctx: Ctx, def: SpecDefLite | undefined, current: 'AC' | 'DC'): Metric {
  const { lang, cars } = ctx;
  const key = current === 'DC' ? 'charging.dc_peak_kw' : 'charging.ac_max_kw';
  const computed = computedSpec(key, 'charging', 'number', 'kW', 'higher', true, lang);
  // The DC row always says "peak" (never mistaken for an average power).
  const spec: MetricSpec = def
    ? {
        ...specOfDef(def, lang),
        key,
        isKey: true,
        ...(current === 'DC' ? { label: computed.label, description: computed.description } : {}),
      }
    : computed;
  const values = cars.map((car): MetricValue => {
    if (!isPlugIn(car.powertrainType)) return emptyValue(car.key, 'not_applicable');
    const p = car.specs.get(key);
    if (p && isNum(p.value)) return pointValue(car.key, p, 'kW');
    const inlet = inletMax(car.inlets, current);
    if (inlet) return inletValue(car.key, inlet, NOTES.fromInlet(lang));
    if (current === 'DC' && dcCapability(car) === false) {
      return { ...emptyValue(car.key, 'not_applicable'), note: NOTES.noDcInlet(lang) };
    }
    return emptyValue(car.key, 'missing');
  });
  const blocked = precedence(values);
  if (blocked) {
    const note =
      blocked === 'not_applicable' ? NOTES.notApplicable(lang, key) : NOTES.missing(lang);
    return finalize(spec, values, blocked, note, null, lang);
  }
  return finalize(spec, values, 'comparable', null, null, lang);
}

export const dcPeakMetric = (ctx: Ctx, def?: SpecDefLite): Metric =>
  chargePowerMetric(ctx, def, 'DC');
export const acMaxMetric = (ctx: Ctx, def?: SpecDefLite): Metric =>
  chargePowerMetric(ctx, def, 'AC');

/** Car's own charging limit (spec, else inlet) used to detect charger-limited measurements. */
function ownLimit(car: CarFacts, current: 'AC' | 'DC'): number | null {
  const p = car.specs.get(current === 'DC' ? 'charging.dc_peak_kw' : 'charging.ac_max_kw');
  if (p && isNum(p.value)) return p.value;
  return inletMax(car.inlets, current)?.maxPowerKw ?? null;
}

// --- charging times (SoC windows) --------------------------------------------------------

interface TimeChoice {
  values: MetricValue[];
  rows: (ChargingTimeDto | null)[];
  comparability: Comparability;
  note: string | null;
  basis: MetricCondition | null;
}

function timeValue(
  carKey: string,
  row: ChargingTimeDto,
  others: ChargingTimeDto[],
  n: number,
  lang: Lang,
): MetricValue {
  return {
    carKey,
    status: 'present',
    value: row.durationMinutes,
    valueLabel: null,
    unit: 'min',
    originalValue: null,
    originalUnit: null,
    condition: timeCondition(row),
    reliability: row.reliability,
    verifiedAt: row.verifiedAt,
    source: row.source,
    derived: false,
    note: n > 1 ? NOTES.bestOf(lang, n, false) : null,
    alternatives: others.map((o) => ({
      value: o.durationMinutes,
      unit: 'min',
      originalValue: null,
      originalUnit: null,
      condition: timeCondition(o),
      reliability: o.reliability,
    })),
  };
}

function timeCondition(row: ChargingTimeDto): MetricCondition {
  return {
    currentType: row.currentType,
    fromSoc: row.fromSoc,
    toSoc: row.toSoc,
    socWindow: row.socWindow,
    chargerPowerKw: row.chargerPowerKw,
    conditions: row.conditions,
  };
}

function chooseTimes(ctx: Ctx, current: 'AC' | 'DC'): TimeChoice {
  const { lang, cars } = ctx;
  const applicable = (c: CarFacts) =>
    isPlugIn(c.powertrainType) && (current === 'AC' || dcCapability(c) !== false);
  const perCar = cars.map((c) =>
    applicable(c) ? c.chargingTimes.filter((x) => x.currentType === current) : null,
  );
  const withRows = perCar.filter((r): r is ChargingTimeDto[] => r !== null && r.length > 0);
  let common: string[] = [];
  if (withRows.length === cars.length) {
    const sets = withRows.map((rows) => new Set(rows.map((r) => windowId(r.fromSoc, r.toSoc))));
    common = [...sets[0]]
      .filter((w) => sets.every((s) => s.has(w)))
      .sort((a, b) => windowRank(a) - windowRank(b));
  }
  const basisWindow = common[0] ?? null;
  const chosenRows: (ChargingTimeDto | null)[] = [];
  const values = cars.map((car, i) => {
    const rows = perCar[i];
    if (rows === null) {
      chosenRows.push(null);
      const v = emptyValue(car.key, 'not_applicable');
      return current === 'DC' && isPlugIn(car.powertrainType)
        ? { ...v, note: NOTES.noDcInlet(lang) }
        : v;
    }
    if (rows.length === 0) {
      chosenRows.push(null);
      return emptyValue(car.key, 'missing');
    }
    const window =
      basisWindow ??
      rows
        .map((r) => windowId(r.fromSoc, r.toSoc))
        .sort((a, b) => windowRank(a) - windowRank(b))[0];
    const onWindow = rows
      .filter((r) => windowId(r.fromSoc, r.toSoc) === window)
      .sort((a, b) => a.durationMinutes - b.durationMinutes);
    chosenRows.push(onWindow[0]);
    return timeValue(
      car.key,
      onWindow[0],
      rows.filter((r) => r !== onWindow[0]),
      onWindow.length,
      lang,
    );
  });

  const blocked = precedence(values);
  if (blocked) {
    const key = current === 'DC' ? 'charging.dc_time' : 'charging.ac_time';
    const note =
      blocked === 'not_applicable' ? NOTES.notApplicable(lang, key) : NOTES.missing(lang);
    return { values, rows: chosenRows, comparability: blocked, note, basis: null };
  }
  if (!basisWindow) {
    const windows = uniq(values.map((v) => v.condition!.socWindow!));
    return {
      values,
      rows: chosenRows,
      comparability: 'not_comparable_soc_window',
      note: NOTES.socWindows(lang, windows),
      basis: null,
    };
  }
  // Same window: a charger slower than the car's own limit makes times incomparable
  // when the cars were measured on different chargers.
  const rows = chosenRows as ChargingTimeDto[];
  const limited = rows.some((r, i) => {
    const own = ownLimit(cars[i], current);
    return r.chargerPowerKw !== null && own !== null && r.chargerPowerKw < own;
  });
  const powers = uniq(rows.map((r) => r.chargerPowerKw).filter((p): p is number => p !== null));
  const [from, to] = basisWindow.split('-').map(Number);
  const basis: MetricCondition = {
    currentType: current,
    fromSoc: from,
    toSoc: to,
    socWindow: windowLabel(from, to),
  };
  if (limited && powers.length > 1) {
    return {
      values,
      rows: chosenRows,
      comparability: 'not_comparable_conditions',
      note: NOTES.chargers(
        lang,
        powers.map((p) => `${p} kW`),
      ),
      basis,
    };
  }
  return { values, rows: chosenRows, comparability: 'comparable', note: null, basis };
}

export function chargingTimeMetric(ctx: Ctx, current: 'AC' | 'DC'): Metric | null {
  const { lang, cars } = ctx;
  if (!cars.some((c) => isPlugIn(c.powertrainType))) return null;
  // AC times are an optional row: shown only when at least one car has one.
  if (current === 'AC' && !cars.some((c) => c.chargingTimes.some((x) => x.currentType === 'AC'))) {
    return null;
  }
  const key = current === 'DC' ? 'charging.dc_time' : 'charging.ac_time';
  const spec = computedSpec(key, 'charging', 'number', 'min', 'lower', current === 'DC', lang);
  const choice = chooseTimes(ctx, current);
  return finalize(spec, choice.values, choice.comparability, choice.note, choice.basis, lang);
}

/**
 * Measured average DC power in the chosen SoC window (never derived from the
 * peak). Shown only when at least one car has such a measurement.
 */
export function dcAverageMetric(ctx: Ctx): Metric | null {
  const { lang, cars } = ctx;
  if (
    !cars.some((c) =>
      c.chargingTimes.some((x) => x.currentType === 'DC' && x.averagePowerKw !== null),
    )
  ) {
    return null;
  }
  const spec = computedSpec(
    'charging.dc_average_kw',
    'charging',
    'number',
    'kW',
    'higher',
    false,
    lang,
  );
  const choice = chooseTimes(ctx, 'DC');
  const values = choice.values.map((v, i): MetricValue => {
    const row = choice.rows[i];
    if (v.status !== 'present' || !row) return { ...v, alternatives: [] };
    if (row.averagePowerKw === null) return emptyValue(v.carKey, 'missing');
    return {
      ...v,
      value: row.averagePowerKw,
      unit: 'kW',
      note: null,
      alternatives: [],
    };
  });
  let comparability = choice.comparability;
  let note = choice.note;
  if (comparability === 'comparable' && values.some((v) => v.status === 'missing')) {
    comparability = 'missing_data';
    note = NOTES.missing(lang);
  }
  return finalize(spec, values, comparability, note, choice.basis, lang);
}

// --- inlets (text) ----------------------------------------------------------------------

export function inletsMetric(ctx: Ctx): Metric | null {
  const { lang, cars } = ctx;
  if (!cars.some((c) => isPlugIn(c.powertrainType))) return null;
  const spec = computedSpec('charging.inlets', 'charging', 'text', null, 'none', false, lang);
  const values = cars.map((car): MetricValue => {
    if (!isPlugIn(car.powertrainType)) return emptyValue(car.key, 'not_applicable');
    if (car.inlets.length === 0) return emptyValue(car.key, 'missing');
    const sorted = [...car.inlets].sort(
      (a, b) =>
        a.currentType.localeCompare(b.currentType) ||
        a.connectorType.code.localeCompare(b.connectorType.code),
    );
    return {
      ...emptyValue(car.key, 'missing'),
      status: 'present',
      value: sorted.map((i) => `${i.connectorType.code}:${i.currentType}`).join(','),
      valueLabel: sorted
        .map(
          (i) =>
            `${i.connectorType.name} (${i.currentType}${i.maxPowerKw !== null ? ` ${i.maxPowerKw} kW` : ''})`,
        )
        .join(' · '),
      reliability: weakestReliability(sorted.map((i) => i.reliability)),
      verifiedAt: null,
      source: sorted.find((i) => i.source)?.source ?? null,
    };
  });
  const blocked = precedence(values);
  if (blocked) {
    const note =
      blocked === 'not_applicable' ? NOTES.notApplicable(lang, spec.key) : NOTES.missing(lang);
    return finalize(spec, values, blocked, note, null, lang);
  }
  return finalize(spec, values, 'comparable', null, null, lang);
}

// --- spec definitions -------------------------------------------------------------------

/** Rows handled by dedicated builders above. */
export const SPECIAL_SPEC_KEYS = new Set(['charging.dc_peak_kw', 'charging.ac_max_kw']);

/** Extra rows of the summary view besides the definitions flagged isKeySpec. */
export const SUMMARY_SPEC_KEYS = new Set([
  'battery.usable_kwh',
  'performance.power_kw',
  'performance.accel_0_100_s',
  'practicality.trunk_l',
  'safety.airbags',
  'warranty.vehicle_years',
  'battery.warranty_years',
]);

export function metricGroupOf(def: Pick<SpecDefLite, 'key' | 'group'>): MetricGroupKey {
  if (def.group === 'warranty' || def.key.includes('warranty')) return 'warranty';
  switch (def.group) {
    case 'battery':
      return 'battery';
    case 'charging':
      return 'charging';
    case 'performance':
      return 'performance';
    case 'dimensions':
    case 'practicality':
      return 'space';
    case 'safety':
      return 'safety';
    default:
      return 'features';
  }
}

/** Direction of a spec row: battery rows and text rows never have one (§7). */
export function directionOf(
  def: Pick<SpecDefLite, 'key' | 'group' | 'dataType' | 'betterDirection'>,
): Direction {
  if (metricGroupOf(def) === 'battery') return 'none';
  if (def.dataType === 'text') return 'none';
  return def.betterDirection === 'higher' || def.betterDirection === 'lower'
    ? def.betterDirection
    : 'none';
}

function specOfDef(def: SpecDefLite, lang: Lang): MetricSpec {
  return {
    key: def.key,
    group: metricGroupOf(def),
    label: t(lang, { ar: def.labelAr, en: def.labelEn }),
    description:
      (lang === 'en' ? def.descriptionEn : def.descriptionAr) ??
      (lang === 'en' ? def.descriptionAr : def.descriptionEn) ??
      null,
    kind: def.dataType === 'boolean' ? 'boolean' : def.dataType === 'text' ? 'text' : 'number',
    unit: def.unit,
    betterDirection: directionOf(def),
    isKey: def.isKeySpec || SUMMARY_SPEC_KEYS.has(def.key),
  };
}

function specApplies(def: SpecDefLite, powertrain: string): boolean {
  if (def.group === 'charging') return isPlugIn(powertrain);
  if (def.key === 'performance.engine_displacement_l') return hasEngine(powertrain);
  return true;
}

export function specMetric(ctx: Ctx, def: SpecDefLite): Metric | null {
  const { lang, cars } = ctx;
  if (!cars.some((c) => specApplies(def, c.powertrainType))) return null;
  const spec = specOfDef(def, lang);
  const values = cars.map((car): MetricValue => {
    if (!specApplies(def, car.powertrainType)) return emptyValue(car.key, 'not_applicable');
    const p = car.specs.get(def.key);
    return p ? pointValue(car.key, p, def.unit) : emptyValue(car.key, 'missing');
  });
  const blocked = precedence(values);
  if (blocked) {
    const note =
      blocked === 'not_applicable' ? NOTES.notApplicable(lang, def.key) : NOTES.missing(lang);
    return finalize(spec, values, blocked, note, null, lang);
  }
  return finalize(spec, values, 'comparable', null, null, lang);
}

// --- variant attributes ------------------------------------------------------------------

export function attributeMetrics(ctx: Ctx): Metric[] {
  const { lang, cars } = ctx;
  const numberRow = (key: string, pick: (c: CarFacts) => number | null, isKey: boolean): Metric => {
    const spec = computedSpec(key, 'space', 'number', null, 'none', isKey, lang);
    const values = cars.map((car): MetricValue => {
      const v = pick(car);
      return v === null
        ? emptyValue(car.key, 'missing')
        : { ...emptyValue(car.key, 'missing'), status: 'present', value: v };
    });
    const missing = values.some((v) => v.status === 'missing');
    return finalize(
      spec,
      values,
      missing ? 'missing_data' : 'comparable',
      missing ? NOTES.missing(lang) : null,
      null,
      lang,
    );
  };
  const driveSpec = computedSpec(
    'performance.drive_type',
    'performance',
    'text',
    null,
    'none',
    false,
    lang,
  );
  const driveValues = cars.map((car): MetricValue =>
    car.driveType === null
      ? emptyValue(car.key, 'missing')
      : {
          ...emptyValue(car.key, 'missing'),
          status: 'present',
          value: car.driveType,
          valueLabel: DRIVE_LABELS[car.driveType]
            ? t(lang, DRIVE_LABELS[car.driveType])
            : car.driveType,
        },
  );
  const driveMissing = driveValues.some((v) => v.status === 'missing');
  return [
    numberRow('space.seats', (c) => c.seats, true),
    numberRow('space.doors', (c) => c.doors, false),
    finalize(
      driveSpec,
      driveValues,
      driveMissing ? 'missing_data' : 'comparable',
      driveMissing ? NOTES.missing(lang) : null,
      null,
      lang,
    ),
  ];
}
