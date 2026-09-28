/// Shared building blocks of the calculators engine (REQUIREMENTS §13).
///
/// This is a line-by-line Dart port of the backend engine
/// (`backend/src/modules/calculators/engine/core.ts`): same validation rules,
/// same field names and rule codes, same rounding, same step expressions and
/// the same bilingual texts, so a calculation made offline on the phone and
/// the same calculation made by `POST /api/v1/calculators/<kind>` are
/// identical (verified by `test/features/calculators/engine_parity_test.dart`
/// against fixtures generated from the TypeScript engine).
///
/// The engine is PURE: no I/O, no clock. Missing / zero / negative /
/// non-finite inputs are field errors (never silently 0, never a division by
/// zero); optional cost components not entered are `null` ("not included");
/// there are NO built-in electricity or fuel prices.
library;

import 'dart:math' as math;

import 'decimal.dart';

export 'decimal.dart';

typedef CalcLang = String; // 'ar' | 'en'

/// A bilingual text (the engine answers in the request language).
class Bi {
  const Bi(this.ar, this.en);

  final String ar;
  final String en;

  String of(CalcLang lang) => lang == 'ar' ? ar : en;
}

/// Money as the API sends it: decimal string + ISO currency.
class Money {
  const Money(this.amount, this.currency);

  final String amount;
  final String currency;

  Map<String, Object?> toJson() => {'amount': amount, 'currency': currency};

  @override
  bool operator ==(Object other) => other is Money && other.amount == amount && other.currency == currency;

  @override
  int get hashCode => Object.hash(amount, currency);

  @override
  String toString() => '$amount $currency';
}

// ---- JS number semantics -------------------------------------------------------------

/// `${n}` of JavaScript: integers without ".0", otherwise the shortest
/// round-trip representation (same in JS and Dart).
String jsStr(Object? v) {
  if (v == null) return 'null';
  if (v is int) return v.toString();
  if (v is double) {
    if (v.isNaN) return 'NaN';
    if (v.isInfinite) return v > 0 ? 'Infinity' : '-Infinity';
    if (v == v.truncateToDouble() && v.abs() < 1e21) {
      if (v == 0) return '0';
      return v.toStringAsFixed(0);
    }
    return v.toString();
  }
  return v.toString();
}

/// `Math.round` of JavaScript (ties towards +∞).
double jsRound(double x) {
  final f = x.floorToDouble();
  return (x - f >= 0.5) ? f + 1 : f;
}

/// `round(v, decimals)` of the backend engine:
/// `Math.round((v + Number.EPSILON) * 10^d) / 10^d`.
double round(num v, [int decimals = 2]) {
  final f = math.pow(10, decimals).toDouble();
  return jsRound((v.toDouble() + 2.220446049250313e-16) * f) / f;
}

// ---- errors ---------------------------------------------------------------------------

class CalcProblem {
  const CalcProblem(this.field, this.rule, this.message);

  final String field;
  final String rule;
  final Bi message;

  @override
  String toString() => '$field: $rule';
}

/// Invalid calculator input (the server maps the same problems to 422).
class CalcInputError implements Exception {
  CalcInputError(this.problems);

  final List<CalcProblem> problems;

  @override
  String toString() => 'CalcInputError(${problems.join('; ')})';
}

/// Collects problems; [throwIfAny] raises one [CalcInputError] with all of them.
class Problems {
  final List<CalcProblem> list = [];

  void add(String field, String rule, Bi message) => list.add(CalcProblem(field, rule, message));

  bool has(String field) => list.any((p) => p.field == field);

  void throwIfAny() {
    if (list.isNotEmpty) throw CalcInputError(List.unmodifiable(list));
  }
}

abstract final class _Msg {
  static const required = Bi('هذه القيمة مطلوبة.', 'This value is required.');
  static const finite = Bi('يجب أن تكون القيمة رقمًا صالحًا.', 'Must be a valid number.');
  static const positive = Bi('يجب أن تكون القيمة أكبر من صفر.', 'Must be greater than zero.');
  static const nonNegative = Bi('لا يمكن أن تكون القيمة سالبة.', 'Cannot be negative.');
}

