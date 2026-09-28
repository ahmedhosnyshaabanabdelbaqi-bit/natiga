/**
 * Charging session cost (home or public), REQUIREMENTS §13.
 *
 *   E_batt = usable × ΔSoC            (or the energy the user entered)
 *   E_grid = E_batt ÷ efficiency      (skipped when the entered energy is grid-side)
 *   energy cost   = E_grid × price per kWh
 *   time cost     = charging minutes × price per minute (or per hour ÷ 60)
 *   session fee   = flat, as entered
 *   parking cost  = parking minutes × rate, or a flat fee
 *   idle cost     = max(0, idle minutes − grace) × rate
 *   total         = sum of the components that were entered
 * Components not entered are `null` ("not included"), never 0.
 */
import type { Money } from '../../../common/money/money';
import { Decimal } from '../../../common/money/money';
import {
  type CalcLang,
  type CalcOutput,
  type Confidence,
  dec,
  money,
  num,
  Problems,
  type ProvenanceMap,
  rate,
  round,
  Trace,
} from './core';
import {
  type EnergyBasis,
  readEfficiency,
  readSocWindow,
  traceEnergyAdded,
  traceGridEnergy,
  useEfficiency,
  ENERGY_LABELS,
} from './energy';
import { readPrice, readPriceContext, tracePrice, tracePriceContext } from './prices';

export interface ChargeCostTariff {
  energyPerKwh?: number | string | null;
  timePerMinute?: number | string | null;
  timePerHour?: number | string | null;
  sessionFee?: number | string | null;
  parkingPerMinute?: number | string | null;
  parkingPerHour?: number | string | null;
  parkingFlat?: number | string | null;
  idlePerMinute?: number | string | null;
  idlePerHour?: number | string | null;
  idleGraceMinutes?: number | string | null;
}

export interface ChargeCostInput {
  batteryUsableKwh?: number | null;
  fromSocPercent?: number | null;
  toSocPercent?: number | null;
  /** Alternative to capacity + SoC: energy the user read somewhere. */
  energyKwh?: number | null;
  /** Where `energyKwh` was measured: battery side (default) or grid/meter side. */
  energyBasis?: EnergyBasis | null;
  efficiency?: number | null;
  currency?: string | null;
  priceDate?: string | null;
  tariff?: ChargeCostTariff | null;
  chargingMinutes?: number | null;
  parkingMinutes?: number | null;
  idleMinutes?: number | null;
}

export interface ChargeCostResult {
  energyAddedKwh: number | null;
  gridEnergyKwh: number;
  lossesKwh: number | null;
  efficiencyApplied: number | null;
  energyBasis: EnergyBasis;
  cost: {
    energy: Money | null;
    time: Money | null;
    sessionFee: Money | null;
    parking: Money | null;
    idle: Money | null;
    total: Money;
  };
  /** Total ÷ energy added to the battery (null when that energy is unknown). */
  costPerKwhAdded: Money | null;
  priceDate: string | null;
}

const LABELS = {
  pricePerKwh: { ar: 'سعر الكيلوواط ساعة', en: 'Price per kWh' },
  pricePerMinute: { ar: 'سعر الدقيقة', en: 'Price per minute' },
  sessionFee: { ar: 'رسوم الجلسة', en: 'Session fee' },
  parking: { ar: 'رسوم الوقوف', en: 'Parking fee' },
  idle: { ar: 'رسوم الانتظار بعد الشحن', en: 'Idle fee' },
  energyCost: { ar: 'تكلفة الطاقة', en: 'Energy cost' },
  timeCost: { ar: 'تكلفة الوقت', en: 'Time cost' },
  total: { ar: 'الإجمالي', en: 'Total' },
  chargingMinutes: { ar: 'مدة الشحن', en: 'Charging duration' },
  parkingMinutes: { ar: 'مدة الوقوف', en: 'Parking duration' },
  idleMinutes: { ar: 'مدة الانتظار بعد اكتمال الشحن', en: 'Idle time after charging' },
  idleGrace: { ar: 'مهلة الانتظار المجانية', en: 'Free idle grace period' },
} as const;

