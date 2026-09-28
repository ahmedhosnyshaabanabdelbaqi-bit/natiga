/// Running costs, port of `engine/running-cost.ts`: cost per 100 km,
/// monthly cost, EV vs fuel. Energy cost only — kept apart from the total
/// cost of ownership (tco.dart).
///
///   grid consumption  = consumption (basis "grid") | consumption ÷ efficiency (basis "battery")
///   blended price     = main × (1 − public share) + public × public share
///   cost per 100 km   = grid kWh/100 km × blended price
///   monthly energy    = km per month × grid kWh/100 km ÷ 100
///   fuel per 100 km   = L/100 km × price per litre
library;

import 'core.dart';
import 'energy.dart';
import 'prices.dart';

const double daysPerMonth = 30.4375;

abstract final class _L {
  static const consumption = Bi('الاستهلاك', 'Consumption');
  static const consumptionBasis = Bi('أساس الاستهلاك', 'Consumption basis');
  static const gridConsumption = Bi('الاستهلاك من الشبكة', 'Grid consumption');
  static const mainPrice = Bi('سعر الكهرباء الأساسي', 'Main electricity price');
  static const publicPrice = Bi('سعر الشحن العام', 'Public charging price');
  static const publicShare = Bi('نسبة الشحن العام', 'Public charging share');
  static const blendedPrice = Bi('متوسط سعر الكيلوواط ساعة', 'Blended price per kWh');
  static const costPer100 = Bi('تكلفة كل 100 كم', 'Cost per 100 km');
  static const kmPerMonth = Bi('المسافة الشهرية', 'Distance per month');
  static const kmPerDay = Bi('المسافة اليومية', 'Distance per day');
  static const monthlyKwh = Bi('طاقة الشبكة شهريًا', 'Grid energy per month');
  static const monthlyEnergyCost = Bi('تكلفة الطاقة شهريًا', 'Energy cost per month');
  static const fixedFees = Bi('رسوم شهرية ثابتة', 'Fixed monthly fees');
  static const monthlyTotal = Bi('الإجمالي الشهري', 'Monthly total');
  static const yearly = Bi('التكلفة السنوية', 'Cost per year');
  static const fuelConsumption = Bi('استهلاك الوقود', 'Fuel consumption');
  static const fuelPrice = Bi('سعر لتر الوقود', 'Fuel price per litre');
  static const fuelPer100 = Bi('تكلفة الوقود لكل 100 كم', 'Fuel cost per 100 km');
  static const saving = Bi('الفرق لكل 100 كم', 'Difference per 100 km');
}

/// Validated consumption + electricity prices.
class ElectricUseInput {
  const ElectricUseInput(this.kwh100, this.whKm, this.basis, this.eff, this.ctx, this.main, this.pub, this.share);

  final num? kwh100;
  final num? whKm;
  final String basis;
  final num? eff;
  final PriceContext? ctx;
  final Dec? main;
  final Dec? pub;
  final num? share;
}

class ElectricUse {
  const ElectricUse(this.gridKwhPer100, this.blended, this.ctx, this.confidence);

  final double gridKwhPer100;
  final Dec blended;
  final PriceContext ctx;
  final Confidence confidence;
}

/// Reads consumption + electricity prices (shared by several calculators).
ElectricUseInput readElectricUse(Problems p, Map<String, Object?> input) {
  final kwh100 = readNum(p, 'consumptionKwhPer100km', input['consumptionKwhPer100km'], const NumRule(positive: true, max: 200));
  final whKm = readNum(p, 'consumptionWhPerKm', input['consumptionWhPerKm'], const NumRule(positive: true, max: 2000));
  if (kwh100 != null && whKm != null) {
    p.add('consumptionWhPerKm', 'oneOf', const Bi('أدخل الاستهلاك بوحدة واحدة فقط.', 'Enter the consumption in one unit only.'));
  }
  final missingConsumption = input['consumptionKwhPer100km'] == null && input['consumptionWhPerKm'] == null;
  if (missingConsumption) {
    p.add(
      'consumptionKwhPer100km',
      'required',
      const Bi('استهلاك السيارة مطلوب (كيلوواط ساعة لكل 100 كم).', 'The car consumption is required (kWh per 100 km).'),
    );
  }
  final basis = (input['consumptionBasis'] ?? 'grid').toString();
  if (basis != 'grid' && basis != 'battery') {
    p.add('consumptionBasis', 'isIn', const Bi('القيمة: grid أو battery.', 'Use grid or battery.'));
  }
  final eff = readEfficiency(p, input['efficiency']);
  final ctx = readPriceContext(p, input);
  final main = readPrice(p, 'electricityPricePerKwh', input['electricityPricePerKwh'], required: true);
  final pub = readPrice(p, 'publicPricePerKwh', input['publicPricePerKwh']);
  final share = readNum(p, 'publicSharePercent', input['publicSharePercent'], const NumRule(min: 0, max: 100));
  if (share != null && share > 0 && pub == null && !p.has('publicPricePerKwh')) {
    p.add('publicPricePerKwh', 'required', const Bi('أدخل سعر الشحن العام مع نسبته.', 'Enter the public charging price together with its share.'));
  }
  if (pub != null && share == null && !p.has('publicSharePercent')) {
    p.add('publicSharePercent', 'required', const Bi('أدخل نسبة الشحن العام.', 'Enter the share of public charging.'));
  }
  return ElectricUseInput(kwh100, whKm, basis, eff, ctx, main, pub, share);
}

