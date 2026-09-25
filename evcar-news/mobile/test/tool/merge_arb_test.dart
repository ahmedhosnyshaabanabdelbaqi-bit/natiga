import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import '../../tool/merge_arb.dart';

ArbPart part(String name, Map<String, Object?> json) => ArbPart(name, jsonEncode(json));

void main() {
  group('mergeArbParts', () {
    test('merges parts per locale, sorted, with metadata after each message', () {
      final result = mergeArbParts([
        part('news_en.arb', {
          '@@locale': 'en',
          'newsTitle': 'News',
          'newsCount': '{n} items',
          '@newsCount': {
            'placeholders': {
              'n': {'type': 'int'},
            },
          },
        }),
        part('news_ar.arb', {'@@locale': 'ar', 'newsTitle': 'الأخبار', 'newsCount': '{n} عنصر'}),
        part('charging_logs_en.arb', {'chargingLogsTitle': 'Charging log'}),
        part('charging_logs_ar.arb', {'chargingLogsTitle': 'سجل الشحن'}),
      ]);

      expect(result.errors, isEmpty);
      expect(result.outputs.keys, unorderedEquals(['ar', 'en']));
      final en = jsonDecode(result.outputs['en']!) as Map<String, dynamic>;
      expect(en.keys.toList(), ['@@locale', 'chargingLogsTitle', 'newsCount', '@newsCount', 'newsTitle']);
      expect(en['@newsCount'], {
        'placeholders': {
          'n': {'type': 'int'},
        },
      });
      final ar = jsonDecode(result.outputs['ar']!) as Map<String, dynamic>;
      expect(ar['@@locale'], 'ar');
      expect(ar['newsTitle'], 'الأخبار');
      expect(result.outputs['ar'], endsWith('}\n'));
    });

    test('fails on a key defined in two parts of the same locale', () {
      final result = mergeArbParts([
        part('charging_en.arb', {'chargingLogsTitle': 'A'}),
        part('charging_ar.arb', {'chargingLogsTitle': 'أ'}),
        part('charging_logs_en.arb', {'chargingLogsTitle': 'B'}),
        part('charging_logs_ar.arb', {'chargingLogsTitle': 'ب'}),
      ]);
      expect(result.ok, isFalse);
      expect(
        result.errors,
        contains(
          allOf(
            contains('duplicate key "chargingLogsTitle"'),
            contains('charging_en.arb'),
            contains('charging_logs_en.arb'),
          ),
        ),
      );
      expect(result.outputs, isEmpty);
    });

    test('fails on a duplicate key inside one file (which jsonDecode would hide)', () {
      const raw = '{"@@locale": "en", "homeTitle": "Home", "homeTitle": "Again"}';
      final result = mergeArbParts([
        ArbPart('home_en.arb', raw),
        part('home_ar.arb', {'homeTitle': 'الرئيسية'}),
      ]);
      expect(result.errors, contains(contains('duplicate key "homeTitle" in the same file')));
    });

    test('fails when a locale misses a key', () {
      final result = mergeArbParts([
        part('home_en.arb', {'homeTitle': 'Home', 'homeSubtitle': 'Sub'}),
        part('home_ar.arb', {'homeTitle': 'الرئيسية'}),
      ]);
      expect(result.errors, contains(allOf(contains('"ar"'), contains('homeSubtitle'))));
    });

    test('enforces the feature prefix', () {
      final result = mergeArbParts([
        part('home_en.arb', {'title': 'Home', 'homepageX': 'x'}),
        part('home_ar.arb', {'title': 'الرئيسية', 'homepageX': 'x'}),
      ]);
      expect(result.errors.where((e) => e.contains('feature prefix "home"')), hasLength(4));
    });

    test('rejects bad file names, @@locale mismatch, orphan metadata and non-string messages', () {
      final result = mergeArbParts([
        part('Home-en.arb', {'homeTitle': 'x'}),
        part('home_en.arb', {'@@locale': 'ar', 'homeTitle': 'Home', '@homeOther': {}, 'homeCount': 3}),
        part('home_ar.arb', {'homeTitle': 'الرئيسية', 'homeCount': '3'}),
      ]);
      expect(result.errors, contains(contains('Home-en.arb: file name')));
      expect(result.errors, contains(contains('"@@locale" is "ar"')));
      expect(result.errors, contains(contains('metadata "@homeOther" has no message')));
      expect(result.errors, contains(contains('message "homeCount" must be a string')));
    });

    test('invalid JSON is reported with the file name', () {
      final result = mergeArbParts([ArbPart('home_en.arb', '{"homeTitle": ')]);
      expect(result.errors.single, startsWith('home_en.arb: invalid JSON'));
    });
  });

  group('topLevelKeys', () {
    test('ignores nested keys and handles escaped quotes', () {
      const src = r'''
{
  "a": "x \" y",
  "@a": {"description": "d", "placeholders": {"n": {"type": "int"}}},
  "b": ["c", {"d": 1}],
  "a": "dup"
}''';
      expect(topLevelKeys(src), ['a', '@a', 'b', 'a']);
    });
  });

  test('featurePrefix converts snake_case to camelCase', () {
    expect(featurePrefix('charging_logs'), 'chargingLogs');
    expect(featurePrefix('services_directory'), 'servicesDirectory');
    expect(featurePrefix('home'), 'home');
  });

  test('the real parts in lib/l10n/parts merge cleanly and match the committed output', () {
    final dir = Directory('lib/l10n/parts');
    final parts = dir
        .listSync()
        .whereType<File>()
        .where((f) => f.path.endsWith('.arb'))
        .map((f) => ArbPart(f.uri.pathSegments.last, f.readAsStringSync()))
        .toList();
    final result = mergeArbParts(parts);
    expect(result.errors, isEmpty);
    for (final entry in result.outputs.entries) {
      expect(
        File('lib/l10n/app_${entry.key}.arb').readAsStringSync(),
        entry.value,
        reason: 'run: dart run tool/merge_arb.dart && flutter gen-l10n',
      );
    }
  });
}
