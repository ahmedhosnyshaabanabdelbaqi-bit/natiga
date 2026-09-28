/// Battery ↔ grid energy (REQUIREMENTS §13), port of `engine/energy.ts`:
///   energy added to the battery  E_batt = usable capacity × (to% − from%) / 100
///   energy drawn from the grid   E_grid = E_batt ÷ efficiency
/// Efficiency is in (0, 1] (default 0.90, always shown as an editable
/// assumption). Grid-side energy entered by the user gets no efficiency —
/// losses are never counted twice.
library;

import 'core.dart';

const double defaultEfficiency = 0.9;

abstract final class EnergyLabels {
  static const usable = Bi('السعة القابلة للاستخدام', 'Usable battery capacity');
  static const fromSoc = Bi('نسبة الشحن في البداية', 'Start state of charge');
  static const toSoc = Bi('نسبة الشحن في النهاية', 'End state of charge');
  static const energyAdded = Bi('الطاقة المضافة للبطارية', 'Energy added to the battery');
  static const gridEnergy = Bi('الطاقة المسحوبة من الشبكة', 'Energy drawn from the grid');
  static const losses = Bi('فاقد الشحن', 'Charging losses');
  static const efficiency = Bi('كفاءة الشحن', 'Charging efficiency');
  static const energyBasis = Bi('أساس الطاقة المُدخلة', 'Basis of the entered energy');
}

double energyAddedKwh(num usableKwh, num fromSoc, num toSoc) => (usableKwh * (toSoc - fromSoc)) / 100;

double gridEnergyKwh(num batteryKwh, num efficiency) {
  if (!(efficiency > 0 && efficiency <= 1)) throw RangeError('efficiency must be in (0, 1]');
  return batteryKwh / efficiency;
}

class SocWindow {
  const SocWindow(this.usable, this.from, this.to);

  final num usable;
  final num from;
  final num to;
}

/// Validates usable capacity + SoC window (0 ≤ from < to ≤ 100).
SocWindow? readSocWindow(Problems p, Map<String, Object?> input, {bool required = true}) {
  final usable = readNum(p, 'batteryUsableKwh', input['batteryUsableKwh'], NumRule(required: required, positive: true, max: 1000));
  final from = readNum(p, 'fromSocPercent', input['fromSocPercent'], NumRule(required: required, min: 0, max: 100));
  final to = readNum(p, 'toSocPercent', input['toSocPercent'], NumRule(required: required, min: 0, max: 100));
  if (from != null && to != null && to <= from) {
    p.add(
      'toSocPercent',
      'greaterThanFrom',
      const Bi('يجب أن تكون نسبة النهاية أكبر من نسبة البداية.', 'The end state of charge must be above the start.'),
    );
    return null;
  }
  if (usable == null || from == null || to == null) return null;
  return SocWindow(usable, from, to);
}

num? readEfficiency(Problems p, Object? raw) =>
    readNum(p, 'efficiency', raw, const NumRule(min: 0, max: 1, minExclusive: true));

/// Records the efficiency assumption and returns the value used.
({num value, bool defaulted}) useEfficiency(Trace trace, num? given, [ProvenanceMap? prov]) {
  final defaulted = given == null;
  final value = given ?? defaultEfficiency;
  trace.assume(
    'efficiency',
    EnergyLabels.efficiency,
    value,
    null,
    defaulted ? 'default' : originOf(prov, 'efficiency').origin,
    defaulted
        ? const Bi(
            'افتراض افتراضي قابل للتعديل (0 < الكفاءة ≤ 1).',
            'Editable default assumption (0 < efficiency ≤ 1).',
          ).of(trace.lang)
        : originOf(prov, 'efficiency').note,
  );
  return (value: value, defaulted: defaulted);
}

/// Adds the "energy added" step for a SoC window and returns kWh.
double traceEnergyAdded(Trace trace, SocWindow w, [ProvenanceMap? prov]) {
  trace.assume(
    'batteryUsableKwh',
    EnergyLabels.usable,
    w.usable,
    'kWh',
    originOf(prov, 'batteryUsableKwh').origin,
    originOf(prov, 'batteryUsableKwh').note,
  );
  trace.assume('fromSocPercent', EnergyLabels.fromSoc, w.from, '%', 'user');
  trace.assume('toSocPercent', EnergyLabels.toSoc, w.to, '%', 'user');
  final added = energyAddedKwh(w.usable, w.from, w.to);
  trace.step(
    'energyAddedKwh',
    EnergyLabels.energyAdded,
    '${jsStr(w.usable)} kWh × (${jsStr(w.to)}% − ${jsStr(w.from)}%) = ${jsStr(round(added, 3))} kWh',
    round(added, 3),
    'kWh',
  );
  return added;
}

double traceGridEnergy(Trace trace, double added, num efficiency) {
  final grid = gridEnergyKwh(added, efficiency);
  trace.step(
    'gridEnergyKwh',
    EnergyLabels.gridEnergy,
    '${jsStr(round(added, 3))} kWh ÷ ${jsStr(efficiency)} = ${jsStr(round(grid, 3))} kWh',
    round(grid, 3),
    'kWh',
  );
  trace.step(
    'lossesKwh',
    EnergyLabels.losses,
    '${jsStr(round(grid, 3))} kWh − ${jsStr(round(added, 3))} kWh = ${jsStr(round(grid - added, 3))} kWh',
    round(grid - added, 3),
    'kWh',
  );
  return grid;
}