ElectricUse traceElectricUse(Trace trace, ElectricUseInput r, [ProvenanceMap? prov]) {
  final ctx = r.ctx!;
  final double consumption = r.kwh100?.toDouble() ?? r.whKm! / 10;
  final c = originOf(prov, 'consumptionKwhPer100km');
  trace.assume('consumptionKwhPer100km', _L.consumption, round(consumption, 2), 'kWh/100km', c.origin, c.note);
  trace.assume(
    'consumptionBasis',
    _L.consumptionBasis,
    r.basis,
    null,
    prov?['consumptionBasis']?.origin ??
        (r.basis == 'grid' && prov?['consumptionKwhPer100km'] != null ? c.origin : 'user'),
  );
  var confidence = 'high';
  var grid = consumption;
  if (r.basis == 'battery') {
    final eff = useEfficiency(trace, r.eff, prov);
    if (eff.defaulted) confidence = 'medium';
    grid = consumption / eff.value;
    trace.step(
      'gridKwhPer100km',
      _L.gridConsumption,
      '${jsStr(round(consumption, 2))} ÷ ${jsStr(eff.value)} = ${jsStr(round(grid, 2))} kWh/100km',
      round(grid, 2),
      'kWh/100km',
    );
  } else if (r.eff != null) {
    trace.warn(
      'EFFICIENCY_NOT_APPLIED',
      const Bi(
        'لم تُطبَّق الكفاءة لأن الاستهلاك مقيس من الشبكة (الفاقد محسوب فيه بالفعل).',
        'Efficiency was not applied: the consumption is grid-side (losses already included).',
      ),
    );
  }
  if (c.origin == 'catalog') confidence = confidence == 'high' ? 'medium' : confidence;

  tracePriceContext(trace, ctx, prov);
  tracePrice(trace, 'electricityPricePerKwh', _L.mainPrice, r.main!, 'kWh', ctx.currency, prov);
  var blended = r.main!;
  if (r.share != null && r.pub != null) {
    tracePrice(trace, 'publicPricePerKwh', _L.publicPrice, r.pub!, 'kWh', ctx.currency, prov);
    trace.assume('publicSharePercent', _L.publicShare, r.share, '%', 'user');
    final s = dec(r.share!).div(100);
    blended = r.main!.times(dec(1).minus(s)).plus(r.pub!.times(s));
    trace.step(
      'blendedPricePerKwh',
      _L.blendedPrice,
      '${rate(r.main!, ctx.currency).amount} × ${jsStr(round(1 - r.share! / 100, 4))} + ${rate(r.pub!, ctx.currency).amount} × ${jsStr(round(r.share! / 100, 4))} = ${rate(blended, ctx.currency).amount}',
      rate(blended, ctx.currency).amount,
      '${ctx.currency}/kWh',
    );
  }
  return ElectricUse(grid, blended, ctx, confidence);
}

Dec _evCostPer100(Trace trace, ElectricUse u) {
  final v = dec(u.gridKwhPer100).times(u.blended);
  final cur = u.ctx.currency;
  trace.step(
    'costPer100km',
    _L.costPer100,
    '${jsStr(round(u.gridKwhPer100, 2))} kWh × ${rate(u.blended, cur).amount} $cur = ${money(v, cur).amount} $cur',
    money(v, cur).amount,
    cur,
  );
  return v;
}

// ---- cost per 100 km -------------------------------------------------------------------

