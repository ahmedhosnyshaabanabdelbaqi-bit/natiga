/**
 * Running costs (REQUIREMENTS §13): cost per 100 km, monthly cost, EV vs
 * fuel. Energy cost only — it is kept apart from the total cost of ownership
 * (tco.ts).
 *
 *   grid consumption  = consumption            (basis "grid": ratings such as
 *                                               WLTP/EPA are measured at the plug)
 *                     = consumption ÷ efficiency (basis "battery")
 *   blended price     = main price × (1 − public share) + public price × public share
 *   cost per 100 km   = grid kWh/100 km × blended price
 *   monthly energy    = km per month × grid kWh/100 km ÷ 100
 *   fuel per 100 km   = L/100 km × price per litre
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
  originOf,
  Problems,
  type ProvenanceMap,
  rate,
  round,
  Trace,
} from './core';
import { readEfficiency, useEfficiency } from './energy';
import {
  readPrice,
  readPriceContext,
  type PriceContext,
  tracePrice,
  tracePriceContext,
} from './prices';

export const DAYS_PER_MONTH = 30.4375;

export interface ElectricUseInput {
  consumptionKwhPer100km?: number | null;
  consumptionWhPerKm?: number | null;
  consumptionBasis?: 'grid' | 'battery' | null;
  efficiency?: number | null;
  electricityPricePerKwh?: number | string | null;
  publicPricePerKwh?: number | string | null;
  publicSharePercent?: number | null;
  currency?: string | null;
  priceDate?: string | null;
}

interface ElectricUse {
  gridKwhPer100: number;
  blended: Decimal;
  ctx: PriceContext;
  confidence: Confidence;
}

const LABELS = {
  consumption: { ar: 'الاستهلاك', en: 'Consumption' },
  consumptionBasis: { ar: 'أساس الاستهلاك', en: 'Consumption basis' },
  gridConsumption: { ar: 'الاستهلاك من الشبكة', en: 'Grid consumption' },
  mainPrice: { ar: 'سعر الكهرباء الأساسي', en: 'Main electricity price' },
  publicPrice: { ar: 'سعر الشحن العام', en: 'Public charging price' },
  publicShare: { ar: 'نسبة الشحن العام', en: 'Public charging share' },
  blendedPrice: { ar: 'متوسط سعر الكيلوواط ساعة', en: 'Blended price per kWh' },
  costPer100: { ar: 'تكلفة كل 100 كم', en: 'Cost per 100 km' },
  kmPerMonth: { ar: 'المسافة الشهرية', en: 'Distance per month' },
  kmPerDay: { ar: 'المسافة اليومية', en: 'Distance per day' },
  monthlyKwh: { ar: 'طاقة الشبكة شهريًا', en: 'Grid energy per month' },
  monthlyEnergyCost: { ar: 'تكلفة الطاقة شهريًا', en: 'Energy cost per month' },
  fixedFees: { ar: 'رسوم شهرية ثابتة', en: 'Fixed monthly fees' },
  monthlyTotal: { ar: 'الإجمالي الشهري', en: 'Monthly total' },
  yearly: { ar: 'التكلفة السنوية', en: 'Cost per year' },
  fuelConsumption: { ar: 'استهلاك الوقود', en: 'Fuel consumption' },
  fuelPrice: { ar: 'سعر لتر الوقود', en: 'Fuel price per litre' },
  fuelPer100: { ar: 'تكلفة الوقود لكل 100 كم', en: 'Fuel cost per 100 km' },
  saving: { ar: 'الفرق لكل 100 كم', en: 'Difference per 100 km' },
} as const;

/** Reads consumption + electricity prices (shared by several calculators). */
export function readElectricUse(p: Problems, input: ElectricUseInput) {
  const kwh100 = num(p, 'consumptionKwhPer100km', input.consumptionKwhPer100km, {
    positive: true,
    max: 200,
  });
  const whKm = num(p, 'consumptionWhPerKm', input.consumptionWhPerKm, {
    positive: true,
    max: 2000,
  });
  if (kwh100 !== undefined && whKm !== undefined) {
    p.add('consumptionWhPerKm', 'oneOf', {
      ar: 'أدخل الاستهلاك بوحدة واحدة فقط.',
      en: 'Enter the consumption in one unit only.',
    });
  }
  const missingConsumption =
    input.consumptionKwhPer100km == null && input.consumptionWhPerKm == null;
  if (missingConsumption) {
    p.add('consumptionKwhPer100km', 'required', {
      ar: 'استهلاك السيارة مطلوب (كيلوواط ساعة لكل 100 كم).',
      en: 'The car consumption is required (kWh per 100 km).',
    });
  }
  const basis = input.consumptionBasis ?? 'grid';
  if (!['grid', 'battery'].includes(basis)) {
    p.add('consumptionBasis', 'isIn', {
      ar: 'القيمة: grid أو battery.',
      en: 'Use grid or battery.',
    });
  }
  const eff = readEfficiency(p, input.efficiency);
  const ctx = readPriceContext(p, input);
  const main = readPrice(p, 'electricityPricePerKwh', input.electricityPricePerKwh, true);
  const pub = readPrice(p, 'publicPricePerKwh', input.publicPricePerKwh);
  const share = num(p, 'publicSharePercent', input.publicSharePercent, { min: 0, max: 100 });
  if (share !== undefined && share > 0 && pub === undefined && !p.has('publicPricePerKwh')) {
    p.add('publicPricePerKwh', 'required', {
      ar: 'أدخل سعر الشحن العام مع نسبته.',
      en: 'Enter the public charging price together with its share.',
    });
  }
  if (pub !== undefined && share === undefined && !p.has('publicSharePercent')) {
    p.add('publicSharePercent', 'required', {
      ar: 'أدخل نسبة الشحن العام.',
      en: 'Enter the share of public charging.',
    });
  }
  return { kwh100, whKm, basis, eff, ctx, main, pub, share };
}