const FORMULA = {
  ar: 'الطاقة المضافة = السعة القابلة للاستخدام × فرق نسبة الشحن؛ طاقة الشبكة = الطاقة المضافة ÷ الكفاءة؛ التكلفة = طاقة الشبكة × سعر الكيلوواط ساعة + رسوم الوقت والجلسة والوقوف والانتظار كما أُدخلت.',
  en: 'Energy added = usable capacity × ΔSoC; grid energy = energy added ÷ efficiency; cost = grid energy × price per kWh + time, session, parking and idle fees as entered.',
};

export function chargeCost(
  input: ChargeCostInput,
  lang: CalcLang = 'en',
  prov?: ProvenanceMap,
): CalcOutput<ChargeCostResult> {
  const p = new Problems();
  const trace = new Trace(lang);

  // --- energy ---------------------------------------------------------------------------
  const hasDirect = input.energyKwh !== undefined && input.energyKwh !== null;
  const basis: EnergyBasis = input.energyBasis ?? 'battery';
  if (input.energyBasis && !['battery', 'grid'].includes(input.energyBasis)) {
    p.add('energyBasis', 'isIn', { ar: 'القيمة: battery أو grid.', en: 'Use battery or grid.' });
  }
  let direct: number | undefined;
  let window: ReturnType<typeof readSocWindow>;
  if (hasDirect) {
    direct = num(p, 'energyKwh', input.energyKwh, { required: true, positive: true, max: 10_000 });
  } else {
    if (input.energyBasis === 'grid') {
      p.add('energyBasis', 'needsEnergyKwh', {
        ar: 'أساس "grid" يُستخدم فقط مع energyKwh.',
        en: '"grid" basis only applies to energyKwh.',
      });
    }
    window = readSocWindow(p, input);
  }
  const efficiencyGiven = readEfficiency(p, input.efficiency);

  // --- prices -----------------------------------------------------------------------------
  const ctx = readPriceContext(p, input);
  const tf = input.tariff ?? {};
  const perKwh = readPrice(p, 'tariff.energyPerKwh', tf.energyPerKwh);
  const perMin = readPrice(p, 'tariff.timePerMinute', tf.timePerMinute);
  const perHour = readPrice(p, 'tariff.timePerHour', tf.timePerHour);
  const session = readPrice(p, 'tariff.sessionFee', tf.sessionFee);
  const parkMin = readPrice(p, 'tariff.parkingPerMinute', tf.parkingPerMinute);
  const parkHour = readPrice(p, 'tariff.parkingPerHour', tf.parkingPerHour);
  const parkFlat = readPrice(p, 'tariff.parkingFlat', tf.parkingFlat);
  const idleMin = readPrice(p, 'tariff.idlePerMinute', tf.idlePerMinute);
  const idleHour = readPrice(p, 'tariff.idlePerHour', tf.idlePerHour);
  const idleGrace = num(p, 'tariff.idleGraceMinutes', tf.idleGraceMinutes, {
    nonNegative: true,
    max: 10_000,
  });
  const chargingMinutes = num(p, 'chargingMinutes', input.chargingMinutes, {
    positive: true,
    max: 10_000,
  });
  const parkingMinutes = num(p, 'parkingMinutes', input.parkingMinutes, {
    nonNegative: true,
    max: 100_000,
  });
  const idleMinutes = num(p, 'idleMinutes', input.idleMinutes, {
    nonNegative: true,
    max: 100_000,
  });

  const oneOf = (field: string, a: unknown, b: unknown) => {
    if (a !== undefined && b !== undefined) {
      p.add(field, 'oneOf', {
        ar: 'أدخل سعرًا واحدًا فقط (بالدقيقة أو بالساعة).',
        en: 'Enter one rate only (per minute or per hour).',
      });
    }
  };
  oneOf('tariff.timePerHour', perMin, perHour);
  oneOf('tariff.parkingPerHour', parkMin, parkHour);
  oneOf('tariff.idlePerHour', idleMin, idleHour);
  if ((parkMin || parkHour) && parkFlat !== undefined) {
    p.add('tariff.parkingFlat', 'oneOf', {
      ar: 'أدخل رسوم وقوف ثابتة أو بالوقت، لا الاثنين.',
      en: 'Enter a flat or a time-based parking fee, not both.',
    });
  }
  const anyPrice = [
    perKwh,
    perMin,
    perHour,
    session,
    parkMin,
    parkHour,
    parkFlat,
    idleMin,
    idleHour,
  ].filter((v) => v !== undefined).length;
  if (anyPrice === 0 && !p.list.some((x) => x.field.startsWith('tariff.'))) {
    p.add('tariff', 'required', {
      ar: 'أدخل سعرًا واحدًا على الأقل (مثل سعر الكيلوواط ساعة). لا توجد أسعار افتراضية.',
      en: 'Enter at least one price (e.g. price per kWh). There are no default prices.',
    });
  }
  if ((perMin || perHour) && chargingMinutes === undefined && !p.has('chargingMinutes')) {
    p.add('chargingMinutes', 'required', {
      ar: 'مدة الشحن مطلوبة لحساب رسوم الوقت.',
      en: 'The charging duration is needed for a time-based price.',
    });
  }
  if ((parkMin || parkHour) && parkingMinutes === undefined && !p.has('parkingMinutes')) {
    p.add('parkingMinutes', 'required', {
      ar: 'مدة الوقوف مطلوبة لحساب رسوم الوقوف.',
      en: 'The parking duration is needed for a time-based parking fee.',
    });
  }
  if ((idleMin || idleHour) && idleMinutes === undefined && !p.has('idleMinutes')) {
    p.add('idleMinutes', 'required', {
      ar: 'مدة الانتظار مطلوبة لحساب رسوم الانتظار.',
      en: 'The idle time is needed for an idle fee.',
    });
  }
  p.throwIfAny();
  const c = ctx!;
  const cur = c.currency;

  // --- compute --------------------------------------------------------------------------
  let added: number | null;
  let grid: number;
  let efficiencyApplied: number | null = null;
  let confidence: Confidence = 'high';
  if (hasDirect && basis === 'grid') {
    added = null;
    grid = direct!;
    trace.assume('energyBasis', ENERGY_LABELS.energyBasis, 'grid', null, 'user');
    trace.step('gridEnergyKwh', ENERGY_LABELS.gridEnergy, `${grid} kWh`, round(grid, 3), 'kWh');
    if (efficiencyGiven !== undefined) {
      trace.warn('EFFICIENCY_NOT_APPLIED', {
        ar: 'لم تُطبَّق الكفاءة لأن الطاقة المُدخلة مقيسة من الشبكة (الفاقد محسوب فيها بالفعل).',
        en: 'Efficiency was not applied: the entered energy is grid-side (losses already included).',
      });
    }
  } else {
    if (hasDirect) {
      added = direct!;
      trace.assume('energyBasis', ENERGY_LABELS.energyBasis, 'battery', null, 'user');
      trace.step(
        'energyAddedKwh',
        ENERGY_LABELS.energyAdded,
        `${added} kWh`,
        round(added, 3),
        'kWh',
      );
    } else {
      added = traceEnergyAdded(trace, window!, prov);
    }
    const eff = useEfficiency(trace, efficiencyGiven, prov);
    if (eff.defaulted) confidence = 'medium';
    efficiencyApplied = eff.value;
    grid = traceGridEnergy(trace, added, eff.value);
  }

  tracePriceContext(trace, c, prov);
  let total = new Decimal(0);
  const out: ChargeCostResult['cost'] = {
    energy: null,
    time: null,
    sessionFee: null,
    parking: null,
    idle: null,
    total: money(0, cur),
  };

  if (perKwh !== undefined) {
    tracePrice(trace, 'tariff.energyPerKwh', LABELS.pricePerKwh, perKwh, 'kWh', cur, prov);
    const v = dec(grid).times(perKwh);
    out.energy = money(v, cur);
    total = total.plus(v);
    trace.step(
      'energyCost',
      LABELS.energyCost,
      `${round(grid, 3)} kWh × ${rate(perKwh, cur).amount} ${cur} = ${out.energy.amount} ${cur}`,
      out.energy.amount,
      cur,
    );
  }
  if (perMin !== undefined || perHour !== undefined) {
    const perMinute = perMin ?? perHour!.div(60);
    tracePrice(trace, 'tariff.timePerMinute', LABELS.pricePerMinute, perMinute, 'min', cur, prov);
    trace.assume('chargingMinutes', LABELS.chargingMinutes, chargingMinutes!, 'min', 'user');
    const v = dec(chargingMinutes!).times(perMinute);
    out.time = money(v, cur);
    total = total.plus(v);
    trace.step(
      'timeCost',
      LABELS.timeCost,
      `${chargingMinutes} min × ${rate(perMinute, cur).amount} ${cur} = ${out.time.amount} ${cur}`,
      out.time.amount,
      cur,
    );
  }
  if (session !== undefined) {
    out.sessionFee = money(session, cur);
    total = total.plus(session);
    trace.step(
      'sessionFee',
      LABELS.sessionFee,
      `${out.sessionFee.amount} ${cur}`,
      out.sessionFee.amount,
      cur,
    );
  }
  if (parkFlat !== undefined) {
    out.parking = money(parkFlat, cur);
    total = total.plus(parkFlat);
    trace.step('parking', LABELS.parking, `${out.parking.amount} ${cur}`, out.parking.amount, cur);
  } else if (parkMin !== undefined || parkHour !== undefined) {
    const perMinute = parkMin ?? parkHour!.div(60);
    trace.assume('parkingMinutes', LABELS.parkingMinutes, parkingMinutes!, 'min', 'user');
    const v = dec(parkingMinutes!).times(perMinute);
    out.parking = money(v, cur);
    total = total.plus(v);
    trace.step(
      'parking',
      LABELS.parking,
      `${parkingMinutes} min × ${rate(perMinute, cur).amount} ${cur} = ${out.parking.amount} ${cur}`,
      out.parking.amount,
      cur,
    );
  }
  if (idleMin !== undefined || idleHour !== undefined) {
    const perMinute = idleMin ?? idleHour!.div(60);
    const grace = idleGrace ?? 0;
    trace.assume('idleMinutes', LABELS.idleMinutes, idleMinutes!, 'min', 'user');
    trace.assume('tariff.idleGraceMinutes', LABELS.idleGrace, idleGrace ?? null, 'min', 'user');
    const billable = Math.max(0, idleMinutes! - grace);
    const v = dec(billable).times(perMinute);
    out.idle = money(v, cur);
    total = total.plus(v);
    trace.step(
      'idle',
      LABELS.idle,
      `max(0, ${idleMinutes} − ${grace}) min × ${rate(perMinute, cur).amount} ${cur} = ${out.idle.amount} ${cur}`,
      out.idle.amount,
      cur,
    );
  }
  out.total = money(total, cur);
  trace.step('total', LABELS.total, `${out.total.amount} ${cur}`, out.total.amount, cur);

  const costPerKwhAdded = added && added > 0 ? rate(total.div(added), cur) : null;

  return trace.output(
    'charge-cost',
    {
      energyAddedKwh: added === null ? null : round(added, 3),
      gridEnergyKwh: round(grid, 3),
      lossesKwh: added === null ? null : round(grid - added, 3),
      efficiencyApplied,
      energyBasis: hasDirect ? basis : 'battery',
      cost: out,
      costPerKwhAdded,
      priceDate: c.priceDate,
    },
    FORMULA,
    confidence,
    { energy: 'kWh', time: 'min', money: cur, price: `${cur}/kWh` },
  );
}