/// [input]: consumption (`consumptionKwhPer100km` | `consumptionWhPerKm`,
/// `consumptionBasis`, `efficiency`) + `electricityPricePerKwh`,
/// `publicPricePerKwh` + `publicSharePercent`, `currency`, `priceDate`.
CalcOutput costPer100km(Map<String, Object?> input, {CalcLang lang = 'en', ProvenanceMap? prov}) {
  final p = Problems();
  final trace = Trace(lang);
  final r = readElectricUse(p, input);
  p.throwIfAny();
  final u = traceElectricUse(trace, r, prov);
  final per100 = _evCostPer100(trace, u);
  final cur = u.ctx.currency;
  return trace.output(
    'cost-per-100km',
    {
      'gridKwhPer100km': round(u.gridKwhPer100, 2),
      'pricePerKwh': rate(u.blended, cur),
      'costPer100km': money(per100, cur),
      'costPerKm': rate(per100.div(100), cur),
      'priceDate': u.ctx.priceDate,
    },
    const Bi(
      'تكلفة كل 100 كم = استهلاك الشبكة (كيلوواط ساعة/100 كم) × سعر الكيلوواط ساعة.',
      'Cost per 100 km = grid consumption (kWh/100 km) × price per kWh.',
    ),
    u.confidence,
    {'consumption': 'kWh/100km', 'money': cur},
  );
}

// ---- monthly cost ----------------------------------------------------------------------

({num? month, num? day}) readDistance(Problems p, Map<String, Object?> input) {
  final month = readNum(p, 'kmPerMonth', input['kmPerMonth'], const NumRule(positive: true, max: 100000));
  final day = readNum(p, 'kmPerDay', input['kmPerDay'], const NumRule(positive: true, max: 5000));
  if (month != null && day != null) {
    p.add('kmPerDay', 'oneOf', const Bi('أدخل المسافة الشهرية أو اليومية فقط.', 'Enter the monthly or the daily distance, not both.'));
  }
  return (month: month, day: day);
}

/// [input]: as [costPer100km] + `kmPerMonth` | `kmPerDay`, `fixedMonthlyFees`.
CalcOutput monthlyCost(Map<String, Object?> input, {CalcLang lang = 'en', ProvenanceMap? prov}) {
  final p = Problems();
  final trace = Trace(lang);
  final r = readElectricUse(p, input);
  final d = readDistance(p, input);
  if (input['kmPerMonth'] == null && input['kmPerDay'] == null) {
    p.add('kmPerMonth', 'required', const Bi('أدخل المسافة الشهرية أو اليومية.', 'Enter the distance per month or per day.'));
  }
  final fees = readPrice(p, 'fixedMonthlyFees', input['fixedMonthlyFees']);
  p.throwIfAny();
  final u = traceElectricUse(trace, r, prov);
  final cur = u.ctx.currency;
  double km;
  if (d.month != null) {
    km = d.month!.toDouble();
    trace.assume('kmPerMonth', _L.kmPerMonth, d.month, 'km', 'user');
  } else {
    trace.assume('kmPerDay', _L.kmPerDay, d.day, 'km', 'user');
    km = d.day! * daysPerMonth;
    trace.step('kmPerMonth', _L.kmPerMonth, '${jsStr(d.day)} km × ${jsStr(daysPerMonth)} = ${jsStr(round(km, 1))} km', round(km, 1), 'km');
  }
  final per100 = _evCostPer100(trace, u);
  final kwh = (km * u.gridKwhPer100) / 100;
  trace.step(
    'gridKwhPerMonth',
    _L.monthlyKwh,
    '${jsStr(round(km, 1))} km × ${jsStr(round(u.gridKwhPer100, 2))} ÷ 100 = ${jsStr(round(kwh, 1))} kWh',
    round(kwh, 1),
    'kWh',
  );
  final energy = dec(kwh).times(u.blended);
  trace.step(
    'energyCostPerMonth',
    _L.monthlyEnergyCost,
    '${jsStr(round(kwh, 2))} kWh × ${rate(u.blended, cur).amount} = ${money(energy, cur).amount} $cur',
    money(energy, cur).amount,
    cur,
  );
  var total = energy;
  if (fees != null) {
    trace.assume('fixedMonthlyFees', _L.fixedFees, money(fees, cur).amount, cur, 'user');
    total = total.plus(fees);
  }
  trace.step('totalPerMonth', _L.monthlyTotal, '${money(total, cur).amount} $cur', money(total, cur).amount, cur);
  trace.step(
    'totalPerYear',
    _L.yearly,
    '${money(total, cur).amount} × 12 = ${money(total.times(12), cur).amount} $cur',
    money(total.times(12), cur).amount,
    cur,
  );
  return trace.output(
    'monthly-cost',
    {
      'kmPerMonth': round(km, 1),
      'gridKwhPerMonth': round(kwh, 1),
      'energyCostPerMonth': money(energy, cur),
      'fixedMonthlyFees': fees == null ? null : money(fees, cur),
      'totalPerMonth': money(total, cur),
      'totalPerYear': money(total.times(12), cur),
      'costPer100km': money(per100, cur),
      'priceDate': u.ctx.priceDate,
    },
    const Bi(
      'الطاقة الشهرية = المسافة الشهرية × الاستهلاك ÷ 100؛ التكلفة = الطاقة × سعر الكيلوواط ساعة (+ رسوم ثابتة إن وُجدت).',
      'Monthly energy = monthly distance × consumption ÷ 100; cost = energy × price per kWh (+ fixed fees if entered).',
    ),
    u.confidence,
    {'distance': 'km', 'energy': 'kWh', 'money': cur},
  );
}

