import 'dart:convert';

import 'package:evcar_news/core/settings/settings_controller.dart';
import 'package:evcar_news/shared/compare_tray.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

CompareSelection car(String id, {String market = 'EG', int year = 2025}) =>
    CompareSelection(variantId: id, modelYear: year, marketCode: market, title: 'Car $id');

Future<ProviderContainer> containerWith([Map<String, Object> prefs = const {}]) async {
  SharedPreferences.setMockInitialValues(prefs);
  final sp = await SharedPreferences.getInstance();
  final c = ProviderContainer(overrides: [sharedPreferencesProvider.overrideWithValue(sp)]);
  addTearDown(c.dispose);
  return c;
}

void main() {
  test('adds up to four cars; duplicates and a fifth are refused', () async {
    final c = await containerWith();
    final tray = c.read(compareTrayProvider.notifier);
    expect(tray.add(car('a')), CompareAddResult.added);
    expect(tray.add(car('a')), CompareAddResult.alreadyInTray);
    expect(tray.canCompare, isFalse);
    // Same trim in another market is a different item.
    expect(tray.add(car('a', market: 'SA')), CompareAddResult.added);
    expect(tray.canCompare, isTrue);
    expect(tray.add(car('b')), CompareAddResult.added);
    expect(tray.add(car('c')), CompareAddResult.added);
    expect(tray.add(car('d')), CompareAddResult.full);
    expect(c.read(compareTrayProvider).map((s) => s.key), ['a@EG', 'a@SA', 'b@EG', 'c@EG']);
    expect(tray.isFull, isTrue);
  });

  test('persists across restarts (new container, same storage)', () async {
    final c = await containerWith();
    c.read(compareTrayProvider.notifier)
      ..add(car('a'))
      ..add(car('b', market: 'ae'));
    final stored = (await SharedPreferences.getInstance()).getString(CompareTrayController.storageKey)!;

    final restarted = await containerWith({CompareTrayController.storageKey: stored});
    final items = restarted.read(compareTrayProvider);
    expect(items.map((s) => s.key), ['a@EG', 'b@AE']);
    expect(items.first.addedAt, isNotNull);
  });

  test('toggle, remove, replace, reorder, clear', () async {
    final c = await containerWith();
    final tray = c.read(compareTrayProvider.notifier);
    expect(tray.toggle(car('a')), CompareAddResult.added);
    expect(tray.toggle(car('a')), isNull);
    expect(c.read(compareTrayProvider), isEmpty);

    tray
      ..add(car('a'))
      ..add(car('b'));
    expect(tray.replace('a@EG', car('a2', year: 2026)), isTrue);
    expect(tray.replace('a2@EG', car('b')), isFalse, reason: 'would duplicate another slot');
    tray.reorder(1, 0);
    expect(c.read(compareTrayProvider).map((s) => s.key), ['b@EG', 'a2@EG']);
    tray.remove('b@EG');
    expect(c.read(compareTrayProvider).single.modelYear, 2026);
    tray.clear();
    expect(c.read(compareTrayProvider), isEmpty);
  });

  test('corrupt or malformed storage never crashes', () async {
    final c1 = await containerWith({CompareTrayController.storageKey: '{not json'});
    expect(c1.read(compareTrayProvider), isEmpty);

    final c2 = await containerWith({
      CompareTrayController.storageKey: jsonEncode([
        {'variantId': 'a', 'modelYear': 2025, 'marketCode': 'EG', 'title': 'A'},
        {'variantId': '', 'modelYear': 2025, 'marketCode': 'EG', 'title': 'no id'},
        {'variantId': 'b', 'modelYear': '2025', 'marketCode': 'EG', 'title': 'year not int'},
        {'variantId': 'a', 'modelYear': 2025, 'marketCode': 'EG', 'title': 'duplicate'},
        'garbage',
      ]),
    });
    expect(c2.read(compareTrayProvider).map((s) => s.title), ['A']);
  });
}
