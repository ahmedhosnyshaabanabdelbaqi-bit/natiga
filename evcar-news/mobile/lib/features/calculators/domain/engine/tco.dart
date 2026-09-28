/// Total cost of ownership with the user's own assumptions, port of
/// `engine/tco.ts`.
///
///   total = purchase − incentives − residual value
///         + energy cost (km per year × years × cost per km)
///         + (insurance + maintenance + fees) per year × years
///         + one-off costs
/// Energy is reported separately; prices are constant over the period (no
/// inflation, financing or discounting — stated as assumptions). Components
/// not entered are listed in `excluded` and are null, never 0.
library;

import 'core.dart';
import 'prices.dart';
import 'running_cost.dart';

const _optional = ['incentives', 'residualValue', 'insurancePerYear', 'maintenancePerYear', 'feesPerYear', 'oneOffCosts'];

abstract final class _L {
  static const years = Bi('مدة الملكية', 'Ownership period');
  static const kmPerYear = Bi('المسافة السنوية', 'Distance per year');
  static const constantPrices = Bi('الأسعار ثابتة طوال المدة', 'Prices constant over the period');
  static const noFinancing = Bi('بدون تمويل أو خصم زمني', 'No financing or discounting');
  static const evTotal = Bi('إجمالي تكلفة السيارة الكهربائية', 'EV total cost');
  static const evEnergy = Bi('تكلفة طاقة السيارة الكهربائية', 'EV energy cost');
  static const fuelTotal = Bi('إجمالي تكلفة سيارة الوقود', 'Fuel car total cost');
  static const fuelEnergy = Bi('تكلفة وقود سيارة الوقود', 'Fuel car fuel cost');
  static const fuelConsumption = Bi('استهلاك الوقود', 'Fuel consumption');
  static const fuelPrice = Bi('سعر لتر الوقود', 'Fuel price per litre');
}

class _Costs {
  _Costs(this.purchase, this.values);

  final Dec? purchase;
  final Map<String, Dec> values;
}

_Costs _readCosts(Problems p, String prefix, Object? raw) {
  final src = raw is Map ? raw : const {};
  final purchase = readPrice(p, '$prefix.purchasePrice', src['purchasePrice'], required: true);
  final values = <String, Dec>{};
  for (final key in _optional) {
    final v = readPrice(p, '$prefix.$key', src[key]);
    if (v != null) values[key] = v;
  }
  return _Costs(purchase, values);
}

Map<String, Object?> _breakdown(
  Trace trace,
  _Costs costs,
  Dec energyTotal,
  num years,
  num totalKm,
  String cur,
  ({Bi total, Bi energy}) label,
  String key,
) {
  final v = costs.values;
  Dec? yearly(Dec? d) => d?.times(years);
  final insurance = yearly(v['insurancePerYear']);
  final maintenance = yearly(v['maintenancePerYear']);
  final fees = yearly(v['feesPerYear']);
  var nonEnergy = costs.purchase!;
  if (v['incentives'] != null) nonEnergy = nonEnergy.minus(v['incentives']!);
  if (v['residualValue'] != null) nonEnergy = nonEnergy.minus(v['residualValue']!);
  for (final d in [insurance, maintenance, fees, v['oneOffCosts']]) {
    if (d != null) nonEnergy = nonEnergy.plus(d);
  }
  final total = nonEnergy.plus(energyTotal);
  String m$(Dec d) => money(d, cur).amount;
  trace.step('$key.energy', label.energy, '${m$(energyTotal)} $cur', m$(energyTotal), cur);
  final expr = StringBuffer(m$(costs.purchase!));
  if (v['incentives'] != null) expr.write(' − ${m$(v['incentives']!)}');
  if (v['residualValue'] != null) expr.write(' − ${m$(v['residualValue']!)}');
  if (insurance != null) expr.write(' + ${m$(insurance)}');
  if (maintenance != null) expr.write(' + ${m$(maintenance)}');
  if (fees != null) expr.write(' + ${m$(fees)}');
  if (v['oneOffCosts'] != null) expr.write(' + ${m$(v['oneOffCosts']!)}');
  expr.write(' + ${m$(energyTotal)} = ${m$(total)} $cur');
  trace.step('$key.total', label.total, expr.toString(), m$(total), cur);
  Money? mm(Dec? d) => d == null ? null : money(d, cur);
  return {
    'purchase': money(costs.purchase!, cur),
    'incentives': mm(v['incentives']),
    'residualValue': mm(v['residualValue']),
    'energy': money(energyTotal, cur),
    'insurance': mm(insurance),
    'maintenance': mm(maintenance),
    'fees': mm(fees),
    'oneOff': mm(v['oneOffCosts']),
    'nonEnergy': money(nonEnergy, cur),
    'total': money(total, cur),
    'perKm': rate(total.div(totalKm), cur),
    'perMonth': money(total.div(years * 12), cur),
    'excluded': [for (final k in _optional) if (v[k] == null) k],
  };
}