Bi rangeMessage(num min, num max) =>
    Bi('يجب أن تكون القيمة بين ${jsStr(min)} و${jsStr(max)}.', 'Must be between ${jsStr(min)} and ${jsStr(max)}.');

final _numericString = RegExp(r'^-?\d+(\.\d+)?$');

/// Parses a number or numeric string; null/'' → null; garbage → NaN.
num? toNum(Object? v) {
  if (v == null || v == '') return null;
  if (v is num) return v;
  if (v is String && _numericString.hasMatch(v.trim())) return num.parse(v.trim());
  return double.nan;
}

bool _isNum(num v) => v.isFinite;

class NumRule {
  const NumRule({this.required = false, this.positive = false, this.nonNegative = false, this.min, this.max, this.minExclusive = false});

  final bool required;
  final bool positive;
  final bool nonNegative;
  final num? min;
  final num? max;
  final bool minExclusive;
}

/// Validates one numeric input: the number, or null when absent (and not
/// required) or invalid (a problem is recorded).
num? readNum(Problems p, String field, Object? raw, [NumRule rule = const NumRule()]) {
  final v = toNum(raw);
  if (v == null) {
    if (rule.required) p.add(field, 'required', _Msg.required);
    return null;
  }
  if (!_isNum(v)) {
    p.add(field, 'isNumber', _Msg.finite);
    return null;
  }
  if (rule.positive && v <= 0) {
    p.add(field, v == 0 ? 'notZero' : 'positive', _Msg.positive);
    return null;
  }
  if (rule.nonNegative && v < 0) {
    p.add(field, 'nonNegative', _Msg.nonNegative);
    return null;
  }
  if (rule.min != null || rule.max != null) {
    final min = rule.min ?? double.negativeInfinity;
    final max = rule.max ?? double.infinity;
    final low = rule.minExclusive ? v <= min : v < min;
    if (low || v > max) {
      p.add(field, 'range', rangeMessage(rule.min ?? 0, rule.max ?? 0));
      return null;
    }
  }
  return v;
}

// ---- money --------------------------------------------------------------------------

final _currencyRe = RegExp(r'^[A-Z]{3}$');

String? validCurrency(Problems p, String field, Object? raw) {
  if (raw == null || raw == '') {
    p.add(field, 'required', _Msg.required);
    return null;
  }
  if (raw is! String || !_currencyRe.hasMatch(raw)) {
    p.add(field, 'currency', const Bi('رمز العملة غير صالح (مثل EGP).', 'Invalid currency code (e.g. EGP).'));
    return null;
  }
  return raw;
}

Dec dec(Object v) => Dec(v);

/// Money rounded half-up to 2 decimals.
Money money(Object amount, String currency) => Money(Dec(amount).toFixed(2), currency);

/// Rate money with more precision (e.g. price per kWh): 4 decimals, no
/// trailing zeros.
Money rate(Object amount, String currency) => Money(Dec(amount).toDecimalPlaces(4).toString(), currency);

final _dateRe = RegExp(r'^\d{4}-\d{2}-\d{2}$');

/// "2025-01-31" (date only) or null; anything else is a field problem.
String? validDate(Problems p, String field, Object? raw) {
  if (raw == null || raw == '') return null;
  if (raw is String && _dateRe.hasMatch(raw)) {
    final d = DateTime.tryParse('${raw}T00:00:00Z');
    if (d != null && d.toIso8601String().substring(0, 10) == raw) return raw;
  }
  p.add(field, 'isDate', const Bi('التاريخ غير صالح (YYYY-MM-DD).', 'Invalid date (YYYY-MM-DD).'));
  return null;
}

// ---- output -------------------------------------------------------------------------

typedef Confidence = String; // 'high' | 'medium' | 'low'
typedef AssumptionOrigin = String; // 'user' | 'default' | 'catalog' | 'reference_price'

class CalcStep {
  const CalcStep(this.key, this.label, this.expression, this.value, this.unit);

  final String key;
  final String label;
  final String expression;

  /// number, string or null.
  final Object? value;
  final String? unit;

