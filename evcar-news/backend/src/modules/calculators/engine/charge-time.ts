/**
 * Charging duration, REQUIREMENTS §13.
 *
 * AC:  P = min(car on-board AC limit, station power, supply limit)
 *      supply limit = phases × volts per phase × amps ÷ 1000
 *      time = E_grid ÷ P = (E_batt ÷ efficiency) ÷ P
 *      (AC limits are ratings on the supply side, so losses are counted once,
 *       through the efficiency.)
 *      Confidence: medium when the car limit and a station/supply limit are
 *      known, low otherwise. The slower last percent near 100 % is ignored
 *      (warning).
 *
 * DC:  with a documented charging curve (SoC % → kW) covering the requested
 *      window: time = Σ ΔE / min(curve(SoC), station power) over 0.5 % steps
 *      (linear interpolation; curve power = power into the car; confidence
 *      medium — temperature / preconditioning change it).
 *      Without a usable curve: a LOW-confidence RANGE only, assuming the
 *      average power is 50–90 % of the limiting peak — never "energy ÷ peak"
 *      presented as the answer. `minutes` is null in that case.
 */
import {
  type CalcLang,
  type CalcOutput,
  type Confidence,
  num,
  originOf,
  Problems,
  type ProvenanceMap,
  round,
  Trace,
} from './core';
import {
  readEfficiency,
  readSocWindow,
  traceEnergyAdded,
  traceGridEnergy,
  useEfficiency,
} from './energy';

export interface CurvePoint {
  socPercent: number;
  powerKw: number;
}

export interface ChargeTimeInput {
  currentType?: 'AC' | 'DC' | null;
  batteryUsableKwh?: number | null;
  fromSocPercent?: number | null;
  toSocPercent?: number | null;
  efficiency?: number | null;
  /** Station / charger rated power (kW). */
  stationPowerKw?: number | null;
  /** AC: car on-board charger limit (kW). */
  vehicleAcMaxKw?: number | null;
  /** AC: supply limit (phases × volts × amps). */
  supplyPhases?: number | null;
  supplyAmps?: number | null;
  supplyVoltsPerPhase?: number | null;
  /** DC: car peak DC power (kW). */
  vehicleDcPeakKw?: number | null;
  /** DC: documented charging curve. */
  curve?: CurvePoint[] | null;
}

export interface ChargeTimeResult {
  currentType: 'AC' | 'DC';
  energyAddedKwh: number;
  gridEnergyKwh: number;
  /** Null when only a rough range can be given (DC without a usable curve). */
  minutes: number | null;
  minutesRange: { low: number; high: number } | null;
  /** AC: limiting power; DC with curve: average power into the car. */
  powerKw: number | null;
  limitingFactor: 'vehicle' | 'station' | 'supply' | 'curve' | 'unknown';
  method: 'ac_power_limit' | 'dc_curve' | 'dc_rough_estimate';
  isRoughEstimate: boolean;
}

export const DEFAULT_VOLTS_PER_PHASE = 230;
export const CURVE_STEP_PERCENT = 0.5;
/** Rough DC estimate: average power as a share of the limiting peak. */
export const DC_ROUGH_AVERAGE_SHARE = { low: 0.5, high: 0.9 } as const;

const LABELS = {
  currentType: { ar: 'نوع التيار', en: 'Current type' },
  stationPower: { ar: 'قدرة المحطة', en: 'Station power' },
  vehicleAc: { ar: 'حد الشاحن الداخلي للسيارة (AC)', en: 'Car on-board AC limit' },
  vehicleDc: { ar: 'أقصى قدرة DC للسيارة', en: 'Car peak DC power' },
  supplyPhases: { ar: 'عدد الأطوار', en: 'Supply phases' },
  supplyAmps: { ar: 'شدة التيار', en: 'Supply current' },
  supplyVolts: { ar: 'الجهد لكل طور', en: 'Volts per phase' },
  supplyKw: { ar: 'حد مصدر الكهرباء', en: 'Supply limit' },
  effectivePower: { ar: 'القدرة الفعلية', en: 'Effective power' },
  minutes: { ar: 'المدة', en: 'Duration' },
  curve: { ar: 'منحنى الشحن الموثّق', en: 'Documented charging curve' },
  averagePower: { ar: 'متوسط القدرة', en: 'Average power' },
  range: { ar: 'نطاق تقديري', en: 'Estimated range' },
  roughShare: {
    ar: 'متوسط القدرة المفترض كنسبة من القدرة القصوى',
    en: 'Assumed average power as a share of peak',
  },
} as const;

