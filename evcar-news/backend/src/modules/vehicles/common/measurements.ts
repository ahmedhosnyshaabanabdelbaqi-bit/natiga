/**
 * Validation + canonicalisation of measured data (ranges, consumption,
 * charging times and curves) against the variant's powertrain. Pure —
 * shared by the admin API and the CSV importer, unit-tested.
 *
 * Powertrain rules (REQUIREMENTS §6/§7 — never mix BEV and hybrid data):
 *  - BEV: electric range only, electricity consumption only (also DB triggers).
 *  - HEV (self-charging hybrid, no plug): no electric range, no electricity
 *    consumption, no inlets / charging times / charging curves.
 *  - PHEV / EREV: electric AND total range (never merged), both consumption kinds.
 */
import {
  ConsumptionKind,
  PowertrainType,
  RangeCycle,
  RangeType,
} from '../../../generated/prisma/enums';
import { CatalogErrors, fieldError, Msg } from './catalog-errors';
import { toCanonical } from './catalog-units';
import { cleanText, round } from './values';

export function assertChargingApplicable(powertrain: PowertrainType): void {
  if (powertrain === PowertrainType.HEV) {
    throw CatalogErrors.notApplicable('hev_no_plug', {
      ar: 'الهجينة العادية (HEV) لا تُشحن من مصدر خارجي، فلا منافذ ولا أزمنة أو منحنيات شحن لها.',
      en: 'A self-charging hybrid (HEV) has no plug: inlets, charging times and curves do not apply.',
    });
  }
}

export function assertRangeTypeAllowed(powertrain: PowertrainType, rangeType: RangeType): void {
  if (powertrain === PowertrainType.BEV && rangeType !== RangeType.electric) {
    throw CatalogErrors.notApplicable('bev_total_range', {
      ar: 'السيارة الكهربائية بالكامل (BEV) لها مدى كهربائي فقط؛ المدى الإجمالي للهجينة.',
      en: 'A BEV only has an electric range; a total range belongs to hybrids.',
    });
  }
  if (powertrain === PowertrainType.HEV && rangeType === RangeType.electric) {
    throw CatalogErrors.notApplicable('hev_electric_range', {
      ar: 'الهجينة العادية (HEV) ليس لها مدى كهربائي معتمد.',
      en: 'A self-charging hybrid (HEV) has no rated electric range.',
    });
  }
}

export function assertConsumptionKindAllowed(
  powertrain: PowertrainType,
  kind: ConsumptionKind,
): void {
  if (powertrain === PowertrainType.BEV && kind !== ConsumptionKind.electricity) {
    throw CatalogErrors.notApplicable('bev_fuel', {
      ar: 'السيارة الكهربائية بالكامل (BEV) ليس لها استهلاك وقود.',
      en: 'A BEV has no fuel consumption.',
    });
  }
  if (powertrain === PowertrainType.HEV && kind === ConsumptionKind.electricity) {
    throw CatalogErrors.notApplicable('hev_electricity', {
      ar: 'الهجينة العادية (HEV) لا تستهلك كهرباء من الشبكة.',
      en: 'A self-charging hybrid (HEV) uses no grid electricity.',
    });
  }
}

function otherCycleNote(cycle: string, note: string | null, field: string): string | null {
  if (cycle === RangeCycle.OTHER && !note) {
    throw fieldError(field, 'required', {
      ar: 'اكتب اسم دورة القياس عند اختيار OTHER.',
      en: 'Name the test cycle when choosing OTHER.',
    });
  }
  return note;
}

export interface RangeInput {
  cycle: string;
  cycleNote?: string | null;
  rangeType: string;
  value: number;
  unit?: string | null;
  originalValue?: string | null;
  originalUnit?: string | null;
  wheelSizeInch?: number | null;
  conditions?: string | null;
}

export interface NormalizedRange {
  cycle: RangeCycle;
  cycleNote: string | null;
  rangeType: RangeType;
  valueKm: number;
  originalValue: string | null;
  originalUnit: string | null;
  wheelSizeInch: number | null;
  conditions: string | null;
}