// ---- EV vs fuel ------------------------------------------------------------------------

/// [input]: as [costPer100km] + `fuelConsumptionLPer100km`,
/// `fuelPricePerLiter`, optional `kmPerMonth` | `kmPerDay`.
CalcOutput vsFuel(Map<String, Object?> input, {CalcLang lang = 'en', ProvenanceMap? prov}) {
  final p = Problems();
  final trace = Trace(lang);
  final r = readElectricUse(p, input);
  final lPer100 = readNum(p, 'fuelConsumptionLPer100km', input['fuelConsumptionLPer100km'], const NumRule(required: true, positive: true, max: 100));
  final fuelPrice = readPrice(p, 'fuelPricePerLiter', input['fuelPricePerLiter'], required: true);
  final d = readDistance(p, input);
  p.throwIfAny();
  final u = traceElectricUse(trace, r, prov);
  final cur = u.ctx.currency;
  final ev = _evCostPer100(trace, u);
  trace.assume(
    'fuelConsumptionLPer100km',
    _L.fuelConsumption,
    lPer100,
    'L/100km',
    originOf(prov, 'fuelConsumptionLPer100km').origin,
    originOf(prov, 'fuelConsumptionLPer100km').note,
  );
  tracePrice(trace, 'fuelPricePerLiter', _L.fuelPrice, fuelPrice!, 'L', cur, prov);
  final fuel = dec(lPer100!).times(fuelPrice);
  trace.step(
    'fuelCostPer100km',
    _L.fuelPer100,
    '${jsStr(lPer100)} L × ${rate(fuelPrice, cur).amount} $cur = ${money(fuel, cur).amount} $cur',
    money(fuel, cur).amount,
    cur,
  );
  final diff = fuel.minus(ev);
  trace.step(
    'differencePer100km',
    _L.saving,
    '${money(fuel, cur).amount} − ${money(ev, cur).amount} = ${money(diff, cur).amount} $cur',
    money(diff, cur).amount,
    cur,
  );
  final savingPercent = fuel.isZero ? null : round(diff.div(fuel).times(100).toDouble(), 1);

  Map<String, Object?>? monthly;
  Money? yearly;
  final double? km = d.month?.toDouble() ?? (d.day != null ? d.day! * daysPerMonth : null);
  if (km != null) {
    trace.assume('kmPerMonth', _L.kmPerMonth, round(km, 1), 'km', 'user');
    final f = dec(km).div(100);
    monthly = {
      'km': round(km, 1),
      'ev': money(ev.times(f), cur),
      'fuel': money(fuel.times(f), cur),
      'difference': money(diff.times(f), cur),
    };
    yearly = money(diff.times(f).times(12), cur);
  }
  trace.warn(
    'ENERGY_ONLY',
    const Bi(
      'المقارنة تشمل تكلفة الطاقة فقط، وليس الصيانة أو التأمين أو الإهلاك.',
      'This compares energy cost only, not maintenance, insurance or depreciation.',
    ),
  );
  return trace.output(
    'vs-fuel',
    {
      'evCostPer100km': money(ev, cur),
      'fuelCostPer100km': money(fuel, cur),
      'differencePer100km': money(diff, cur),
      'savingPercent': savingPercent,
      'monthly': monthly,
      'yearlyDifference': yearly,
      'priceDate': u.ctx.priceDate,
    },
    const Bi(
      'تكلفة الكهرباء لكل 100 كم = الاستهلاك × سعر الكيلوواط ساعة؛ تكلفة الوقود لكل 100 كم = لتر/100 كم × سعر اللتر؛ الفرق = الوقود − الكهرباء.',
      'EV cost per 100 km = consumption × price per kWh; fuel cost per 100 km = L/100 km × price per litre; difference = fuel − EV.',
    ),
    u.confidence,
    {'consumption': 'kWh/100km', 'fuel': 'L/100km', 'money': cur},
  );
}
