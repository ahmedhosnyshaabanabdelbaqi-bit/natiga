/**
 * Total cost of ownership with the user's own assumptions (REQUIREMENTS §13).
 *
 *   total = purchase − incentives − residual value
 *         + energy cost (km per year × years × cost per km)
 *         + (insurance + maintenance + fees) per year × years
 *         + one-off costs (e.g. home charger installation)
 * Energy cost is reported separately from the other costs. Prices are held
 * constant over the period (no inflation, financing or discounting — stated
 * as assumptions). Components the user did not enter are listed in
 * `excluded` and are null, never 0. An optional fuel car is computed the
 * same way for comparison.
 */
import type { Money } from '../../../common/money/money';
import { Decimal } from '../../../common/money/money';
import {
  type CalcLang,
  type CalcOutput,
  dec,
  money,
  num,
  Problems,
  type ProvenanceMap,
  rate,
  Trace,
} from './core';
import { readElectricUse, traceElectricUse, type ElectricUseInput } from './running-cost';
import { readPrice } from './prices';

type Amount = number | string | null | undefined;

export interface OwnershipCostsInput {
  purchasePrice?: Amount;
  incentives?: Amount;
  residualValue?: Amount;
  insurancePerYear?: Amount;
  maintenancePerYear?: Amount;
  feesPerYear?: Amount;
  oneOffCosts?: Amount;
}

export interface TcoInput extends ElectricUseInput {
  years?: number | null;
  kmPerYear?: number | null;
  ev?: OwnershipCostsInput | null;
  fuelCar?:
    | (OwnershipCostsInput & {
        fuelConsumptionLPer100km?: number | null;
        fuelPricePerLiter?: Amount;
      })
    | null;
}

export interface TcoBreakdown {
  purchase: Money;
  incentives: Money | null;
  residualValue: Money | null;
  energy: Money;
  insurance: Money | null;
  maintenance: Money | null;
  fees: Money | null;
  oneOff: Money | null;
  /** Everything except energy. */
  nonEnergy: Money;
  total: Money;
  perKm: Money;
  perMonth: Money;
  /** Components not entered (not included in the total). */
  excluded: string[];
}

export interface TcoResult {
  years: number;
  kmPerYear: number;
  totalKm: number;
  ev: TcoBreakdown;
  fuelCar: TcoBreakdown | null;
  /** fuel car total − EV total (null without a fuel car). */
  difference: Money | null;
  priceDate: string | null;
}

const OPTIONAL = [
  'incentives',
  'residualValue',
  'insurancePerYear',
  'maintenancePerYear',
  'feesPerYear',
  'oneOffCosts',
] as const;

const LABELS = {
  years: { ar: 'مدة الملكية', en: 'Ownership period' },
  kmPerYear: { ar: 'المسافة السنوية', en: 'Distance per year' },
  constantPrices: { ar: 'الأسعار ثابتة طوال المدة', en: 'Prices constant over the period' },
  noFinancing: { ar: 'بدون تمويل أو خصم زمني', en: 'No financing or discounting' },
  evTotal: { ar: 'إجمالي تكلفة السيارة الكهربائية', en: 'EV total cost' },
  evEnergy: { ar: 'تكلفة طاقة السيارة الكهربائية', en: 'EV energy cost' },
  fuelTotal: { ar: 'إجمالي تكلفة سيارة الوقود', en: 'Fuel car total cost' },
  fuelEnergy: { ar: 'تكلفة وقود سيارة الوقود', en: 'Fuel car fuel cost' },
  fuelConsumption: { ar: 'استهلاك الوقود', en: 'Fuel consumption' },
  fuelPrice: { ar: 'سعر لتر الوقود', en: 'Fuel price per litre' },
} as const;

function readCosts(p: Problems, prefix: string, raw: OwnershipCostsInput | null | undefined) {
  const src = raw ?? {};
  const purchase = readPrice(p, `${prefix}.purchasePrice`, src.purchasePrice, true);
  const values: Partial<Record<(typeof OPTIONAL)[number], Decimal>> = {};
  for (const key of OPTIONAL) {
    const v = readPrice(p, `${prefix}.${key}`, src[key]);
    if (v !== undefined) values[key] = v;
  }
  return { purchase, values };
}