  Map<String, Object?> toJson() => {'key': key, 'label': label, 'expression': expression, 'value': value, 'unit': unit};
}

class CalcAssumption {
  const CalcAssumption(this.key, this.label, this.value, this.unit, this.origin, this.note);

  final String key;
  final String label;
  final Object? value;
  final String? unit;
  final AssumptionOrigin origin;
  final String? note;

  Map<String, Object?> toJson() => {
    'key': key,
    'label': label,
    'value': value,
    'unit': unit,
    'origin': origin,
    'note': note,
  };
}

class CalcWarning {
  const CalcWarning(this.code, this.message);

  final String code;
  final String message;

  Map<String, Object?> toJson() => {'code': code, 'message': message};
}

/// Same shape as the server's `data` of `POST /calculators/<kind>` (without
/// `vehicle`).
class CalcOutput {
  const CalcOutput({
    required this.calculator,
    required this.result,
    required this.formula,
    required this.steps,
    required this.assumptions,
    required this.warnings,
    required this.confidence,
    required this.units,
    required this.disclaimer,
  });

  final String calculator;
  final Map<String, Object?> result;
  final String formula;
  final List<CalcStep> steps;
  final List<CalcAssumption> assumptions;
  final List<CalcWarning> warnings;
  final Confidence confidence;
  final Map<String, String> units;
  final String disclaimer;

  Map<String, Object?> toJson() => {
    'calculator': calculator,
    'result': _plain(result),
    'formula': formula,
    'steps': [for (final s in steps) s.toJson()],
    'assumptions': [for (final a in assumptions) a.toJson()],
    'warnings': [for (final w in warnings) w.toJson()],
    'confidence': confidence,
    'units': units,
    'disclaimer': disclaimer,
  };

  static Object? _plain(Object? v) => switch (v) {
    Money m => m.toJson(),
    Map<String, Object?> m => {for (final e in m.entries) e.key: _plain(e.value)},
    List<Object?> l => [for (final x in l) _plain(x)],
    _ => v,
  };
}

const disclaimer = Bi(
  'نتيجة تقديرية محسوبة من القيم المُدخلة والافتراضات الظاهرة فقط، وليست قياسًا أو ضمانًا.',
  'An estimate computed only from the entered values and the assumptions shown; not a measurement or a guarantee.',
);

/// Provenance of an input value filled from the catalog / a reference price.
class Provenance {
  const Provenance(this.origin, [this.note]);

  final AssumptionOrigin origin;
  final String? note;
}

typedef ProvenanceMap = Map<String, Provenance>;

Provenance originOf(ProvenanceMap? prov, String key) => prov?[key] ?? const Provenance('user');

/// Accumulates steps / assumptions / warnings of one calculation.
class Trace {
  Trace(this.lang);

  final CalcLang lang;
  final List<CalcStep> steps = [];
  final List<CalcAssumption> assumptions = [];
  final List<CalcWarning> warnings = [];

  void step(String key, Bi label, String expression, Object? value, String? unit) =>
      steps.add(CalcStep(key, label.of(lang), expression, value, unit));

  void assume(String key, Bi label, Object? value, String? unit, AssumptionOrigin origin, [String? note]) {
    // One entry per key: a later (more specific) statement replaces an earlier one.
    final entry = CalcAssumption(key, label.of(lang), value, unit, origin, note);
    final i = assumptions.indexWhere((a) => a.key == key);
    if (i >= 0) {
      assumptions[i] = entry;
    } else {
      assumptions.add(entry);
    }
  }

  void warn(String code, Bi message) {
    if (warnings.any((w) => w.code == code)) return;
    warnings.add(CalcWarning(code, message.of(lang)));
  }

  CalcOutput output(
    String calculator,
    Map<String, Object?> result,
    Bi formula,
    Confidence confidence,
    Map<String, String> units,
  ) => CalcOutput(
    calculator: calculator,
    result: result,
    formula: formula.of(lang),
    steps: steps,
    assumptions: assumptions,
    warnings: warnings,
    confidence: confidence,
    units: units,
    disclaimer: disclaimer.of(lang),
  );
}
