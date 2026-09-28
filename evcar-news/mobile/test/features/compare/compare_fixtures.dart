import 'dart:convert';
import 'dart:io';

/// Real responses of the comparisons / pickers / recommendations API
/// captured from a local backend running the DEMO seed (every record is
/// fictional and flagged `isDemo`). Captured 2026-09-25 with
/// `curl http://localhost:3117/api/v1/...` (own database `evcar_mcompare`).
Map<String, dynamic> compareFixture(String name) =>
    jsonDecode(File('test/features/compare/fixtures/$name.json').readAsStringSync()) as Map<String, dynamic>;

/// Deep copy (tests mutate fixtures freely).
Map<String, dynamic> copyJson(Map<String, dynamic> json) => jsonDecode(jsonEncode(json)) as Map<String, dynamic>;

const bevId = 'd0000000-0000-4000-8000-000000000014';
const phevId = 'd0000000-0000-4000-8000-000000000015';
const bevKey = '$bevId@EG';
const phevKey = '$phevId@EG';
const brandId = 'd0000000-0000-4000-8000-000000000010';
const modelId = 'd0000000-0000-4000-8000-000000000011';
const guestShareId = 'DYyTKn98sncm';
const curatedShareId = 'demo-cmp-0001';

/// The compare tray persisted in SharedPreferences (`compare.tray.v1`) with
/// the two demo trims (BEV + PHEV, 2025, Egypt).
String demoTrayJson() => jsonEncode([
  {
    'variantId': bevId,
    'modelYear': 2025,
    'marketCode': 'EG',
    'title': 'Demo Motors Demo EV One',
    'subtitle': 'Standard (demo) · BEV',
  },
  {
    'variantId': phevId,
    'modelYear': 2025,
    'marketCode': 'EG',
    'title': 'Demo Motors Demo EV One',
    'subtitle': 'Standard (demo) · PHEV',
  },
]);

/// Finds a metric in a compute fixture (by key) for in-place edits.
Map<String, dynamic> metricIn(Map<String, dynamic> body, String key) {
  final groups = (body['data'] as Map)['groups'] as List;
  for (final g in groups) {
    for (final m in (g as Map)['metrics'] as List) {
      if ((m as Map)['key'] == key) return m as Map<String, dynamic>;
    }
  }
  throw StateError('metric $key not in fixture');
}
