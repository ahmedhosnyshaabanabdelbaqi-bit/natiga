/// Charging duration, port of `engine/charge-time.ts`.
///
/// AC:  P = min(car on-board AC limit, station power, supply limit)
///      supply limit = phases × volts per phase × amps ÷ 1000
///      time = E_grid ÷ P = (E_batt ÷ efficiency) ÷ P
/// DC:  with a documented curve covering the window: Σ ΔE ÷ min(curve(SoC),
///      station) over 0.5 % steps (confidence medium). Without one: a LOW-
///      confidence RANGE only (average power 50–90 % of the limiting peak),
///      `minutes: null` — never "energy ÷ peak" presented as the answer.
library;

import 'core.dart';
import 'energy.dart';

class CurvePoint {
  const CurvePoint(this.socPercent, this.powerKw);

  final num socPercent;
  final num powerKw;

  Map<String, Object?> toJson() => {'socPercent': socPercent, 'powerKw': powerKw};
}

const int defaultVoltsPerPhase = 230;
const double curveStepPercent = 0.5;
const double dcRoughLow = 0.5;
const double dcRoughHigh = 0.9;

abstract final class _L {
  static const currentType = Bi('نوع التيار', 'Current type');
  static const stationPower = Bi('قدرة المحطة', 'Station power');
  static const vehicleAc = Bi('حد الشاحن الداخلي للسيارة (AC)', 'Car on-board AC limit');
  static const vehicleDc = Bi('أقصى قدرة DC للسيارة', 'Car peak DC power');
  static const supplyPhases = Bi('عدد الأطوار', 'Supply phases');
  static const supplyAmps = Bi('شدة التيار', 'Supply current');
  static const supplyVolts = Bi('الجهد لكل طور', 'Volts per phase');
  static const supplyKw = Bi('حد مصدر الكهرباء', 'Supply limit');
  static const effectivePower = Bi('القدرة الفعلية', 'Effective power');
  static const minutes = Bi('المدة', 'Duration');
  static const curve = Bi('منحنى الشحن الموثّق', 'Documented charging curve');
  static const averagePower = Bi('متوسط القدرة', 'Average power');
  static const range = Bi('نطاق تقديري', 'Estimated range');
  static const roughShare = Bi('متوسط القدرة المفترض كنسبة من القدرة القصوى', 'Assumed average power as a share of peak');
}

const _formulaAc = Bi(
  'مدة AC = (الطاقة المضافة ÷ الكفاءة) ÷ أقل قيمة بين حد السيارة وقدرة المحطة وحد مصدر الكهرباء.',
  'AC time = (energy added ÷ efficiency) ÷ min(car on-board limit, station power, supply limit).',
);
const _formulaDcCurve = Bi(
  'مدة DC = مجموع (الطاقة لكل 0.5% ÷ أقل قيمة بين قدرة المنحنى عند تلك النسبة وقدرة المحطة).',
  'DC time = Σ (energy per 0.5 % SoC ÷ min(curve power at that SoC, station power)).',
);
const _formulaDcRough = Bi(
  'تقدير DC منخفض الثقة: الطاقة المضافة ÷ (50% إلى 90% من أقل قيمة بين أقصى قدرة للسيارة وقدرة المحطة).',
  'Low-confidence DC estimate: energy added ÷ (50 %–90 % of min(car peak, station power)).',
);

/// Validates a curve: ≥ 2 points, SoC 0..100 strictly increasing, power ≥ 0.
List<CurvePoint>? validateCurve(Problems p, Object? raw) {
  if (raw == null) return null;
  if (raw is! List || raw.length < 2 || raw.length > 202) {
    p.add('curve', 'points', const Bi('يجب أن يحتوي المنحنى على نقطتين على الأقل.', 'The curve needs at least 2 points.'));
    return null;
  }
  final pts = <CurvePoint>[];
  for (var i = 0; i < raw.length; i++) {
    final pt = raw[i];
    final m = pt is Map ? pt : const {};
    final soc = readNum(p, 'curve.$i.socPercent', m['socPercent'], const NumRule(required: true, min: 0, max: 100));
    final kw = readNum(p, 'curve.$i.powerKw', m['powerKw'], const NumRule(required: true, nonNegative: true, max: 2000));
    if (soc != null && kw != null) pts.add(CurvePoint(soc, kw));
  }
  if (pts.length != raw.length) return null;
  for (var i = 1; i < pts.length; i++) {
    if (pts[i].socPercent <= pts[i - 1].socPercent) {
      p.add('curve', 'ascending', const Bi('يجب أن تكون نسب الشحن في المنحنى تصاعدية وبلا تكرار.', 'Curve SoC values must be strictly increasing.'));
      return null;
    }
  }
  return pts;
}

