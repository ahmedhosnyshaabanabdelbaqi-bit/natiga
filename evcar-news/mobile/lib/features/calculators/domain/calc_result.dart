import 'package:flutter/foundation.dart';

import '../../../core/json/json_readers.dart';

/// A calculator result as JSON-backed view model. The same shape comes from
/// the on-device engine (`CalcOutput.toJson()`) and from
/// `POST /calculators/<kind>` (`data`), so one screen renders both.
@immutable
class CalcResultView {
  const CalcResultView({
    required this.calculator,
    required this.result,
    required this.formula,
    required this.steps,
    required this.assumptions,
    required this.warnings,
    required this.confidence,
    required this.disclaimer,
    this.vehicleName,
    required this.computedOnDevice,
  });

  final String calculator;
  final Map<String, dynamic> result;
  final String formula;
  final List<CalcStepView> steps;
  final List<CalcAssumptionView> assumptions;
  final List<({String code, String message})> warnings;

  /// high | medium | low.
  final String confidence;
  final String disclaimer;
  final String? vehicleName;

  /// True when computed by the app's engine (false = by the server, e.g.
  /// with catalog values of a chosen car).
  final bool computedOnDevice;

  factory CalcResultView.fromJson(Map<String, dynamic> j, {required bool computedOnDevice}) {
    final vehicle = j.objectOrNull('vehicle');
    return CalcResultView(
      calculator: j.stringOrNull('calculator') ?? '',
      result: j.objectOrNull('result') ?? const {},
      formula: j.stringOrNull('formula') ?? '',
      steps: j.objectList('steps', CalcStepView.fromJson),
      assumptions: j.objectList('assumptions', CalcAssumptionView.fromJson),
      warnings: j.objectList('warnings', (w) => (code: w.stringOrNull('code') ?? '', message: w.stringOrNull('message') ?? '')),
      confidence: j.stringOrNull('confidence') ?? 'low',
      disclaimer: j.stringOrNull('disclaimer') ?? '',
      vehicleName: vehicle?.stringOrNull('name'),
      computedOnDevice: computedOnDevice,
    );
  }

  /// `result.<path>` as money `{amount, currency}` (null = not included / not available).
  ({String amount, String currency})? money(String path) {
    final v = _at(path);
    if (v is! Map) return null;
    final amount = v['amount'];
    final currency = v['currency'];
    if (amount is! String || currency is! String) return null;
    return (amount: amount, currency: currency);
  }

  double? number(String path) {
    final v = _at(path);
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v);
    return null;
  }

  String? string(String path) {
    final v = _at(path);
    return v is String ? v : null;
  }

  Object? raw(String path) => _at(path);

  Object? _at(String path) {
    Object? cur = result;
    for (final part in path.split('.')) {
      if (cur is Map) {
        cur = cur[part];
      } else {
        return null;
      }
    }
    return cur;
  }

  /// Catalog-filled assumptions (origin `catalog`) by key.
  Map<String, CalcAssumptionView> get catalogAssumptions => {
    for (final a in assumptions)
      if (a.origin == 'catalog') a.key: a,
  };
}

@immutable
class CalcStepView {
  const CalcStepView({required this.key, required this.label, required this.expression, this.value, this.unit});

  final String key;
  final String label;
  final String expression;
  final Object? value;
  final String? unit;

  factory CalcStepView.fromJson(Map<String, dynamic> j) => CalcStepView(
    key: j.stringOrNull('key') ?? '',
    label: j.stringOrNull('label') ?? '',
    expression: j.stringOrNull('expression') ?? '',
    value: j['value'],
    unit: j.stringOrNull('unit'),
  );
}

@immutable
class CalcAssumptionView {
  const CalcAssumptionView({
    required this.key,
    required this.label,
    this.value,
    this.unit,
    required this.origin,
    this.note,
  });

  final String key;
  final String label;
  final Object? value;
  final String? unit;

  /// user | default | catalog | reference_price.
  final String origin;
  final String? note;

  factory CalcAssumptionView.fromJson(Map<String, dynamic> j) => CalcAssumptionView(
    key: j.stringOrNull('key') ?? '',
    label: j.stringOrNull('label') ?? '',
    value: j['value'],
    unit: j.stringOrNull('unit'),
    origin: j.stringOrNull('origin') ?? 'user',
    note: j.stringOrNull('note'),
  );
}
