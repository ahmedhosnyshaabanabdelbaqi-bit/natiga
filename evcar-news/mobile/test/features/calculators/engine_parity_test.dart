import 'dart:convert';
import 'dart:io';

import 'package:evcar_news/features/calculators/domain/engine/engine.dart';
import 'package:flutter_test/flutter_test.dart';

/// Parity with the backend engine: every case in fixtures/engine_parity.json
/// was produced by the TypeScript engine (see generate_engine_parity.ts). The
/// Dart port must return the same JSON — results, money strings, steps with
/// their expressions, assumptions (origin + note), warnings, confidence — or
/// the same field problems (field, rule, localized message).
typedef _Calc = CalcOutput Function(Map<String, Object?> input, {CalcLang lang, ProvenanceMap? prov});

const Map<String, _Calc> _calcs = {
  'charge-cost': chargeCost,
  'charge-time': chargeTime,
  'cost-per-100km': costPer100km,
  'monthly-cost': monthlyCost,
  'vs-fuel': vsFuel,
  'tco': tco,
};

void _expectSame(Object? actual, Object? expected, String path) {
  if (expected is Map) {
    expect(actual, isA<Map<Object?, Object?>>(), reason: path);
    final a = actual! as Map;
    expect(a.keys.toSet(), expected.keys.toSet(), reason: '$path keys');
    for (final k in expected.keys) {
      _expectSame(a[k], expected[k], '$path.$k');
    }
  } else if (expected is List) {
    expect(actual, isA<List<Object?>>(), reason: path);
    final a = actual! as List;
    expect(a.length, expected.length, reason: '$path length');
    for (var i = 0; i < expected.length; i++) {
      _expectSame(a[i], expected[i], '$path[$i]');
    }
  } else if (expected is num) {
    expect(actual, isA<num>(), reason: path);
    expect((actual! as num).toDouble(), expected.toDouble(), reason: path);
  } else {
    expect(actual, expected, reason: path);
  }
}

void main() {
  final file = File('test/features/calculators/fixtures/engine_parity.json');
  final cases = (jsonDecode(file.readAsStringSync()) as List).cast<Map<String, Object?>>();

  test('fixture has cases for every calculator', () {
    expect(cases.map((c) => c['calc']).toSet(), _calcs.keys.toSet());
  });

  for (var i = 0; i < cases.length; i++) {
    final c = cases[i];
    final calc = c['calc']! as String;
    final lang = c['lang']! as String;
    final input = Map<String, Object?>.from(c['input']! as Map);
    final provJson = c['prov'] as Map?;
    final prov = provJson == null
        ? null
        : {
            for (final e in provJson.entries)
              e.key as String: Provenance((e.value as Map)['origin'] as String, (e.value as Map)['note'] as String?),
          };
    test('#$i $calc ($lang) ${c.containsKey('problems') ? 'rejects' : 'computes'} like the backend', () {
      final fn = _calcs[calc]!;
      if (c.containsKey('problems')) {
        try {
          fn(input, lang: lang, prov: prov);
          fail('expected CalcInputError');
        } on CalcInputError catch (e) {
          final got = [for (final p in e.problems) {'field': p.field, 'rule': p.rule, 'message': p.message.of(lang)}];
          _expectSame(got, c['problems'], 'problems');
        }
      } else {
        final out = fn(input, lang: lang, prov: prov).toJson();
        _expectSame(jsonDecode(jsonEncode(out)), c['output'], 'output');
      }
    });
  }
}