export function traceElectricUse(
  trace: Trace,
  r: ReturnType<typeof readElectricUse>,
  prov?: ProvenanceMap,
): ElectricUse {
  const ctx = r.ctx!;
  const consumption = r.kwh100 ?? r.whKm! / 10;
  const c = originOf(prov, 'consumptionKwhPer100km');
  trace.assume(
    'consumptionKwhPer100km',
    LABELS.consumption,
    round(consumption, 2),
    'kWh/100km',
    c.origin,
    c.note,
  );
  trace.assume(
    'consumptionBasis',
    LABELS.consumptionBasis,
    r.basis,
    null,
    prov?.consumptionBasis?.origin ??
      (r.basis === 'grid' && prov?.consumptionKwhPer100km ? c.origin : 'user'),
  );
  let confidence: Confidence = 'high';
  let grid = consumption;
  if (r.basis === 'battery') {
    const eff = useEfficiency(trace, r.eff, prov);
    if (eff.defaulted) confidence = 'medium';
    grid = consumption / eff.value;
    trace.step(
      'gridKwhPer100km',
      LABELS.gridConsumption,
      `${round(consumption, 2)} ÷ ${eff.value} = ${round(grid, 2)} kWh/100km`,
      round(grid, 2),
      'kWh/100km',
    );
  } else if (r.eff !== undefined) {
    trace.warn('EFFICIENCY_NOT_APPLIED', {
      ar: 'لم تُطبَّق الكفاءة لأن الاستهلاك مقيس من الشبكة (الفاقد محسوب فيه بالفعل).',
      en: 'Efficiency was not applied: the consumption is grid-side (losses already included).',
    });
  }
  if (c.origin === 'catalog') confidence = confidence === 'high' ? 'medium' : confidence;

  tracePriceContext(trace, ctx, prov);
  tracePrice(trace, 'electricityPricePerKwh', LABELS.mainPrice, r.main!, 'kWh', ctx.currency, prov);
  let blended = r.main!;
  if (r.share !== undefined && r.pub !== undefined) {
    tracePrice(trace, 'publicPricePerKwh', LABELS.publicPrice, r.pub, 'kWh', ctx.currency, prov);
    trace.assume('publicSharePercent', LABELS.publicShare, r.share, '%', 'user');
    const s = dec(r.share).div(100);
    blended = r.main!.times(dec(1).minus(s)).plus(r.pub.times(s));
    trace.step(
      'blendedPricePerKwh',
      LABELS.blendedPrice,
      `${rate(r.main!, ctx.currency).amount} × ${round(1 - r.share / 100, 4)} + ${rate(r.pub, ctx.currency).amount} × ${round(r.share / 100, 4)} = ${rate(blended, ctx.currency).amount}`,
      rate(blended, ctx.currency).amount,
      `${ctx.currency}/kWh`,
    );
  }
  return { gridKwhPer100: grid, blended, ctx, confidence };
}

