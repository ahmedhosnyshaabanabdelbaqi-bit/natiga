import 'dart:convert';
import 'dart:io';

import 'package:evcar_news/core/time/time_zones.dart';
import 'package:evcar_news/features/charging/domain/station_models.dart';
import 'package:evcar_news/features/charging/domain/station_status.dart';
import 'package:flutter_test/flutter_test.dart';

/// Parity with the backend "open now" rules (review 3): every case in
/// fixtures/open_now_parity.json was evaluated by the TypeScript function
/// (see generate_open_now_parity.ts) — random valid schedules, 8 time zones,
/// instants around the 2026 DST transitions. The on-device evaluation used
/// for saved copies must give the same state.
void main() {
  setUpAll(TimeZones.ensureInitialized);

  final cases = (jsonDecode(File('test/features/charging/fixtures/open_now_parity.json').readAsStringSync()) as List)
      .cast<Map<String, dynamic>>();

  test('fixture covers open, closed and unknown (incl. unknown previous day)', () {
    final seen = {for (final c in cases) '${c['state']}/${c['reason']}'};
    expect(seen, containsAll(['open/schedule', 'closed/schedule', 'unknown/unknown_day', 'open/always_open']));
  });

  test('Dart evaluateOpenNow == backend evaluateOpenNow for every case', () {
    final mismatches = <String>[];
    for (final c in cases) {
      final hours = StationHours.fromJson({
        'timezone': c['timezone'],
        'isAlwaysOpen': c['isAlwaysOpen'],
        'weekly': c['weekly'],
      });
      final got = evaluateOpenNow(hours, DateTime.parse(c['now'] as String));
      final want = switch (c['state']) {
        'open' => OpenState.open,
        'closed' => OpenState.closed,
        _ => OpenState.unknown,
      };
      if (got != want) mismatches.add('${c['timezone']} ${c['now']} ${jsonEncode(c['weekly'])}: $want vs $got');
    }
    expect(mismatches, isEmpty, reason: mismatches.take(5).join('\n'));
  });

  test('regression: unknown yesterday is unknown, not closed (Cairo, 2026-09-27 08:51Z)', () {
    final hours = StationHours.fromJson({
      'timezone': 'Africa/Cairo',
      'weekly': [
        {
          'day': 'sun',
          'windows': [
            {'start': '02:00', 'end': '11:30'},
            {'start': '15:30', 'end': '00:30'},
          ],
        },
        {'day': 'sat', 'windows': null},
      ],
    });
    // 11:51 Cairo on Sunday: outside Sunday's windows, Saturday unknown.
    expect(evaluateOpenNow(hours, DateTime.utc(2026, 9, 27, 8, 51)), OpenState.unknown);
  });
}