/// Linear interpolation of the curve at [soc] (caller ensures coverage).
double curvePowerAt(List<CurvePoint> curve, num soc) {
  if (soc <= curve.first.socPercent) return curve.first.powerKw.toDouble();
  for (var i = 1; i < curve.length; i++) {
    final a = curve[i - 1];
    final b = curve[i];
    if (soc <= b.socPercent) {
      final f = (soc - a.socPercent) / (b.socPercent - a.socPercent);
      return a.powerKw + f * (b.powerKw - a.powerKw);
    }
  }
  return curve.last.powerKw.toDouble();
}

/// Integrates the curve between [from] and [to] (percent). Null when the
/// curve does not cover the window or has zero power inside it.
({double minutes, bool limitedByStation})? integrateCurve(
  List<CurvePoint> curve,
  num usableKwh,
  num from,
  num to, [
  num? stationKw,
]) {
  final first = curve.first.socPercent;
  final last = curve.last.socPercent;
  if (from < first || to > last) return null;
  var hours = 0.0;
  var limited = false;
  for (num s = from; s < to - 1e-9; s += curveStepPercent) {
    final e = curveStepPercent < to - s ? curveStepPercent : to - s;
    final mid = s + e / 2;
    var kw = curvePowerAt(curve, mid);
    if (stationKw != null && stationKw < kw) {
      kw = stationKw.toDouble();
      limited = true;
    }
    if (!(kw > 0)) return null;
    hours += (usableKwh * e) / 100 / kw;
  }
  return (minutes: hours * 60, limitedByStation: limited);
}