function evCostPer100(trace: Trace, u: ElectricUse): Decimal {
  const v = dec(u.gridKwhPer100).times(u.blended);
  trace.step(
    'costPer100km',
    LABELS.costPer100,
    `${round(u.gridKwhPer100, 2)} kWh × ${rate(u.blended, u.ctx.currency).amount} ${u.ctx.currency} = ${money(v, u.ctx.currency).amount} ${u.ctx.currency}`,
    money(v, u.ctx.currency).amount,
    u.ctx.currency,
  );
  return v;
}

// ---- cost per 100 km ------------------------------------------------------------------

export interface CostPer100Result {
  gridKwhPer100km: number;
  pricePerKwh: Money;
  costPer100km: Money;
  costPerKm: Money;
  priceDate: string | null;
}

export function costPer100km(
  input: ElectricUseInput,
  lang: CalcLang = 'en',
  prov?: ProvenanceMap,
): CalcOutput<CostPer100Result> {
  const p = new Problems();
  const trace = new Trace(lang);
  const r = readElectricUse(p, input);
  p.throwIfAny();
  const u = traceElectricUse(trace, r, prov);
  const per100 = evCostPer100(trace, u);
  const cur = u.ctx.currency;
  return trace.output(
    'cost-per-100km',
    {
      gridKwhPer100km: round(u.gridKwhPer100, 2),
      pricePerKwh: rate(u.blended, cur),
      costPer100km: money(per100, cur),
      costPerKm: rate(per100.div(100), cur),
      priceDate: u.ctx.priceDate,
    },
    {
      ar: 'تكلفة كل 100 كم = استهلاك الشبكة (كيلوواط ساعة/100 كم) × سعر الكيلوواط ساعة.',
      en: 'Cost per 100 km = grid consumption (kWh/100 km) × price per kWh.',
    },
    u.confidence,
    { consumption: 'kWh/100km', money: cur },
  );
}

// ---- monthly cost ---------------------------------------------------------------------

export interface MonthlyInput extends ElectricUseInput {
  kmPerMonth?: number | null;
  kmPerDay?: number | null;
  fixedMonthlyFees?: number | string | null;
}

export interface MonthlyResult {
  kmPerMonth: number;
  gridKwhPerMonth: number;
  energyCostPerMonth: Money;
  fixedMonthlyFees: Money | null;
  totalPerMonth: Money;
  totalPerYear: Money;
  costPer100km: Money;
  priceDate: string | null;
}

export function readDistance(p: Problems, input: { kmPerMonth?: unknown; kmPerDay?: unknown }) {
  const month = num(p, 'kmPerMonth', input.kmPerMonth, { positive: true, max: 100_000 });
  const day = num(p, 'kmPerDay', input.kmPerDay, { positive: true, max: 5_000 });
  if (month !== undefined && day !== undefined) {
    p.add('kmPerDay', 'oneOf', {
      ar: 'أدخل المسافة الشهرية أو اليومية فقط.',
      en: 'Enter the monthly or the daily distance, not both.',
    });
  }
  return { month, day };
}

