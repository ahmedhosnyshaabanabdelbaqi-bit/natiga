/// Charging session cost (home or public), port of `engine/charge-cost.ts`.
///
///   E_batt = usable × ΔSoC            (or the energy the user entered)
///   E_grid = E_batt ÷ efficiency      (skipped when the entered energy is grid-side)
///   energy cost   = E_grid × price per kWh
///   time cost     = charging minutes × price per minute (or per hour ÷ 60)
///   session fee   = flat, as entered
///   parking cost  = parking minutes × rate, or a flat fee
///   idle cost     = max(0, idle minutes − grace) × rate
///   total         = sum of the components that were entered
/// Components not entered are `null` ("not included"), never 0.
library;

import 'dart:math' as math;

import 'core.dart';
import 'energy.dart';
import 'prices.dart';

abstract final class _L {
  static const pricePerKwh = Bi('سعر الكيلوواط ساعة', 'Price per kWh');
  static const pricePerMinute = Bi('سعر الدقيقة', 'Price per minute');
  static const sessionFee = Bi('رسوم الجلسة', 'Session fee');
  static const parking = Bi('رسوم الوقوف', 'Parking fee');
  static const idle = Bi('رسوم الانتظار بعد الشحن', 'Idle fee');
  static const energyCost = Bi('تكلفة الطاقة', 'Energy cost');
  static const timeCost = Bi('تكلفة الوقت', 'Time cost');
  static const total = Bi('الإجمالي', 'Total');
  static const chargingMinutes = Bi('مدة الشحن', 'Charging duration');
  static const parkingMinutes = Bi('مدة الوقوف', 'Parking duration');
  static const idleMinutes = Bi('مدة الانتظار بعد اكتمال الشحن', 'Idle time after charging');
  static const idleGrace = Bi('مهلة الانتظار المجانية', 'Free idle grace period');
}

const _formula = Bi(
  'الطاقة المضافة = السعة القابلة للاستخدام × فرق نسبة الشحن؛ طاقة الشبكة = الطاقة المضافة ÷ الكفاءة؛ التكلفة = طاقة الشبكة × سعر الكيلوواط ساعة + رسوم الوقت والجلسة والوقوف والانتظار كما أُدخلت.',
  'Energy added = usable capacity × ΔSoC; grid energy = energy added ÷ efficiency; cost = grid energy × price per kWh + time, session, parking and idle fees as entered.',
);