export function normalizeRange(
  input: RangeInput,
  powertrain: PowertrainType,
  prefix = '',
): NormalizedRange {
  const rangeType = input.rangeType as RangeType;
  assertRangeTypeAllowed(powertrain, rangeType);
  if (!(input.value > 0)) throw fieldError(`${prefix}value`, 'min', Msg.positive);
  const c = toCanonical(input.value, input.unit, 'km', {
    field: `${prefix}unit`,
    decimals: 1,
    originalValue: cleanText(input.originalValue ?? null),
    originalUnit: cleanText(input.originalUnit ?? null),
  });
  if (!(c.value > 0)) throw fieldError(`${prefix}value`, 'min', Msg.positive);
  return {
    cycle: input.cycle as RangeCycle,
    cycleNote: otherCycleNote(
      input.cycle,
      cleanText(input.cycleNote ?? null),
      `${prefix}cycleNote`,
    ),
    rangeType,
    valueKm: c.value,
    originalValue: c.originalValue,
    originalUnit: c.originalUnit,
    wheelSizeInch:
      input.wheelSizeInch === null || input.wheelSizeInch === undefined
        ? null
        : round(input.wheelSizeInch, 1),
    conditions: cleanText(input.conditions ?? null, true),
  };
}

export interface ConsumptionInput {
  cycle: string;
  cycleNote?: string | null;
  kind: string;
  mode?: string | null;
  value: number;
  unit?: string | null;
  originalValue?: string | null;
  originalUnit?: string | null;
  conditions?: string | null;
}

export interface NormalizedConsumption {
  cycle: RangeCycle;
  cycleNote: string | null;
  kind: ConsumptionKind;
  mode: string | null;
  value: number;
  originalValue: string | null;
  originalUnit: string | null;
  conditions: string | null;
}

export function consumptionUnit(kind: ConsumptionKind): string {
  return kind === ConsumptionKind.fuel ? 'L/100km' : 'Wh/km';
}

export function normalizeConsumption(
  input: ConsumptionInput,
  powertrain: PowertrainType,
  prefix = '',
): NormalizedConsumption {
  const kind = input.kind as ConsumptionKind;
  assertConsumptionKindAllowed(powertrain, kind);
  if (!(input.value > 0)) throw fieldError(`${prefix}value`, 'min', Msg.positive);
  const c = toCanonical(input.value, input.unit, consumptionUnit(kind), {
    field: `${prefix}unit`,
    decimals: 2,
    originalValue: cleanText(input.originalValue ?? null),
    originalUnit: cleanText(input.originalUnit ?? null),
  });
  if (!(c.value > 0)) throw fieldError(`${prefix}value`, 'min', Msg.positive);
  return {
    cycle: input.cycle as RangeCycle,
    cycleNote: otherCycleNote(
      input.cycle,
      cleanText(input.cycleNote ?? null),
      `${prefix}cycleNote`,
    ),
    kind,
    mode: input.mode ?? null,
    value: c.value,
    originalValue: c.originalValue,
    originalUnit: c.originalUnit,
    conditions: cleanText(input.conditions ?? null, true),
  };
}

export interface ChargingTimeInput {
  currentType: string;
  fromSoc: number;
  toSoc: number;
  duration: number;
  durationUnit?: string | null;
  chargerPowerKw?: number | null;
  peakPowerKw?: number | null;
  averagePowerKw?: number | null;
  onboardChargerLimitKw?: number | null;
  conditions?: string | null;
}

export interface NormalizedChargingTime {
  currentType: 'AC' | 'DC';
  fromSoc: number;
  toSoc: number;
  durationMinutes: number;
  chargerPowerKw: number | null;
  peakPowerKw: number | null;
  averagePowerKw: number | null;
  onboardChargerLimitKw: number | null;
  conditions: string | null;
}

const kw = (v: number | null | undefined): number | null =>
  v === null || v === undefined ? null : round(v, 2);