export function monthlyCost(
  input: MonthlyInput,
  lang: CalcLang = 'en',
  prov?: ProvenanceMap,
): CalcOutput<MonthlyResult> {
  const p = new Problems();
  const trace = new Trace(lang);
  const r = readElectricUse(p, input);
  const d = readDistance(p, input);
  if (input.kmPerMonth == null && input.kmPerDay == null) {
    p.add('kmPerMonth', 'required', {
      ar: 'أدخل المسافة الشهرية أو اليومية.',
      en: 'Enter the distance per month or per day.',
    });
  }
  const fees = readPrice(p, 'fixedMonthlyFees', input.fixedMonthlyFees);
  p.throwIfAny();
  const u = traceElectricUse(trace, r, prov);
  const cur = u.ctx.currency;
  let km: number;
  if (d.month !== undefined) {
    km = d.month;
    trace.assume('kmPerMonth', LABELS.kmPerMonth, km, 'km', 'user');
  } else {
    trace.assume('kmPerDay', LABELS.kmPerDay, d.day!, 'km', 'user');
    km = d.day! * DAYS_PER_MONTH;
    trace.step(
      'kmPerMonth',
      LABELS.kmPerMonth,
      `${d.day} km × ${DAYS_PER_MONTH} = ${round(km, 1)} km`,
      round(km, 1),
      'km',
    );
  }
  const per100 = evCostPer100(trace, u);
  const kwh = (km * u.gridKwhPer100) / 100;
  trace.step(
    'gridKwhPerMonth',
    LABELS.monthlyKwh,
    `${round(km, 1)} km × ${round(u.gridKwhPer100, 2)} ÷ 100 = ${round(kwh, 1)} kWh`,
    round(kwh, 1),
    'kWh',
  );
  const energy = dec(kwh).times(u.blended);
  trace.step(
    'energyCostPerMonth',
    LABELS.monthlyEnergyCost,
    `${round(kwh, 2)} kWh × ${rate(u.blended, cur).amount} = ${money(energy, cur).amount} ${cur}`,
    money(energy, cur).amount,
    cur,
  );
  let total = energy;
  if (fees !== undefined) {
    trace.assume('fixedMonthlyFees', LABELS.fixedFees, money(fees, cur).amount, cur, 'user');
    total = total.plus(fees);
  }
  trace.step(
    'totalPerMonth',
    LABELS.monthlyTotal,
    `${money(total, cur).amount} ${cur}`,
    money(total, cur).amount,
    cur,
  );
  trace.step(
    'totalPerYear',
    LABELS.yearly,
    `${money(total, cur).amount} × 12 = ${money(total.times(12), cur).amount} ${cur}`,
    money(total.times(12), cur).amount,
    cur,
  );
  return trace.output(
    'monthly-cost',
    {
      kmPerMonth: round(km, 1),
      gridKwhPerMonth: round(kwh, 1),
      energyCostPerMonth: money(energy, cur),
      fixedMonthlyFees: fees === undefined ? null : money(fees, cur),
      totalPerMonth: money(total, cur),
      totalPerYear: money(total.times(12), cur),
      costPer100km: money(per100, cur),
      priceDate: u.ctx.priceDate,
    },
    {
      ar: 'الطاقة الشهرية = المسافة الشهرية × الاستهلاك ÷ 100؛ التكلفة = الطاقة × سعر الكيلوواط ساعة (+ رسوم ثابتة إن وُجدت).',
      en: 'Monthly energy = monthly distance × consumption ÷ 100; cost = energy × price per kWh (+ fixed fees if entered).',
    },
    u.confidence,
    { distance: 'km', energy: 'kWh', money: cur },
  );
}

// ---- EV vs fuel -----------------------------------------------------------------------

export interface VsFuelInput extends ElectricUseInput {
  fuelConsumptionLPer100km?: number | null;
  fuelPricePerLiter?: number | string | null;
  kmPerMonth?: number | null;
  kmPerDay?: number | null;
}