/// [input]: `currentType` (AC|DC), `batteryUsableKwh`, `fromSocPercent`,
/// `toSocPercent`, `efficiency`, `stationPowerKw`, `vehicleAcMaxKw`,
/// `supplyPhases`, `supplyAmps`, `supplyVoltsPerPhase`, `vehicleDcPeakKw`,
/// `curve: [{socPercent, powerKw}]`.
CalcOutput chargeTime(Map<String, Object?> input, {CalcLang lang = 'en', ProvenanceMap? prov}) {
  final p = Problems();
  final trace = Trace(lang);
  final type = input['currentType'];
  if (type != 'AC' && type != 'DC') {
    p.add('currentType', type == null ? 'required' : 'isIn', const Bi('اختر نوع الشحن: AC أو DC.', 'Choose the charging type: AC or DC.'));
  }
  final w = readSocWindow(p, input);
  final eff = readEfficiency(p, input['efficiency']);
  final station = readNum(p, 'stationPowerKw', input['stationPowerKw'], const NumRule(positive: true, max: 2000));
  final acMax = readNum(p, 'vehicleAcMaxKw', input['vehicleAcMaxKw'], const NumRule(positive: true, max: 100));
  final dcPeak = readNum(p, 'vehicleDcPeakKw', input['vehicleDcPeakKw'], const NumRule(positive: true, max: 2000));
  final phases = readNum(p, 'supplyPhases', input['supplyPhases']);
  if (phases != null && phases != 1 && phases != 3) {
    p.add('supplyPhases', 'isIn', const Bi('عدد الأطوار 1 أو 3.', 'Phases must be 1 or 3.'));
  }
  final amps = readNum(p, 'supplyAmps', input['supplyAmps'], const NumRule(positive: true, max: 1000));
  final volts = readNum(p, 'supplyVoltsPerPhase', input['supplyVoltsPerPhase'], const NumRule(positive: true, max: 1000));
  if ((phases == null) != (amps == null)) {
    p.add(
      phases == null ? 'supplyPhases' : 'supplyAmps',
      'required',
      const Bi('حد مصدر الكهرباء يحتاج عدد الأطوار وشدة التيار معًا.', 'A supply limit needs both phases and amps.'),
    );
  }
  final curve = validateCurve(p, input['curve']);
  if (type == 'AC' && station == null && acMax == null && amps == null) {
    p.add(
      'stationPowerKw',
      'required',
      const Bi('أدخل قدرة المحطة أو حد الشاحن الداخلي للسيارة على الأقل.', 'Enter at least the station power or the car on-board AC limit.'),
    );
  }
  if (type == 'DC' && station == null && dcPeak == null && curve == null) {
    p.add(
      'stationPowerKw',
      'required',
      const Bi('أدخل قدرة المحطة أو أقصى قدرة DC للسيارة أو منحنى الشحن.', 'Enter the station power, the car peak DC power or a charging curve.'),
    );
  }
  p.throwIfAny();

  trace.assume('currentType', _L.currentType, type, null, 'user');
  final added = traceEnergyAdded(trace, w!, prov);
  final efficiency = useEfficiency(trace, eff, prov);
  final grid = traceGridEnergy(trace, added, efficiency.value);
  Provenance note(String key) => originOf(prov, key);

  if (station != null) {
    trace.assume('stationPowerKw', _L.stationPower, station, 'kW', note('stationPowerKw').origin, note('stationPowerKw').note);
  }
  const units = {'energy': 'kWh', 'power': 'kW', 'time': 'min'};

  if (type == 'AC') {
    final limits = <({String kind, double kw})>[];
    if (acMax != null) {
      trace.assume('vehicleAcMaxKw', _L.vehicleAc, acMax, 'kW', note('vehicleAcMaxKw').origin, note('vehicleAcMaxKw').note);
      limits.add((kind: 'vehicle', kw: acMax.toDouble()));
    } else {
      trace.warn(
        'VEHICLE_AC_LIMIT_UNKNOWN',
        const Bi('حد الشاحن الداخلي للسيارة غير معروف؛ قد تكون المدة الفعلية أطول.', 'The car on-board AC limit is unknown; the real time may be longer.'),
      );
    }
    if (station != null) limits.add((kind: 'station', kw: station.toDouble()));
    if (phases != null && amps != null) {
      final v = volts ?? defaultVoltsPerPhase;
      trace.assume('supplyPhases', _L.supplyPhases, phases, null, 'user');
      trace.assume('supplyAmps', _L.supplyAmps, amps, 'A', 'user');
      trace.assume('supplyVoltsPerPhase', _L.supplyVolts, v, 'V', volts == null ? 'default' : 'user');
      final kw = (phases * v * amps) / 1000;
      trace.step(
        'supplyKw',
        _L.supplyKw,
        '${jsStr(phases)} × ${jsStr(v)} V × ${jsStr(amps)} A ÷ 1000 = ${jsStr(round(kw, 2))} kW',
        round(kw, 2),
        'kW',
      );
      limits.add((kind: 'supply', kw: kw));
    }
    final best = limits.reduce((a, b) => b.kw < a.kw ? b : a);
    trace.step(
      'effectivePowerKw',
      _L.effectivePower,
      'min(${limits.map((l) => jsStr(round(l.kw, 2))).join(', ')}) = ${jsStr(round(best.kw, 2))} kW',
      round(best.kw, 2),
      'kW',
    );
    final minutes = (grid / best.kw) * 60;
    trace.step(
      'minutes',
      _L.minutes,
      '${jsStr(round(grid, 3))} kWh ÷ ${jsStr(round(best.kw, 2))} kW × 60 = ${jsStr(round(minutes, 0))} min',
      round(minutes, 0),
      'min',
    );
    if (w.to > 90) {
      trace.warn('TOP_OFF_SLOWER', const Bi('الشحن فوق 90% قد يبطؤ؛ المدة الفعلية قد تزيد.', 'Charging above 90 % may slow down; the real time can be longer.'));
    }
    final confidence = acMax != null && (station != null || amps != null) ? 'medium' : 'low';
    return trace.output(
      'charge-time',
      {
        'currentType': 'AC',
        'energyAddedKwh': round(added, 3),
        'gridEnergyKwh': round(grid, 3),
        'minutes': jsRound(minutes),
        'minutesRange': null,
        'powerKw': round(best.kw, 2),
        'limitingFactor': best.kind,
        'method': 'ac_power_limit',
        'isRoughEstimate': false,
      },
      _formulaAc,
      confidence,
      units,
    );
  }

  // --- DC -------------------------------------------------------------------------------
  if (dcPeak != null) {
    trace.assume('vehicleDcPeakKw', _L.vehicleDc, dcPeak, 'kW', note('vehicleDcPeakKw').origin, note('vehicleDcPeakKw').note);
  }
  if (curve != null) {
    trace.assume(
      'curve',
      _L.curve,
      curve.map((c) => '${jsStr(c.socPercent)}%:${jsStr(c.powerKw)}kW').join(', '),
      null,
      note('curve').origin,
      note('curve').note,
    );
    final integ = integrateCurve(curve, w.usable, w.from, w.to, station);
    if (integ != null) {
      final avg = added / (integ.minutes / 60);
      trace.step(
        'averagePowerKw',
        _L.averagePower,
        '${jsStr(round(added, 3))} kWh ÷ ${jsStr(round(integ.minutes / 60, 3))} h = ${jsStr(round(avg, 1))} kW',
        round(avg, 1),
        'kW',
      );
      trace.step('minutes', _L.minutes, 'Σ ΔE ÷ P(SoC) = ${jsStr(round(integ.minutes, 0))} min', round(integ.minutes, 0), 'min');
      trace.warn(
        'CURVE_CONDITIONS',
        const Bi(
          'المنحنى مقيس في ظروف محددة؛ الحرارة وتهيئة البطارية وحالة الشاحن تغيّر المدة.',
          'The curve was measured in specific conditions; temperature, preconditioning and the charger change the time.',
        ),
      );
      return trace.output(
        'charge-time',
        {
          'currentType': 'DC',
          'energyAddedKwh': round(added, 3),
          'gridEnergyKwh': round(grid, 3),
          'minutes': jsRound(integ.minutes),
          'minutesRange': null,
          'powerKw': round(avg, 1),
          'limitingFactor': integ.limitedByStation ? 'station' : 'curve',
          'method': 'dc_curve',
          'isRoughEstimate': false,
        },
        _formulaDcCurve,
        'medium',
        units,
      );
    }
    trace.warn(
      'CURVE_NOT_USABLE',
      const Bi(
        'منحنى الشحن لا يغطي نطاق الشحن المطلوب؛ استُخدم تقدير منخفض الثقة.',
        'The charging curve does not cover the requested window; a low-confidence estimate is used.',
      ),
    );
  }

  final peaks = <({String kind, double kw})>[
    if (dcPeak != null) (kind: 'vehicle', kw: dcPeak.toDouble()),
    if (station != null) (kind: 'station', kw: station.toDouble()),
  ];
  if (peaks.isEmpty) {
    // Only an unusable curve was given: refuse instead of inventing a number.
    final q = Problems()
      ..add(
        'curve',
        'coverage',
        const Bi(
          'المنحنى لا يغطي النطاق المطلوب؛ أدخل قدرة المحطة أو أقصى قدرة DC للسيارة.',
          'The curve does not cover the window; enter the station power or the car peak DC power.',
        ),
      );
    q.throwIfAny();
  }
  final peak = peaks.reduce((a, b) => b.kw < a.kw ? b : a);
  trace.assume('dcAverageShare', _L.roughShare, '${jsStr(dcRoughLow)}–${jsStr(dcRoughHigh)}', null, 'default');
  final low = (added / (peak.kw * dcRoughHigh)) * 60;
  final high = (added / (peak.kw * dcRoughLow)) * 60;
  trace.step(
    'minutesRange',
    _L.range,
    '${jsStr(round(added, 3))} kWh ÷ (${jsStr(dcRoughHigh)}…${jsStr(dcRoughLow)} × ${jsStr(round(peak.kw, 1))} kW) × 60 = ${jsStr(jsRound(low))}–${jsStr(jsRound(high))} min',
    '${jsStr(jsRound(low))}–${jsStr(jsRound(high))}',
    'min',
  );
  trace.warn(
    'NO_CHARGING_CURVE',
    const Bi(
      'لا يتوفر منحنى شحن موثّق؛ هذا نطاق تقديري منخفض الثقة وليس زمنًا دقيقًا.',
      'No documented charging curve; this is a low-confidence range, not an exact time.',
    ),
  );
  return trace.output(
    'charge-time',
    {
      'currentType': 'DC',
      'energyAddedKwh': round(added, 3),
      'gridEnergyKwh': round(grid, 3),
      'minutes': null,
      'minutesRange': {'low': jsRound(low), 'high': jsRound(high)},
      'powerKw': null,
      'limitingFactor': peak.kind,
      'method': 'dc_rough_estimate',
      'isRoughEstimate': true,
    },
    _formulaDcRough,
    'low',
    units,
  );
}