function breakdown(
  trace: Trace,
  costs: ReturnType<typeof readCosts>,
  energyTotal: Decimal,
  years: number,
  totalKm: number,
  cur: string,
  label: { total: { ar: string; en: string }; energy: { ar: string; en: string } },
  key: string,
): TcoBreakdown {
  const v = costs.values;
  const yearly = (d: Decimal | undefined) => (d === undefined ? undefined : d.times(years));
  const insurance = yearly(v.insurancePerYear);
  const maintenance = yearly(v.maintenancePerYear);
  const fees = yearly(v.feesPerYear);
  let nonEnergy = costs.purchase!;
  if (v.incentives) nonEnergy = nonEnergy.minus(v.incentives);
  if (v.residualValue) nonEnergy = nonEnergy.minus(v.residualValue);
  for (const d of [insurance, maintenance, fees, v.oneOffCosts])
    if (d) nonEnergy = nonEnergy.plus(d);
  const total = nonEnergy.plus(energyTotal);
  trace.step(
    `${key}.energy`,
    label.energy,
    `${money(energyTotal, cur).amount} ${cur}`,
    money(energyTotal, cur).amount,
    cur,
  );
  trace.step(
    `${key}.total`,
    label.total,
    `${money(costs.purchase!, cur).amount}${v.incentives ? ` − ${money(v.incentives, cur).amount}` : ''}${v.residualValue ? ` − ${money(v.residualValue, cur).amount}` : ''}${insurance ? ` + ${money(insurance, cur).amount}` : ''}${maintenance ? ` + ${money(maintenance, cur).amount}` : ''}${fees ? ` + ${money(fees, cur).amount}` : ''}${v.oneOffCosts ? ` + ${money(v.oneOffCosts, cur).amount}` : ''} + ${money(energyTotal, cur).amount} = ${money(total, cur).amount} ${cur}`,
    money(total, cur).amount,
    cur,
  );
  const m = (d: Decimal | undefined) => (d === undefined ? null : money(d, cur));
  return {
    purchase: money(costs.purchase!, cur),
    incentives: m(v.incentives),
    residualValue: m(v.residualValue),
    energy: money(energyTotal, cur),
    insurance: m(insurance),
    maintenance: m(maintenance),
    fees: m(fees),
    oneOff: m(v.oneOffCosts),
    nonEnergy: money(nonEnergy, cur),
    total: money(total, cur),
    perKm: rate(total.div(totalKm), cur),
    perMonth: money(total.div(years * 12), cur),
    excluded: OPTIONAL.filter((k) => v[k] === undefined),
  };
}

export function tco(
  input: TcoInput,
  lang: CalcLang = 'en',
  prov?: ProvenanceMap,
): CalcOutput<TcoResult> {
  const p = new Problems();
  const trace = new Trace(lang);
  const years = num(p, 'years', input.years, { required: true, positive: true, max: 30 });
  const kmPerYear = num(p, 'kmPerYear', input.kmPerYear, {
    required: true,
    positive: true,
    max: 1_000_000,
  });
  const r = readElectricUse(p, input);
  const evCosts = readCosts(p, 'ev', input.ev);
  let fuelCosts: ReturnType<typeof readCosts> | undefined;
  let lPer100: number | undefined;
  let fuelPrice: Decimal | undefined;
  if (input.fuelCar) {
    fuelCosts = readCosts(p, 'fuelCar', input.fuelCar);
    lPer100 = num(p, 'fuelCar.fuelConsumptionLPer100km', input.fuelCar.fuelConsumptionLPer100km, {
      required: true,
      positive: true,
      max: 100,
    });
    fuelPrice = readPrice(p, 'fuelCar.fuelPricePerLiter', input.fuelCar.fuelPricePerLiter, true);
  }
  p.throwIfAny();

  trace.assume('years', LABELS.years, years!, 'years', 'user');
  trace.assume('kmPerYear', LABELS.kmPerYear, kmPerYear!, 'km', 'user');
  trace.assume('constantPrices', LABELS.constantPrices, true, null, 'default');
  trace.assume('noFinancing', LABELS.noFinancing, true, null, 'default');
  const u = traceElectricUse(trace, r, prov);
  const cur = u.ctx.currency;
  const totalKm = years! * kmPerYear!;
  const evEnergy = dec(totalKm).div(100).times(u.gridKwhPer100).times(u.blended);
  const ev = breakdown(
    trace,
    evCosts,
    evEnergy,
    years!,
    totalKm,
    cur,
    { total: LABELS.evTotal, energy: LABELS.evEnergy },
    'ev',
  );

  let fuel: TcoBreakdown | null = null;
  if (fuelCosts) {
    trace.assume(
      'fuelCar.fuelConsumptionLPer100km',
      LABELS.fuelConsumption,
      lPer100!,
      'L/100km',
      'user',
    );
    trace.assume(
      'fuelCar.fuelPricePerLiter',
      LABELS.fuelPrice,
      rate(fuelPrice!, cur).amount,
      `${cur}/L`,
      prov?.['fuelCar.fuelPricePerLiter']?.origin ?? 'user',
      prov?.['fuelCar.fuelPricePerLiter']?.note,
    );
    const fuelEnergy = dec(totalKm).div(100).times(lPer100!).times(fuelPrice!);
    fuel = breakdown(
      trace,
      fuelCosts,
      fuelEnergy,
      years!,
      totalKm,
      cur,
      { total: LABELS.fuelTotal, energy: LABELS.fuelEnergy },
      'fuelCar',
    );
  }
  const excluded = new Set([...ev.excluded, ...(fuel?.excluded ?? [])]);
  if (excluded.size) {
    trace.warn('COMPONENTS_NOT_INCLUDED', {
      ar: `بنود لم تُدخل ولم تُحتسب: ${[...excluded].join('، ')}.`,
      en: `Items not entered and not included: ${[...excluded].join(', ')}.`,
    });
  }
  const difference = fuel
    ? money(new Decimal(fuel.total.amount).minus(ev.total.amount), cur)
    : null;
  return trace.output(
    'tco',
    {
      years: years!,
      kmPerYear: kmPerYear!,
      totalKm,
      ev,
      fuelCar: fuel,
      difference,
      priceDate: u.ctx.priceDate,
    },
    {
      ar: 'التكلفة الكلية = سعر الشراء − الحوافز − القيمة المتبقية + تكلفة الطاقة + (التأمين + الصيانة + الرسوم) × السنوات + التكاليف لمرة واحدة.',
      en: 'Total = purchase − incentives − residual value + energy cost + (insurance + maintenance + fees) × years + one-off costs.',
    },
    u.confidence === 'high' ? 'medium' : u.confidence,
    { distance: 'km', money: cur },
  );
}