/// [input] uses the request-body keys of `POST /calculators/charge-cost`
/// (`batteryUsableKwh`, `fromSocPercent`, `toSocPercent`, `energyKwh`,
/// `energyBasis`, `efficiency`, `currency`, `priceDate`, `tariff: {...}`,
/// `chargingMinutes`, `parkingMinutes`, `idleMinutes`).
CalcOutput chargeCost(Map<String, Object?> input, {CalcLang lang = 'en', ProvenanceMap? prov}) {
  final p = Problems();
  final trace = Trace(lang);

  // --- energy ---------------------------------------------------------------------------
  final hasDirect = input['energyKwh'] != null;
  final basisRaw = input['energyBasis'];
  final basis = (basisRaw ?? 'battery').toString();
  if (basisRaw != null && basisRaw != '' && basisRaw != 'battery' && basisRaw != 'grid') {
    p.add('energyBasis', 'isIn', const Bi('القيمة: battery أو grid.', 'Use battery or grid.'));
  }
  num? direct;
  SocWindow? window;
  if (hasDirect) {
    direct = readNum(p, 'energyKwh', input['energyKwh'], const NumRule(required: true, positive: true, max: 10000));
  } else {
    if (basisRaw == 'grid') {
      p.add('energyBasis', 'needsEnergyKwh', const Bi('أساس "grid" يُستخدم فقط مع energyKwh.', '"grid" basis only applies to energyKwh.'));
    }
    window = readSocWindow(p, input);
  }
  final efficiencyGiven = readEfficiency(p, input['efficiency']);

  // --- prices ---------------------------------------------------------------------------
  final ctx = readPriceContext(p, input);
  final tf = input['tariff'] is Map ? Map<String, Object?>.from(input['tariff']! as Map) : const <String, Object?>{};
  final perKwh = readPrice(p, 'tariff.energyPerKwh', tf['energyPerKwh']);
  final perMin = readPrice(p, 'tariff.timePerMinute', tf['timePerMinute']);
  final perHour = readPrice(p, 'tariff.timePerHour', tf['timePerHour']);
  final session = readPrice(p, 'tariff.sessionFee', tf['sessionFee']);
  final parkMin = readPrice(p, 'tariff.parkingPerMinute', tf['parkingPerMinute']);
  final parkHour = readPrice(p, 'tariff.parkingPerHour', tf['parkingPerHour']);
  final parkFlat = readPrice(p, 'tariff.parkingFlat', tf['parkingFlat']);
  final idleMin = readPrice(p, 'tariff.idlePerMinute', tf['idlePerMinute']);
  final idleHour = readPrice(p, 'tariff.idlePerHour', tf['idlePerHour']);
  final idleGrace = readNum(p, 'tariff.idleGraceMinutes', tf['idleGraceMinutes'], const NumRule(nonNegative: true, max: 10000));
  final chargingMinutes = readNum(p, 'chargingMinutes', input['chargingMinutes'], const NumRule(positive: true, max: 10000));
  final parkingMinutes = readNum(p, 'parkingMinutes', input['parkingMinutes'], const NumRule(nonNegative: true, max: 100000));
  final idleMinutes = readNum(p, 'idleMinutes', input['idleMinutes'], const NumRule(nonNegative: true, max: 100000));

  void oneOf(String field, Object? a, Object? b) {
    if (a != null && b != null) {
      p.add(field, 'oneOf', const Bi('أدخل سعرًا واحدًا فقط (بالدقيقة أو بالساعة).', 'Enter one rate only (per minute or per hour).'));
    }
  }

  oneOf('tariff.timePerHour', perMin, perHour);
  oneOf('tariff.parkingPerHour', parkMin, parkHour);
  oneOf('tariff.idlePerHour', idleMin, idleHour);
  if ((parkMin != null || parkHour != null) && parkFlat != null) {
    p.add('tariff.parkingFlat', 'oneOf', const Bi('أدخل رسوم وقوف ثابتة أو بالوقت، لا الاثنين.', 'Enter a flat or a time-based parking fee, not both.'));
  }
  final anyPrice = [perKwh, perMin, perHour, session, parkMin, parkHour, parkFlat, idleMin, idleHour].whereType<Dec>().length;
  if (anyPrice == 0 && !p.list.any((x) => x.field.startsWith('tariff.'))) {
    p.add(
      'tariff',
      'required',
      const Bi(
        'أدخل سعرًا واحدًا على الأقل (مثل سعر الكيلوواط ساعة). لا توجد أسعار افتراضية.',
        'Enter at least one price (e.g. price per kWh). There are no default prices.',
      ),
    );
  }
  if ((perMin != null || perHour != null) && chargingMinutes == null && !p.has('chargingMinutes')) {
    p.add('chargingMinutes', 'required', const Bi('مدة الشحن مطلوبة لحساب رسوم الوقت.', 'The charging duration is needed for a time-based price.'));
  }
  if ((parkMin != null || parkHour != null) && parkingMinutes == null && !p.has('parkingMinutes')) {
    p.add('parkingMinutes', 'required', const Bi('مدة الوقوف مطلوبة لحساب رسوم الوقوف.', 'The parking duration is needed for a time-based parking fee.'));
  }
  if ((idleMin != null || idleHour != null) && idleMinutes == null && !p.has('idleMinutes')) {
    p.add('idleMinutes', 'required', const Bi('مدة الانتظار مطلوبة لحساب رسوم الانتظار.', 'The idle time is needed for an idle fee.'));
  }
  p.throwIfAny();
  final c = ctx!;
  final cur = c.currency;

  // --- compute --------------------------------------------------------------------------
  double? added;
  double grid;
  num? efficiencyApplied;
  var confidence = 'high';
  if (hasDirect && basis == 'grid') {
    added = null;
    grid = direct!.toDouble();
    trace.assume('energyBasis', EnergyLabels.energyBasis, 'grid', null, 'user');
    trace.step('gridEnergyKwh', EnergyLabels.gridEnergy, '${jsStr(grid)} kWh', round(grid, 3), 'kWh');
    if (efficiencyGiven != null) {
      trace.warn(
        'EFFICIENCY_NOT_APPLIED',
        const Bi(
          'لم تُطبَّق الكفاءة لأن الطاقة المُدخلة مقيسة من الشبكة (الفاقد محسوب فيها بالفعل).',
          'Efficiency was not applied: the entered energy is grid-side (losses already included).',
        ),
      );
    }
  } else {
    if (hasDirect) {
      added = direct!.toDouble();
      trace.assume('energyBasis', EnergyLabels.energyBasis, 'battery', null, 'user');
      trace.step('energyAddedKwh', EnergyLabels.energyAdded, '${jsStr(added)} kWh', round(added, 3), 'kWh');
    } else {
      added = traceEnergyAdded(trace, window!, prov);
    }
    final eff = useEfficiency(trace, efficiencyGiven, prov);
    if (eff.defaulted) confidence = 'medium';
    efficiencyApplied = eff.value;
    grid = traceGridEnergy(trace, added, eff.value);
  }

  tracePriceContext(trace, c, prov);
  var total = Dec(0);
  Money? energy, time, sessionFee, parking, idle;

  if (perKwh != null) {
    tracePrice(trace, 'tariff.energyPerKwh', _L.pricePerKwh, perKwh, 'kWh', cur, prov);
    final v = dec(grid).times(perKwh);
    energy = money(v, cur);
    total = total.plus(v);
    trace.step(
      'energyCost',
      _L.energyCost,
      '${jsStr(round(grid, 3))} kWh × ${rate(perKwh, cur).amount} $cur = ${energy.amount} $cur',
      energy.amount,
      cur,
    );
  }
  if (perMin != null || perHour != null) {
    final perMinute = perMin ?? perHour!.div(60);
    tracePrice(trace, 'tariff.timePerMinute', _L.pricePerMinute, perMinute, 'min', cur, prov);
    trace.assume('chargingMinutes', _L.chargingMinutes, chargingMinutes!, 'min', 'user');
    final v = dec(chargingMinutes).times(perMinute);
    time = money(v, cur);
    total = total.plus(v);
    trace.step(
      'timeCost',
      _L.timeCost,
      '${jsStr(chargingMinutes)} min × ${rate(perMinute, cur).amount} $cur = ${time.amount} $cur',
      time.amount,
      cur,
    );
  }
  if (session != null) {
    sessionFee = money(session, cur);
    total = total.plus(session);
    trace.step('sessionFee', _L.sessionFee, '${sessionFee.amount} $cur', sessionFee.amount, cur);
  }
  if (parkFlat != null) {
    parking = money(parkFlat, cur);
    total = total.plus(parkFlat);
    trace.step('parking', _L.parking, '${parking.amount} $cur', parking.amount, cur);
  } else if (parkMin != null || parkHour != null) {
    final perMinute = parkMin ?? parkHour!.div(60);
    trace.assume('parkingMinutes', _L.parkingMinutes, parkingMinutes!, 'min', 'user');
    final v = dec(parkingMinutes).times(perMinute);
    parking = money(v, cur);
    total = total.plus(v);
    trace.step(
      'parking',
      _L.parking,
      '${jsStr(parkingMinutes)} min × ${rate(perMinute, cur).amount} $cur = ${parking.amount} $cur',
      parking.amount,
      cur,
    );
  }
  if (idleMin != null || idleHour != null) {
    final perMinute = idleMin ?? idleHour!.div(60);
    final grace = idleGrace ?? 0;
    trace.assume('idleMinutes', _L.idleMinutes, idleMinutes!, 'min', 'user');
    trace.assume('tariff.idleGraceMinutes', _L.idleGrace, idleGrace, 'min', 'user');
    final billable = math.max<num>(0, idleMinutes - grace);
    final v = dec(billable).times(perMinute);
    idle = money(v, cur);
    total = total.plus(v);
    trace.step(
      'idle',
      _L.idle,
      'max(0, ${jsStr(idleMinutes)} − ${jsStr(grace)}) min × ${rate(perMinute, cur).amount} $cur = ${idle.amount} $cur',
      idle.amount,
      cur,
    );
  }
  final totalMoney = money(total, cur);
  trace.step('total', _L.total, '${totalMoney.amount} $cur', totalMoney.amount, cur);

  final costPerKwhAdded = added != null && added > 0 ? rate(total.div(added), cur) : null;

  return trace.output(
    'charge-cost',
    {
      'energyAddedKwh': added == null ? null : round(added, 3),
      'gridEnergyKwh': round(grid, 3),
      'lossesKwh': added == null ? null : round(grid - added, 3),
      'efficiencyApplied': efficiencyApplied,
      'energyBasis': hasDirect ? basis : 'battery',
      'cost': {
        'energy': energy,
        'time': time,
        'sessionFee': sessionFee,
        'parking': parking,
        'idle': idle,
        'total': totalMoney,
      },
      'costPerKwhAdded': costPerKwhAdded,
      'priceDate': c.priceDate,
    },
    _formula,
    confidence,
    {'energy': 'kWh', 'time': 'min', 'money': cur, 'price': '$cur/kWh'},
  );
}
