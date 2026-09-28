import 'package:flutter/foundation.dart';

import '../data/calculators_repository.dart';
import '../domain/calc_result.dart';
import '../domain/engine/engine.dart';

/// App calculator ids (routes) → backend engine kinds.
const calculatorApiKinds = <String, String>{
  'home-charging': 'charge-cost',
  'public-charging': 'charge-cost',
  'charging-time': 'charge-time',
  'cost-per-100km': 'cost-per-100km',
  'monthly-cost': 'monthly-cost',
  'vs-petrol': 'vs-fuel',
  'tco': 'tco',
};

typedef _Engine = CalcOutput Function(Map<String, Object?> input, {CalcLang lang, ProvenanceMap? prov});

const Map<String, _Engine> _engines = {
  'charge-cost': chargeCost,
  'charge-time': chargeTime,
  'cost-per-100km': costPer100km,
  'monthly-cost': monthlyCost,
  'vs-fuel': vsFuel,
  'tco': tco,
};

/// Form field key → key of `referencePriceIds` on the server.
const referencePriceFieldKeys = <String, String>{
  'tariff.energyPerKwh': 'energyPerKwh',
  'electricityPricePerKwh': 'electricityPricePerKwh',
  'publicPricePerKwh': 'publicPricePerKwh',
  'fuelPricePerLiter': 'fuelPricePerLiter',
  'fuelCar.fuelPricePerLiter': 'fuelPricePerLiter',
};

/// Builds a nested request body from flat dotted keys
/// (`tariff.energyPerKwh` → `{tariff: {energyPerKwh: …}}`); null values are
/// left out (not entered ≠ 0).
Map<String, Object?> nestInput(Map<String, Object?> flat) {
  final out = <String, Object?>{};
  for (final e in flat.entries) {
    if (e.value == null) continue;
    final parts = e.key.split('.');
    var cur = out;
    for (var i = 0; i < parts.length - 1; i++) {
      cur = (cur.putIfAbsent(parts[i], () => <String, Object?>{}) as Map<String, Object?>);
    }
    cur[parts.last] = e.value;
  }
  return out;
}

void _setPath(Map<String, Object?> m, String path, Object? value) {
  final parts = path.split('.');
  var cur = m;
  for (var i = 0; i < parts.length - 1; i++) {
    final next = cur[parts[i]];
    if (next is Map<String, Object?>) {
      cur = next;
    } else {
      final created = <String, Object?>{};
      cur[parts[i]] = created;
      cur = created;
    }
  }
  if (value == null) {
    cur.remove(parts.last);
  } else {
    cur[parts.last] = value;
  }
}

Object? _getPath(Map<String, Object?> m, String path) {
  Object? cur = m;
  for (final p in path.split('.')) {
    if (cur is Map) {
      cur = cur[p];
    } else {
      return null;
    }
  }
  return cur;
}

/// Result of applying reference prices on the device (mirrors the server's
/// `CalculatorsService.applyReferencePrices`).
@immutable
class AppliedReferencePrices {
  const AppliedReferencePrices(this.input, this.prov, this.warnings, this.problems);

  final Map<String, Object?> input;
  final ProvenanceMap prov;
  final List<CalcWarning> warnings;
  final List<CalcProblem> problems;
}

/// Puts the picked reference prices into [input] with the same provenance
/// notes, currency rule, default price date (oldest effective date) and
/// `REFERENCE_PRICE_OLD` warnings as the server.
AppliedReferencePrices applyReferencePricesLocally(
  Map<String, Object?> input,
  Map<String, ReferencePrice> refs,
  CalcLang lang,
) {
  final out = _deepCopy(input);
  final prov = <String, Provenance>{};
  final warnings = <CalcWarning>[];
  final problems = <CalcProblem>[];
  if (refs.isEmpty) return AppliedReferencePrices(out, prov, warnings, problems);
  String? currency = out['currency'] as String?;
  final used = <ReferencePrice>[];
  for (final entry in refs.entries) {
    final field = entry.key;
    final row = entry.value;
    final refKey = referencePriceFieldKeys[field];
    if (refKey == null) continue;
    final expectedUnit = refKey == 'fuelPricePerLiter' ? 'per_liter' : 'per_kwh';
    if (row.unit != expectedUnit) {
      problems.add(
        CalcProblem(
          'referencePriceIds.$refKey',
          'unit',
          const Bi('وحدة السعر المرجعي لا تناسب هذا الحقل.', 'The reference price unit does not fit this field.'),
        ),
      );
      continue;
    }
    if (currency != null && currency != row.currency) {
      problems.add(
        CalcProblem(
          'referencePriceIds.$refKey',
          'currency',
          const Bi('عملة السعر المرجعي تختلف عن عملة الحساب.', 'The reference price currency differs from the calculation currency.'),
        ),
      );
      continue;
    }
    currency = row.currency;
    _setPath(out, field, num.tryParse(row.amount) ?? row.amount);
    used.add(row);
    final note = [
      lang == 'ar' ? 'سعر مرجعي' : 'Reference price',
      ?row.sourceTitle,
      '${lang == 'ar' ? 'ساري من' : 'effective from'} ${row.effectiveFrom}',
      if (row.isDemo) 'DEMO',
    ].join(' · ');
    final p = Provenance('reference_price', note);
    prov[field] = p;
    if (refKey == 'fuelPricePerLiter') {
      prov['fuelPricePerLiter'] = p;
      prov['fuelCar.fuelPricePerLiter'] = p;
    }
    if (row.possiblyOutdated && !warnings.any((w) => w.code == 'REFERENCE_PRICE_OLD')) {
      warnings.add(
        CalcWarning(
          'REFERENCE_PRICE_OLD',
          lang == 'ar'
              ? 'السعر المرجعي ساري منذ ${row.effectiveFrom} وقد يكون قديمًا؛ عدّله إن تغيّر.'
              : 'The reference price is effective since ${row.effectiveFrom} and may be outdated; edit it if it changed.',
        ),
      );
    }
  }
  if (currency != null) out['currency'] = currency;
  final dateGiven = out['priceDate'];
  if ((dateGiven == null || dateGiven == '') && used.isNotEmpty) {
    final dates = used.map((r) => r.effectiveFrom).toList()..sort();
    out['priceDate'] = dates.first;
    prov['priceDate'] = const Provenance('reference_price');
  }
  return AppliedReferencePrices(out, prov, warnings, problems);
}