const FORMULA_AC = {
  ar: 'مدة AC = (الطاقة المضافة ÷ الكفاءة) ÷ أقل قيمة بين حد السيارة وقدرة المحطة وحد مصدر الكهرباء.',
  en: 'AC time = (energy added ÷ efficiency) ÷ min(car on-board limit, station power, supply limit).',
};
const FORMULA_DC_CURVE = {
  ar: 'مدة DC = مجموع (الطاقة لكل 0.5% ÷ أقل قيمة بين قدرة المنحنى عند تلك النسبة وقدرة المحطة).',
  en: 'DC time = Σ (energy per 0.5 % SoC ÷ min(curve power at that SoC, station power)).',
};
const FORMULA_DC_ROUGH = {
  ar: 'تقدير DC منخفض الثقة: الطاقة المضافة ÷ (50% إلى 90% من أقل قيمة بين أقصى قدرة للسيارة وقدرة المحطة).',
  en: 'Low-confidence DC estimate: energy added ÷ (50 %–90 % of min(car peak, station power)).',
};

/** Validates a curve: ≥ 2 points, SoC 0..100 strictly increasing, power ≥ 0. */
export function validateCurve(p: Problems, raw: unknown): CurvePoint[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 202) {
    p.add('curve', 'points', {
      ar: 'يجب أن يحتوي المنحنى على نقطتين على الأقل.',
      en: 'The curve needs at least 2 points.',
    });
    return undefined;
  }
  const pts: CurvePoint[] = [];
  raw.forEach((pt: { socPercent?: unknown; powerKw?: unknown } | null, i) => {
    const soc = num(p, `curve.${i}.socPercent`, pt?.socPercent, {
      required: true,
      min: 0,
      max: 100,
    });
    const kw = num(p, `curve.${i}.powerKw`, pt?.powerKw, {
      required: true,
      nonNegative: true,
      max: 2000,
    });
    if (soc !== undefined && kw !== undefined) pts.push({ socPercent: soc, powerKw: kw });
  });
  if (pts.length !== raw.length) return undefined;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].socPercent <= pts[i - 1].socPercent) {
      p.add('curve', 'ascending', {
        ar: 'يجب أن تكون نسب الشحن في المنحنى تصاعدية وبلا تكرار.',
        en: 'Curve SoC values must be strictly increasing.',
      });
      return undefined;
    }
  }
  return pts;
}

/** Linear interpolation of the curve at `soc` (caller ensures coverage). */
export function curvePowerAt(curve: CurvePoint[], soc: number): number {
  if (soc <= curve[0].socPercent) return curve[0].powerKw;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if (soc <= b.socPercent) {
      const f = (soc - a.socPercent) / (b.socPercent - a.socPercent);
      return a.powerKw + f * (b.powerKw - a.powerKw);
    }
  }
  return curve[curve.length - 1].powerKw;
}

/**
 * Integrates the curve between from and to (percent). Returns minutes, or
 * null when the curve does not cover the window or has zero power inside it.
 */