export function normalizeChargingTime(
  input: ChargingTimeInput,
  powertrain: PowertrainType,
  prefix = '',
): NormalizedChargingTime {
  assertChargingApplicable(powertrain);
  const fromSoc = round(input.fromSoc, 2);
  const toSoc = round(input.toSoc, 2);
  if (fromSoc < 0 || fromSoc > 100 || toSoc < 0 || toSoc > 100) {
    throw fieldError(`${prefix}toSoc`, 'socRange', {
      ar: 'نسبة الشحن بين 0 و100%.',
      en: 'State of charge is between 0 and 100%.',
    });
  }
  if (!(fromSoc < toSoc)) {
    throw fieldError(`${prefix}toSoc`, 'socOrder', {
      ar: 'نسبة النهاية يجب أن تكون أكبر من نسبة البداية.',
      en: 'The final state of charge must be above the starting one.',
    });
  }
  const unit = input.durationUnit ?? 'min';
  const minutes = round(
    unit === 'h' ? input.duration * 60 : unit === 's' ? input.duration / 60 : input.duration,
    2,
  );
  if (!(minutes > 0)) throw fieldError(`${prefix}duration`, 'min', Msg.positive);
  const conditions = cleanText(input.conditions ?? null, true);
  const chargerPowerKw = kw(input.chargerPowerKw);
  if (chargerPowerKw === null && conditions === null) {
    throw fieldError(`${prefix}chargerPowerKw`, 'chargerCondition', {
      ar: 'اذكر قدرة الشاحن المستخدم أو اكتب ظروف القياس (لا يُعرض زمن شحن بلا شرط الشاحن).',
      en: 'State the charger power or describe the test conditions (a charging time always needs its charger condition).',
    });
  }
  const peak = kw(input.peakPowerKw);
  const avg = kw(input.averagePowerKw);
  if (peak !== null && avg !== null && avg > peak) {
    throw fieldError(`${prefix}averagePowerKw`, 'averageAbovePeak', {
      ar: 'متوسط القدرة لا يمكن أن يتجاوز القدرة القصوى.',
      en: 'Average power cannot exceed peak power.',
    });
  }
  return {
    currentType: input.currentType as 'AC' | 'DC',
    fromSoc,
    toSoc,
    durationMinutes: minutes,
    chargerPowerKw,
    peakPowerKw: peak,
    averagePowerKw: avg,
    onboardChargerLimitKw: kw(input.onboardChargerLimitKw),
    conditions,
  };
}

export interface CurvePointInput {
  socPercent: number;
  powerKw: number;
}

/** Sorted, de-duplicated (by SoC) curve points; duplicates are an error. */
export function normalizeCurvePoints(
  points: CurvePointInput[],
  prefix = 'points',
): { socPercent: number; powerKw: number }[] {
  if (points.length < 2) {
    throw fieldError(prefix, 'arrayMinSize', {
      ar: 'المنحنى يحتاج نقطتين على الأقل.',
      en: 'A curve needs at least two points.',
    });
  }
  const seen = new Set<number>();
  const out = points.map((p, i) => {
    const soc = round(p.socPercent, 2);
    if (soc < 0 || soc > 100) {
      throw fieldError(`${prefix}.${i}.socPercent`, 'socRange', {
        ar: 'نسبة الشحن بين 0 و100%.',
        en: 'State of charge is between 0 and 100%.',
      });
    }
    if (p.powerKw < 0) throw fieldError(`${prefix}.${i}.powerKw`, 'min', Msg.nonNegative);
    if (seen.has(soc)) {
      throw fieldError(`${prefix}.${i}.socPercent`, 'unique', {
        ar: 'تكررت نسبة الشحن نفسها في المنحنى.',
        en: 'The same state of charge appears twice.',
      });
    }
    seen.add(soc);
    return { socPercent: soc, powerKw: round(p.powerKw, 2) };
  });
  return out.sort((a, b) => a.socPercent - b.socPercent);
}