Map<String, Object?> _deepCopy(Map<String, Object?> m) => {
  for (final e in m.entries) e.key: e.value is Map ? _deepCopy(Map<String, Object?>.from(e.value! as Map)) : e.value,
};

/// Outcome of one calculation.
sealed class CalcOutcome {
  const CalcOutcome();
}

class CalcSuccess extends CalcOutcome {
  const CalcSuccess(this.view);

  final CalcResultView view;
}

/// Field problems: dotted field → localized message (+ problems not bound to
/// a form field, e.g. `tariff` or `curve`).
class CalcInvalid extends CalcOutcome {
  const CalcInvalid(this.fieldErrors);

  final Map<String, String> fieldErrors;
}

/// Runs a calculator with the on-device engine (same formulas as the server).
CalcOutcome runCalculatorLocally({
  required String apiKind,
  required Map<String, Object?> input,
  Map<String, ReferencePrice> referencePrices = const {},
  ProvenanceMap extraProv = const {},
  required CalcLang lang,
}) {
  final engine = _engines[apiKind];
  if (engine == null) throw ArgumentError('Unknown calculator $apiKind');
  final applied = applyReferencePricesLocally(input, referencePrices, lang);
  if (applied.problems.isNotEmpty) {
    return CalcInvalid({for (final p in applied.problems) p.field: p.message.of(lang)});
  }
  try {
    final out = engine(applied.input, lang: lang, prov: {...extraProv, ...applied.prov});
    final json = out.toJson();
    final warnings = (json['warnings']! as List).cast<Map<String, Object?>>();
    for (final w in applied.warnings) {
      if (!warnings.any((x) => x['code'] == w.code)) warnings.add(w.toJson());
    }
    json['vehicle'] = null;
    return CalcSuccess(CalcResultView.fromJson(_jsonSafe(json), computedOnDevice: true));
  } on CalcInputError catch (e) {
    final errors = <String, String>{};
    for (final p in e.problems) {
      final msg = p.message.of(lang);
      errors[p.field] = errors.containsKey(p.field) ? '${errors[p.field]}\n$msg' : msg;
    }
    return CalcInvalid(errors);
  }
}

/// Body for `POST /calculators/<kind>`: reference prices are sent by id
/// (their values are left out, as the server requires), plus the car.
Map<String, Object?> serverCalculatorBody({
  required Map<String, Object?> input,
  Map<String, ReferencePrice> referencePrices = const {},
  String? variantId,
  String? userVehicleId,
}) {
  final body = _deepCopy(input);
  final ids = <String, String>{};
  for (final e in referencePrices.entries) {
    final key = referencePriceFieldKeys[e.key];
    if (key == null) continue;
    _setPath(body, e.key, null);
    ids[key] = e.value.id;
  }
  // Drop empty nested maps left behind (e.g. `fuelCar: {}` is meaningful, keep it).
  final tariff = body['tariff'];
  if (tariff is Map && tariff.isEmpty) body.remove('tariff');
  if (ids.isNotEmpty) body['referencePriceIds'] = ids;
  if (variantId != null) body['variantId'] = variantId;
  if (userVehicleId != null) body['userVehicleId'] = userVehicleId;
  return body;
}

/// Value of [path] in a nested input (tests / UI helpers).
Object? inputValue(Map<String, Object?> input, String path) => _getPath(input, path);

Map<String, dynamic> _jsonSafe(Map<String, Object?> m) => {
  for (final e in m.entries)
    e.key: switch (e.value) {
      Map<String, Object?> v => _jsonSafe(v),
      List<Object?> l => [for (final x in l) x is Map<String, Object?> ? _jsonSafe(x) : x],
      final v => v,
    },
};