export function integrateCurve(
  curve: CurvePoint[],
  usableKwh: number,
  from: number,
  to: number,
  stationKw?: number,
): { minutes: number; limitedByStation: boolean } | null {
  const first = curve[0].socPercent;
  const last = curve[curve.length - 1].socPercent;
  if (from < first || to > last) return null;
  let hours = 0;
  let limited = false;
  for (let s = from; s < to - 1e-9; s += CURVE_STEP_PERCENT) {
    const e = Math.min(CURVE_STEP_PERCENT, to - s);
    const mid = s + e / 2;
    let kw = curvePowerAt(curve, mid);
    if (stationKw !== undefined && stationKw < kw) {
      kw = stationKw;
      limited = true;
    }
    if (!(kw > 0)) return null;
    hours += (usableKwh * e) / 100 / kw;
  }
  return { minutes: hours * 60, limitedByStation: limited };
}

export function chargeTime(
  input: ChargeTimeInput,
  lang: CalcLang = 'en',
  prov?: ProvenanceMap,
): CalcOutput<ChargeTimeResult> {
  const p = new Problems();
  const trace = new Trace(lang);
  const type = input.currentType;
  if (type !== 'AC' && type !== 'DC') {
    p.add('currentType', type === undefined || type === null ? 'required' : 'isIn', {
      ar: 'اختر نوع الشحن: AC أو DC.',
      en: 'Choose the charging type: AC or DC.',
    });
  }
  const w = readSocWindow(p, input);
  const eff = readEfficiency(p, input.efficiency);
  const station = num(p, 'stationPowerKw', input.stationPowerKw, { positive: true, max: 2000 });
  const acMax = num(p, 'vehicleAcMaxKw', input.vehicleAcMaxKw, { positive: true, max: 100 });
  const dcPeak = num(p, 'vehicleDcPeakKw', input.vehicleDcPeakKw, { positive: true, max: 2000 });
  const phases = num(p, 'supplyPhases', input.supplyPhases, {});
  if (phases !== undefined && phases !== 1 && phases !== 3) {
    p.add('supplyPhases', 'isIn', { ar: 'عدد الأطوار 1 أو 3.', en: 'Phases must be 1 or 3.' });
  }
  const amps = num(p, 'supplyAmps', input.supplyAmps, { positive: true, max: 1000 });
  const volts = num(p, 'supplyVoltsPerPhase', input.supplyVoltsPerPhase, {
    positive: true,
    max: 1000,
  });
  if ((phases === undefined) !== (amps === undefined)) {
    p.add(phases === undefined ? 'supplyPhases' : 'supplyAmps', 'required', {
      ar: 'حد مصدر الكهرباء يحتاج عدد الأطوار وشدة التيار معًا.',
      en: 'A supply limit needs both phases and amps.',
    });
  }
  const curve = validateCurve(p, input.curve);
  if (type === 'AC' && station === undefined && acMax === undefined && amps === undefined) {
    p.add('stationPowerKw', 'required', {
      ar: 'أدخل قدرة المحطة أو حد الشاحن الداخلي للسيارة على الأقل.',
      en: 'Enter at least the station power or the car on-board AC limit.',
    });
  }
  if (type === 'DC' && station === undefined && dcPeak === undefined && !curve) {
    p.add('stationPowerKw', 'required', {
      ar: 'أدخل قدرة المحطة أو أقصى قدرة DC للسيارة أو منحنى الشحن.',
      en: 'Enter the station power, the car peak DC power or a charging curve.',
    });
  }
  p.throwIfAny();

  trace.assume('currentType', LABELS.currentType, type!, null, 'user');
  const added = traceEnergyAdded(trace, w!, prov);
  const efficiency = useEfficiency(trace, eff, prov);
  const grid = traceGridEnergy(trace, added, efficiency.value);
  const note = (key: string) => originOf(prov, key);

  if (station !== undefined) {
    trace.assume(
      'stationPowerKw',
      LABELS.stationPower,
      station,
      'kW',
      note('stationPowerKw').origin,
      note('stationPowerKw').note,
    );
  }

  if (type === 'AC') {
    const limits: { kind: 'vehicle' | 'station' | 'supply'; kw: number }[] = [];
    if (acMax !== undefined) {
      trace.assume(
        'vehicleAcMaxKw',
        LABELS.vehicleAc,
        acMax,
        'kW',
        note('vehicleAcMaxKw').origin,
        note('vehicleAcMaxKw').note,
      );
      limits.push({ kind: 'vehicle', kw: acMax });
    } else {
      trace.warn('VEHICLE_AC_LIMIT_UNKNOWN', {
        ar: 'حد الشاحن الداخلي للسيارة غير معروف؛ قد تكون المدة الفعلية أطول.',
        en: 'The car on-board AC limit is unknown; the real time may be longer.',
      });
    }
    if (station !== undefined) limits.push({ kind: 'station', kw: station });
    if (phases !== undefined && amps !== undefined) {
      const v = volts ?? DEFAULT_VOLTS_PER_PHASE;
      trace.assume('supplyPhases', LABELS.supplyPhases, phases, null, 'user');
      trace.assume('supplyAmps', LABELS.supplyAmps, amps, 'A', 'user');
      trace.assume(
        'supplyVoltsPerPhase',
        LABELS.supplyVolts,
        v,
        'V',
        volts === undefined ? 'default' : 'user',
      );
      const kw = (phases * v * amps) / 1000;
      trace.step(
        'supplyKw',
        LABELS.supplyKw,
        `${phases} × ${v} V × ${amps} A ÷ 1000 = ${round(kw, 2)} kW`,
        round(kw, 2),
        'kW',
      );
      limits.push({ kind: 'supply', kw });
    }
    const best = limits.reduce((a, b) => (b.kw < a.kw ? b : a));
    trace.step(
      'effectivePowerKw',
      LABELS.effectivePower,
      `min(${limits.map((l) => `${round(l.kw, 2)}`).join(', ')}) = ${round(best.kw, 2)} kW`,
      round(best.kw, 2),
      'kW',
    );
    const minutes = (grid / best.kw) * 60;
    trace.step(
      'minutes',
      LABELS.minutes,
      `${round(grid, 3)} kWh ÷ ${round(best.kw, 2)} kW × 60 = ${round(minutes, 0)} min`,
      round(minutes, 0),
      'min',
    );
    if (w!.to > 90) {
      trace.warn('TOP_OFF_SLOWER', {
        ar: 'الشحن فوق 90% قد يبطؤ؛ المدة الفعلية قد تزيد.',
        en: 'Charging above 90 % may slow down; the real time can be longer.',
      });
    }
    const confidence: Confidence =
      acMax !== undefined && (station !== undefined || amps !== undefined) ? 'medium' : 'low';
    return trace.output(
      'charge-time',
      {
        currentType: 'AC',
        energyAddedKwh: round(added, 3),
        gridEnergyKwh: round(grid, 3),
        minutes: Math.round(minutes),
        minutesRange: null,
        powerKw: round(best.kw, 2),
        limitingFactor: best.kind,
        method: 'ac_power_limit',
        isRoughEstimate: false,
      },
      FORMULA_AC,
      confidence,
      { energy: 'kWh', power: 'kW', time: 'min' },
    );
  }

  // --- DC ---------------------------------------------------------------------------------
  if (dcPeak !== undefined) {
    trace.assume(
      'vehicleDcPeakKw',
      LABELS.vehicleDc,
      dcPeak,
      'kW',
      note('vehicleDcPeakKw').origin,
      note('vehicleDcPeakKw').note,
    );
  }
  if (curve) {
    trace.assume(
      'curve',
      LABELS.curve,
      curve.map((c) => `${c.socPercent}%:${c.powerKw}kW`).join(', '),
      null,
      note('curve').origin,
      note('curve').note,
    );
    const integ = integrateCurve(curve, w!.usable, w!.from, w!.to, station);
    if (integ) {
      const avg = added / (integ.minutes / 60);
      trace.step(
        'averagePowerKw',
        LABELS.averagePower,
        `${round(added, 3)} kWh ÷ ${round(integ.minutes / 60, 3)} h = ${round(avg, 1)} kW`,
        round(avg, 1),
        'kW',
      );
      trace.step(
        'minutes',
        LABELS.minutes,
        `Σ ΔE ÷ P(SoC) = ${round(integ.minutes, 0)} min`,
        round(integ.minutes, 0),
        'min',
      );
      trace.warn('CURVE_CONDITIONS', {
        ar: 'المنحنى مقيس في ظروف محددة؛ الحرارة وتهيئة البطارية وحالة الشاحن تغيّر المدة.',
        en: 'The curve was measured in specific conditions; temperature, preconditioning and the charger change the time.',
      });
      return trace.output(
        'charge-time',
        {
          currentType: 'DC',
          energyAddedKwh: round(added, 3),
          gridEnergyKwh: round(grid, 3),
          minutes: Math.round(integ.minutes),
          minutesRange: null,
          powerKw: round(avg, 1),
          limitingFactor: integ.limitedByStation ? 'station' : 'curve',
          method: 'dc_curve',
          isRoughEstimate: false,
        },
        FORMULA_DC_CURVE,
        'medium',
        { energy: 'kWh', power: 'kW', time: 'min' },
      );
    }
    trace.warn('CURVE_NOT_USABLE', {
      ar: 'منحنى الشحن لا يغطي نطاق الشحن المطلوب؛ استُخدم تقدير منخفض الثقة.',
      en: 'The charging curve does not cover the requested window; a low-confidence estimate is used.',
    });
  }

  const peaks: { kind: 'vehicle' | 'station'; kw: number }[] = [];
  if (dcPeak !== undefined) peaks.push({ kind: 'vehicle', kw: dcPeak });
  if (station !== undefined) peaks.push({ kind: 'station', kw: station });
  if (!peaks.length) {
    // Only an unusable curve was given: refuse instead of inventing a number.
    const q = new Problems();
    q.add('curve', 'coverage', {
      ar: 'المنحنى لا يغطي النطاق المطلوب؛ أدخل قدرة المحطة أو أقصى قدرة DC للسيارة.',
      en: 'The curve does not cover the window; enter the station power or the car peak DC power.',
    });
    q.throwIfAny();
  }
  const peak = peaks.reduce((a, b) => (b.kw < a.kw ? b : a));
  trace.assume(
    'dcAverageShare',
    LABELS.roughShare,
    `${DC_ROUGH_AVERAGE_SHARE.low}–${DC_ROUGH_AVERAGE_SHARE.high}`,
    null,
    'default',
  );
  const low = (added / (peak.kw * DC_ROUGH_AVERAGE_SHARE.high)) * 60;
  const high = (added / (peak.kw * DC_ROUGH_AVERAGE_SHARE.low)) * 60;
  trace.step(
    'minutesRange',
    LABELS.range,
    `${round(added, 3)} kWh ÷ (${DC_ROUGH_AVERAGE_SHARE.high}…${DC_ROUGH_AVERAGE_SHARE.low} × ${round(peak.kw, 1)} kW) × 60 = ${Math.round(low)}–${Math.round(high)} min`,
    `${Math.round(low)}–${Math.round(high)}`,
    'min',
  );
  trace.warn('NO_CHARGING_CURVE', {
    ar: 'لا يتوفر منحنى شحن موثّق؛ هذا نطاق تقديري منخفض الثقة وليس زمنًا دقيقًا.',
    en: 'No documented charging curve; this is a low-confidence range, not an exact time.',
  });
  return trace.output(
    'charge-time',
    {
      currentType: 'DC',
      energyAddedKwh: round(added, 3),
      gridEnergyKwh: round(grid, 3),
      minutes: null,
      minutesRange: { low: Math.round(low), high: Math.round(high) },
      powerKw: null,
      limitingFactor: peak.kind,
      method: 'dc_rough_estimate',
      isRoughEstimate: true,
    },
    FORMULA_DC_ROUGH,
    'low',
    { energy: 'kWh', power: 'kW', time: 'min' },
  );
}