/// [input]: electric use (as `costPer100km`) + `years`, `kmPerYear`,
/// `ev: {purchasePrice, incentives, residualValue, insurancePerYear,
/// maintenancePerYear, feesPerYear, oneOffCosts}`, optional `fuelCar: {same
/// + fuelConsumptionLPer100km, fuelPricePerLiter}`.
CalcOutput tco(Map<String, Object?> input, {CalcLang lang = 'en', ProvenanceMap? prov}) {
  final p = Problems();
  final trace = Trace(lang);
  final years = readNum(p, 'years', input['years'], const NumRule(required: true, positive: true, max: 30));
  final kmPerYear = readNum(p, 'kmPerYear', input['kmPerYear'], const NumRule(required: true, positive: true, max: 1000000));
  final r = readElectricUse(p, input);
  final evCosts = _readCosts(p, 'ev', input['ev']);
  _Costs? fuelCosts;
  num? lPer100;
  Dec? fuelPrice;
  final fuelCar = input['fuelCar'];
  if (fuelCar is Map) {
    fuelCosts = _readCosts(p, 'fuelCar', fuelCar);
    lPer100 = readNum(p, 'fuelCar.fuelConsumptionLPer100km', fuelCar['fuelConsumptionLPer100km'], const NumRule(required: true, positive: true, max: 100));
    fuelPrice = readPrice(p, 'fuelCar.fuelPricePerLiter', fuelCar['fuelPricePerLiter'], required: true);
  }
  p.throwIfAny();

  trace.assume('years', _L.years, years, 'years', 'user');
  trace.assume('kmPerYear', _L.kmPerYear, kmPerYear, 'km', 'user');
  trace.assume('constantPrices', _L.constantPrices, true, null, 'default');
  trace.assume('noFinancing', _L.noFinancing, true, null, 'default');
  final u = traceElectricUse(trace, r, prov);
  final cur = u.ctx.currency;
  final totalKm = years! * kmPerYear!;
  final evEnergy = dec(totalKm).div(100).times(u.gridKwhPer100).times(u.blended);
  final ev = _breakdown(trace, evCosts, evEnergy, years, totalKm, cur, (total: _L.evTotal, energy: _L.evEnergy), 'ev');

  Map<String, Object?>? fuel;
  if (fuelCosts != null) {
    trace.assume('fuelCar.fuelConsumptionLPer100km', _L.fuelConsumption, lPer100, 'L/100km', 'user');
    trace.assume(
      'fuelCar.fuelPricePerLiter',
      _L.fuelPrice,
      rate(fuelPrice!, cur).amount,
      '$cur/L',
      prov?['fuelCar.fuelPricePerLiter']?.origin ?? 'user',
      prov?['fuelCar.fuelPricePerLiter']?.note,
    );
    final fuelEnergy = dec(totalKm).div(100).times(lPer100!).times(fuelPrice);
    fuel = _breakdown(trace, fuelCosts, fuelEnergy, years, totalKm, cur, (total: _L.fuelTotal, energy: _L.fuelEnergy), 'fuelCar');
  }
  final excluded = <String>{...(ev['excluded']! as List<String>), ...?(fuel?['excluded'] as List<String>?)};
  if (excluded.isNotEmpty) {
    trace.warn(
      'COMPONENTS_NOT_INCLUDED',
      Bi('بنود لم تُدخل ولم تُحتسب: ${excluded.join('، ')}.', 'Items not entered and not included: ${excluded.join(', ')}.'),
    );
  }
  final difference = fuel != null
      ? money(Dec.parse((fuel['total']! as Money).amount).minus((ev['total']! as Money).amount), cur)
      : null;
  return trace.output(
    'tco',
    {
      'years': years,
      'kmPerYear': kmPerYear,
      'totalKm': totalKm,
      'ev': ev,
      'fuelCar': fuel,
      'difference': difference,
      'priceDate': u.ctx.priceDate,
    },
    const Bi(
      'التكلفة الكلية = سعر الشراء − الحوافز − القيمة المتبقية + تكلفة الطاقة + (التأمين + الصيانة + الرسوم) × السنوات + التكاليف لمرة واحدة.',
      'Total = purchase − incentives − residual value + energy cost + (insurance + maintenance + fees) × years + one-off costs.',
    ),
    u.confidence == 'high' ? 'medium' : u.confidence,
    {'distance': 'km', 'money': cur},
  );
}