export interface VsFuelResult {
  evCostPer100km: Money;
  fuelCostPer100km: Money;
  /** fuel − EV (negative = the EV costs more). */
  differencePer100km: Money;
  /** Difference as % of the fuel cost; null when the fuel cost is 0. */
  savingPercent: number | null;
  monthly: { km: number; ev: Money; fuel: Money; difference: Money } | null;
  yearlyDifference: Money | null;
  priceDate: string | null;
}

export function vsFuel(
  input: VsFuelInput,
  lang: CalcLang = 'en',
  prov?: ProvenanceMap,
): CalcOutput<VsFuelResult> {
  const p = new Problems();
  const trace = new Trace(lang);
  const r = readElectricUse(p, input);
  const lPer100 = num(p, 'fuelConsumptionLPer100km', input.fuelConsumptionLPer100km, {
    required: true,
    positive: true,
    max: 100,
  });
  const fuelPrice = readPrice(p, 'fuelPricePerLiter', input.fuelPricePerLiter, true);
  const d = readDistance(p, input);
  p.throwIfAny();
  const u = traceElectricUse(trace, r, prov);
  const cur = u.ctx.currency;
  const ev = evCostPer100(trace, u);
  trace.assume(
    'fuelConsumptionLPer100km',
    LABELS.fuelConsumption,
    lPer100!,
    'L/100km',
    originOf(prov, 'fuelConsumptionLPer100km').origin,
    originOf(prov, 'fuelConsumptionLPer100km').note,
  );
  tracePrice(trace, 'fuelPricePerLiter', LABELS.fuelPrice, fuelPrice!, 'L', cur, prov);
  const fuel = dec(lPer100!).times(fuelPrice!);
  trace.step(
    'fuelCostPer100km',
    LABELS.fuelPer100,
    `${lPer100} L × ${rate(fuelPrice!, cur).amount} ${cur} = ${money(fuel, cur).amount} ${cur}`,
    money(fuel, cur).amount,
    cur,
  );
  const diff = fuel.minus(ev);
  trace.step(
    'differencePer100km',
    LABELS.saving,
    `${money(fuel, cur).amount} − ${money(ev, cur).amount} = ${money(diff, cur).amount} ${cur}`,
    money(diff, cur).amount,
    cur,
  );
  const savingPercent = fuel.isZero() ? null : round(diff.div(fuel).times(100).toNumber(), 1);

  let monthly: VsFuelResult['monthly'] = null;
  let yearly: Money | null = null;
  const km = d.month ?? (d.day !== undefined ? d.day * DAYS_PER_MONTH : undefined);
  if (km !== undefined) {
    trace.assume('kmPerMonth', LABELS.kmPerMonth, round(km, 1), 'km', 'user');
    const f = dec(km).div(100);
    monthly = {
      km: round(km, 1),
      ev: money(ev.times(f), cur),
      fuel: money(fuel.times(f), cur),
      difference: money(diff.times(f), cur),
    };
    yearly = money(diff.times(f).times(12), cur);
  }
  trace.warn('ENERGY_ONLY', {
    ar: 'المقارنة تشمل تكلفة الطاقة فقط، وليس الصيانة أو التأمين أو الإهلاك.',
    en: 'This compares energy cost only, not maintenance, insurance or depreciation.',
  });
  return trace.output(
    'vs-fuel',
    {
      evCostPer100km: money(ev, cur),
      fuelCostPer100km: money(fuel, cur),
      differencePer100km: money(diff, cur),
      savingPercent,
      monthly,
      yearlyDifference: yearly,
      priceDate: u.ctx.priceDate,
    },
    {
      ar: 'تكلفة الكهرباء لكل 100 كم = الاستهلاك × سعر الكيلوواط ساعة؛ تكلفة الوقود لكل 100 كم = لتر/100 كم × سعر اللتر؛ الفرق = الوقود − الكهرباء.',
      en: 'EV cost per 100 km = consumption × price per kWh; fuel cost per 100 km = L/100 km × price per litre; difference = fuel − EV.',
    },
    u.confidence,
    { consumption: 'kWh/100km', fuel: 'L/100km', money: cur },
  );
}
