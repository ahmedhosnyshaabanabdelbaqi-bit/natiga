import 'dart:convert';

import 'package:dio/dio.dart' show RequestOptions;
import 'package:evcar_news/app/router/app_router.dart';
import 'package:evcar_news/app/router/app_routes.dart';
import 'package:evcar_news/core/auth/auth_tokens.dart';
import 'package:evcar_news/core/auth/token_storage.dart';
import 'package:evcar_news/core/settings/settings_controller.dart';
import 'package:evcar_news/features/compare/application/compare_providers.dart';
import 'package:evcar_news/shared/compare_tray.dart';
import 'package:evcar_news/shared/widgets/image_with_fallback.dart';
import 'package:evcar_news/shared/widgets/skeleton.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/fake_http_adapter.dart';
import '../../helpers/kit_harness.dart' show FailingImage;
import '../../helpers/test_app.dart';
import 'compare_fixtures.dart';

/// Fake comparisons backend built from real (demo-seed) API responses.
class _CompareServer {
  _CompareServer() {
    FakeResponse guard(FakeResponse Function() ok) {
      if (!online) throw const FakeNetworkError();
      return ok();
    }

    String lang(RequestOptions r) => (r.headers['Accept-Language'] as String?) ?? 'en';

    adapter
      ..on('GET /cars/pickers', (r) {
        final q = r.queryParameters;
        final name = q.containsKey('variant')
            ? 'pickers_markets'
            : q.containsKey('year')
            ? 'pickers_variants'
            : q.containsKey('model')
            ? 'pickers_years'
            : q.containsKey('brand')
            ? 'pickers_models'
            : 'pickers_brands';
        return guard(() => FakeResponse.json(200, compareFixture(name)));
      })
      ..on(
        'POST /comparisons/compute',
        (r) => guard(
          () => FakeResponse.json(
            200,
            computeBody ?? compareFixture(lang(r) == 'ar' ? 'compute_detailed_ar' : 'compute_detailed_en'),
          ),
        ),
      )
      ..on('POST /comparisons', (r) {
        final signedIn = r.headers['Authorization'] != null;
        final body = copyJson(compareFixture('create_guest_en'));
        if (signedIn) {
          (body['data'] as Map)
            ..['kind'] = 'saved'
            ..['isMine'] = true
            ..['saved'] = true;
        }
        return guard(() => FakeResponse.json(201, body));
      })
      ..on('GET /comparisons/featured', (_) => guard(() => FakeResponse.json(200, compareFixture('featured_en'))))
      ..on(
        'GET /comparisons/s/$guestShareId',
        (_) => guard(() => FakeResponse.json(200, sharedBody ?? compareFixture('shared_en'))),
      )
      ..on(
        'GET /comparisons/s/$curatedShareId',
        (_) => guard(() => FakeResponse.json(200, compareFixture('shared_curated_ar'))),
      )
      ..on('GET /me', (_) => FakeResponse.json(200, {'data': fakeUserJson()}))
      ..on('GET /me/comparisons', (_) {
        final saved = copyJson(compareFixture('create_guest_en'))['data'] as Map<String, dynamic>
          ..['kind'] = 'saved'
          ..['isMine'] = true
          ..['title'] = 'My weekend shortlist';
        return FakeResponse.json(200, {
          'data': [saved],
          'meta': {'page': 1, 'pageSize': 50, 'total': 1, 'totalPages': 1},
        });
      })
      ..on('POST /recommendations', (r) {
        final body = r.data as Map;
        final ranked = body['weights'] != null;
        return guard(
          () => FakeResponse.json(
            200,
            compareFixture(ranked ? 'recommend_ranked_en' : (lang(r) == 'ar' ? 'recommend_ar' : 'recommend_en')),
          ),
        );
      });
  }

  final adapter = FakeHttpAdapter();
  bool online = true;
  Map<String, dynamic>? computeBody;
  Map<String, dynamic>? sharedBody;
}

final _shared = <String>[];

Future<(_CompareServer, TestAppHarness)> _pump(
  WidgetTester tester, {
  String language = 'en',
  required String location,
  Size size = const Size(360, 780),
  bool tray = true,
  Map<String, Object> prefs = const {},
  bool bigText = false,
  InMemoryTokenStorage? tokens,
  void Function(_CompareServer server)? setup,
}) async {
  tester.view.physicalSize = size * 3;
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  if (bigText) {
    // System 125 % × in-app 160 % = 200 %.
    tester.platformDispatcher.textScaleFactorTestValue = 1.25;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  }
  _shared.clear();
  final server = _CompareServer();
  setup?.call(server);
  final harness = await pumpTestApp(
    tester,
    language: language,
    adapter: server.adapter,
    features: allFeaturesOn,
    tokens: tokens,
    prefs: {if (tray) CompareTrayController.storageKey: demoTrayJson(), ...prefs},
    extraOverrides: [
      networkImageProviderFactory.overrideWithValue((_) => const FailingImage()),
      compareShareProvider.overrideWithValue(({required text, required subject}) async => _shared.add(text)),
    ],
  );
  tester.container().read(routerProvider).go(location);
  await _settle(tester);
  return (server, harness);
}

/// Large responses (the 61 KB compute result) are JSON-decoded by Dio in a
/// background isolate, which only progresses in real time: let real time pass
/// until no skeleton is left, then settle.
Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 200; i++) {
    await tester.pump(const Duration(milliseconds: 20));
    // The first frames only run the route transition; check after it.
    if (i > 15 && find.byType(Skeleton).evaluate().isEmpty) break;
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 30)));
  }
  await tester.pumpAndSettle();
}

Finder get _scrollable => find.byType(Scrollable).first;

Future<void> _scrollTo(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(finder, 400, scrollable: _scrollable, maxScrolls: 200);
  await tester.pumpAndSettle();
}

/// Jumps to the top without a drag (a downward drag would pull-to-refresh).
Future<void> _toTop(WidgetTester tester) async {
  tester.state<ScrollableState>(_scrollable).position.jumpTo(0);
  await tester.pumpAndSettle();
}

/// Scrolls through the whole comparison and collects every visible text.
Future<Set<String>> _allTexts(WidgetTester tester) async {
  final texts = <String>{};
  void collect() {
    for (final w in tester.widgetList<Text>(find.byType(Text))) {
      final d = w.data ?? w.textSpan?.toPlainText();
      if (d != null) texts.add(d);
    }
  }

  await _toTop(tester);
  for (var i = 0; i < 80; i++) {
    collect();
    final pos = tester.state<ScrollableState>(_scrollable).position;
    if (pos.pixels >= pos.maxScrollExtent) break;
    await tester.drag(_scrollable, const Offset(0, -350));
    await tester.pumpAndSettle();
  }
  collect();
  return texts;
}

/// Brings [finder] to the middle of the screen (clear of app/nav bars) and taps it.
Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder.first);
  await tester.pumpAndSettle();
  final height = tester.view.physicalSize.height / tester.view.devicePixelRatio;
  final dy = tester.getCenter(finder.first).dy;
  if (dy > height * 0.7 || dy < height * 0.2) {
    await tester.drag(_scrollable, Offset(0, height * 0.5 - dy));
    await tester.pumpAndSettle();
  }
  await tester.tap(finder.first);
  await tester.pumpAndSettle();
}

/// Scrolls until [text] is built, then taps it (picker lists are lazy).
Future<void> _pick(WidgetTester tester, String text) async {
  await tester.scrollUntilVisible(find.text(text), 200, scrollable: _scrollable);
  await tester.pumpAndSettle();
  await _tap(tester, find.text(text));
}

List<String> _trayKeys(WidgetTester tester) => [for (final s in tester.container().read(compareTrayProvider)) s.key];

void main() {
  group('compare tab', () {
    testWidgets('empty tray: intro, rules, featured comparisons and the cascade picker adds a car', (tester) async {
      final (server, _) = await _pump(tester, location: AppRoutes.compare, tray: false);
      expect(find.text('Compare 2 to 4 cars side by side'), findsOneWidget);
      expect(find.text('Year, trim and market are required for every car.'), findsOneWidget);
      await _scrollTo(tester, find.text('[DEMO] Demo comparison: BEV vs PHEV (fictional)'));
      await _toTop(tester);

      await _tap(tester, find.text('Add car 1'));
      expect(find.text('Choose the brand'), findsOneWidget);
      await _pick(tester, 'ديمو موتورز (تجريبي)');
      expect(find.text('Choose the model'), findsOneWidget);
      await _pick(tester, 'ديمو EV ون (تجريبي)');
      expect(find.text('Choose the model year'), findsOneWidget);
      await _pick(tester, '2025');
      expect(find.text('Choose the trim'), findsOneWidget);
      // Trim level shows the powertrain so BEV and PHEV trims are told apart.
      expect(find.text('Electric · BEV'), findsOneWidget);
      await _pick(tester, 'ستاندرد (تجريبي)');
      // Market is an explicit, mandatory last step.
      expect(find.text('Choose the market'), findsOneWidget);
      expect(find.text('Prices in EGP'), findsOneWidget);
      await _pick(tester, 'مصر');

      expect(_trayKeys(tester), [bevKey]);
      final stored = tester.container().read(sharedPreferencesProvider).getString(CompareTrayController.storageKey)!;
      expect((jsonDecode(stored) as List).single['modelYear'], 2025, reason: 'persisted for restarts');
      final pickerCalls = server.adapter.requestsTo('GET /cars/pickers');
      expect(pickerCalls.map((r) => r.queryParameters['market']).toSet(), {'EG'});
      expect(pickerCalls.last.queryParameters['variant'], bevId);
      expect(find.text('Add car 2'), findsOneWidget);
    });

    testWidgets('comparison: pinned names, cycle + SoC window next to values, winners with icon + text, N/A', (
      tester,
    ) async {
      await _pump(tester, location: AppRoutes.compare);
      final body = tester.container().read(compareTrayProvider);
      expect(body.length, 2);
      // Pinned header with the numbered cars and their mandatory facts.
      expect(find.text('2025 · Electric · EG'), findsOneWidget);
      expect(find.text('2025 · Plug-in hybrid · EG'), findsOneWidget);

      final texts = await _allTexts(tester);
      expect(texts, contains('At a glance'));
      expect(texts, contains('Electric range'));
      expect(texts.where((t) => t.contains('WLTP')), isNotEmpty, reason: 'test cycle next to the range');
      expect(texts.where((t) => t.contains('10–80% charge')), isNotEmpty, reason: 'SoC window next to the time');
      expect(texts.where((t) => t.contains('150 kW charger')), isNotEmpty);
      expect(texts, contains('Best'));
      expect(texts, contains('Not available'));
      expect(texts, contains('Not applicable'));
      expect(texts, contains('Missing data — no winner'));
      expect(
        texts,
        contains('Some values are not available; a missing value is never treated as 0, so no winner is declared.'),
      );
      expect(texts, contains('Published as 150 kW'), reason: 'hp derived from kW keeps the published value');
      expect(texts.where((t) => t.contains('never change')), isNotEmpty, reason: 'ads disclosure');
      expect(texts, isNot(contains('0 km')));
      expect(texts, isNot(contains('0')));
    });

    testWidgets('the car names stay pinned while scrolling', (tester) async {
      await _pump(tester, location: AppRoutes.compare);
      await _scrollTo(tester, find.text('Features'));
      expect(find.text('Features'), findsOneWidget);
      expect(find.text('2025 · Electric · EG'), findsOneWidget);
      expect(find.text('Demo EV One · Standard (demo)'), findsWidgets);
    });

    testWidgets('no winner is shown for mixed cycles, missing data or equal values — even if winners leak', (
      tester,
    ) async {
      final body = copyJson(compareFixture('compute_detailed_en'));
      metricIn(body, 'range.electric')
        ..['comparability'] = 'not_comparable_cycles'
        ..['outcome'] = 'no_winner'
        ..['comparabilityNote'] = 'Ranges from different test cycles are never converted or compared.';
      metricIn(body, 'charging.ac_max_kw')
        ..['outcome'] = 'tie'
        ..['winners'] = <String>[];
      metricIn(body, 'charging.dc_time')
        ..['outcome'] = 'winner'
        ..['winners'] = [bevKey];
      await _pump(tester, location: AppRoutes.compare, setup: (s) => s.computeBody = body);
      final texts = await _allTexts(tester);
      expect(texts, isNot(contains('Best')), reason: 'no row is comparable with a winner');
      expect(texts, contains('Different test cycles — no winner'));
      expect(texts, contains('Ranges from different test cycles are never converted or compared.'));
      expect(texts, contains('Equal — no winner'));
    });

    testWidgets('summary view and differences-only filter rows; empty result offers to show all', (tester) async {
      await _pump(tester, location: AppRoutes.compare);
      Future<bool> hasRow(String label) async => (await _allTexts(tester)).contains(label);
      expect(await hasRow('Drive'), isTrue);
      expect(await hasRow('Doors'), isTrue);

      await _toTop(tester);
      await tester.tap(find.text('Differences only'));
      await tester.pumpAndSettle();
      expect(await hasRow('Drive'), isFalse, reason: 'both cars are front-wheel drive');
      expect(await hasRow('Electric range'), isTrue);

      await _toTop(tester);
      await tester.tap(find.text('Differences only'));
      await tester.tap(find.text('Summary'));
      await tester.pumpAndSettle();
      expect(await hasRow('Doors'), isFalse, reason: 'not a key row');
      expect(await hasRow('Seats'), isTrue);
      // The choice is remembered on the device.
      expect(tester.container().read(compareViewProvider).summary, isTrue);
    });

    testWidgets('landscape shows a real table with a spec column', (tester) async {
      await _pump(tester, location: AppRoutes.compare, size: const Size(844, 390));
      expect(find.text('Specification'), findsOneWidget);
      final texts = await _allTexts(tester);
      expect(texts, contains('Electric range'));
      expect(texts, contains('Best'));
      expect(tester.takeException(), isNull);
    });

    for (final (lang, dark) in [('ar', true), ('en', false)]) {
      testWidgets('200% text ($lang, dark: $dark): stacked rows, no overflow', (tester) async {
        await _pump(
          tester,
          language: lang,
          location: AppRoutes.compare,
          bigText: true,
          prefs: {'settings.textScale': 1.6, 'settings.themeMode': dark ? 'dark' : 'light'},
        );
        final texts = await _allTexts(tester);
        expect(tester.takeException(), isNull);
        expect(texts, contains(lang == 'ar' ? 'غير متوفر' : 'Not available'));
        expect(texts, contains(lang == 'ar' ? 'الأفضل' : 'Best'));
        if (lang == 'ar') {
          expect(Directionality.of(tester.element(find.byType(CustomScrollView).first)), TextDirection.rtl);
          expect(texts, contains('ديمو EV ون (تجريبي) · ستاندرد (تجريبي)'), reason: 'car name on each stacked value');
        }
      });
    }

    testWidgets('guest share creates a link; save offers sign-in or a share link', (tester) async {
      final (server, _) = await _pump(tester, location: AppRoutes.compare);
      await tester.tap(find.text('Share link'));
      await tester.pumpAndSettle();
      expect(_shared.single, contains('https://evcar.news/compare/$guestShareId'));
      final sent = server.adapter.requestsTo('POST /comparisons').single;
      expect(sent.headers['Authorization'], isNull);
      expect((sent.data as Map)['items'], [
        {'variantId': bevId, 'modelYear': 2025, 'market': 'EG'},
        {'variantId': phevId, 'modelYear': 2025, 'market': 'EG'},
      ]);

      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(find.text('Save this comparison'), findsOneWidget);
      await tester.tap(find.text('Create a share link instead'));
      await tester.pumpAndSettle();
      expect(_shared, hasLength(2));
    });

    testWidgets('signed-in save stores it in the account and lists saved comparisons', (tester) async {
      final (server, _) = await _pump(
        tester,
        location: AppRoutes.compare,
        tokens: InMemoryTokenStorage(const AuthTokens(accessToken: 'a', refreshToken: 'r')),
      );
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(server.adapter.requestsTo('POST /comparisons').single.headers['Authorization'], 'Bearer a');
      expect(find.text('Comparison saved to your account'), findsOneWidget);

      await tester.tap(find.byTooltip('Saved comparisons'));
      await tester.pumpAndSettle();
      expect(find.text('My weekend shortlist'), findsOneWidget);
    });

    testWidgets('offline without a saved copy shows the offline state', (tester) async {
      await _pump(tester, location: AppRoutes.compare, setup: (s) => s.online = false);
      expect(find.text("You're offline"), findsOneWidget);
    });

    testWidgets('car actions: change opens the picker in replace mode', (tester) async {
      await _pump(tester, location: AppRoutes.compare);
      await tester.tap(find.text('2025 · Plug-in hybrid · EG'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Change trim, year or market'));
      await tester.pumpAndSettle();
      expect(find.text('Change car'), findsOneWidget);
      for (final t in ['ديمو موتورز (تجريبي)', 'ديمو EV ون (تجريبي)', '2025']) {
        await _pick(tester, t);
      }
      // Choosing the other slot's trim + market is refused (no duplicates).
      await _pick(tester, 'ستاندرد (تجريبي)');
      await _pick(tester, 'مصر');
      expect(find.text('This trim and market are already in the comparison'), findsOneWidget);
      expect(_trayKeys(tester), [bevKey, phevKey]);
    });
  });

  group('shared comparison', () {
    testWidgets('deep link opens it; "Edit in Compare" copies the cars into the tray', (tester) async {
      await _pump(tester, location: '/compare/$guestShareId', tray: false);
      expect(find.text('Shared comparison'), findsWidgets);
      expect(find.text('Demo Motors Demo EV One vs Demo Motors Demo EV One'), findsOneWidget);
      expect(find.text('Shared link'), findsOneWidget);
      await tester.tap(find.byTooltip('Share link'));
      await tester.pumpAndSettle();
      expect(_shared.single, endsWith('https://evcar.news/compare/$guestShareId'));

      await tester.ensureVisible(find.text('Edit in Compare'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Edit in Compare'));
      await _settle(tester);
      expect(_trayKeys(tester), [bevKey, phevKey]);
      expect(find.text('2025 · Electric · EG'), findsOneWidget);
    });

    testWidgets('curated comparison in Arabic', (tester) async {
      await _pump(tester, language: 'ar', location: AppRoutes.sharedComparison(curatedShareId), tray: false);
      expect(find.text('[تجريبي] مقارنة تجريبية: كهربائية بالكامل أم هجينة قابلة للشحن'), findsOneWidget);
      expect(find.text('مختارة من المحررين'), findsOneWidget);
    });

    testWidgets('unknown link and links whose cars were unpublished', (tester) async {
      await _pump(tester, location: AppRoutes.sharedComparison('missing-link-1'), tray: false);
      expect(find.text('Comparison not found'), findsOneWidget);

      final body = copyJson(compareFixture('shared_en'));
      final data = body['data'] as Map<String, dynamic>;
      data['result'] = null;
      data['unavailableItems'] = [((data['comparison'] as Map)['items'] as List).first];
      await _pump(
        tester,
        location: AppRoutes.sharedComparison(guestShareId),
        tray: false,
        setup: (s) => s.sharedBody = body,
      );
      expect(find.text('This comparison can no longer be shown'), findsOneWidget);
      expect(find.text('1 car is no longer available'), findsOneWidget);
    });
  });

  group('recommendations', () {
    Future<void> answerWizard(WidgetTester tester) async {
      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();
      expect(find.text('Enter a budget greater than zero'), findsOneWidget);
      await tester.enterText(find.byType(TextField), '2000000');
      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('I can charge at home'));
      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();
      expect(find.text('What matters most?'), findsOneWidget);
      await tester.tap(find.text('Show recommendations'));
      await tester.pumpAndSettle();
    }

    testWidgets('no decisive recommendation → explanation, missing data; ignoring a factor ranks', (tester) async {
      final (server, _) = await _pump(tester, location: AppRoutes.recommendations, tray: false);
      await answerWizard(tester);
      final first = server.adapter.requestsTo('POST /recommendations').single.data as Map;
      expect(first['budget'], 2000000);
      expect(first['homeCharging'], isTrue);
      expect(first.containsKey('weights'), isFalse, reason: 'server derives weights from usage');

      expect(find.text('No decisive recommendation'), findsOneWidget);
      expect(find.textContaining('lack needed data or their data is not comparable'), findsOneWidget);
      final texts = await _allTexts(tester);
      expect(texts, contains('Could not be ranked'));
      expect(texts, contains('Price not available'));
      expect(texts, contains('Weights used'));
      expect(texts.where((t) => t.startsWith('Adjusted to your driving')), isNotEmpty);
      expect(texts.where((t) => t.contains('never change')), isNotEmpty);

      await _toTop(tester);
      await _scrollTo(tester, find.text('Rank without “Trunk space”'));
      await tester.tap(find.text('Rank without “Trunk space”'));
      await tester.pumpAndSettle();
      final second = server.adapter.requestsTo('POST /recommendations').last.data as Map;
      expect((second['weights'] as Map)['space'], 0);
      expect((second['weights'] as Map)['range'], 4, reason: 'keeps the usage-based weights');
      await _toTop(tester);
      final ranked = await _allTexts(tester);
      expect(ranked, contains('Match score: 100 / 100'));
      expect(ranked.where((t) => t.startsWith('Electric range 420 km (WLTP)')), isNotEmpty);
      expect(ranked, isNot(contains('Top pick for you')), reason: 'one comparable car is not a decisive pick');
    });

    testWidgets('Arabic: «لا يمكن الحسم» at 200% text without overflow', (tester) async {
      await _pump(
        tester,
        language: 'ar',
        location: AppRoutes.recommendations,
        tray: false,
        bigText: true,
        prefs: {'settings.textScale': 1.6},
      );
      await tester.enterText(find.byType(TextField), '٢٠٠٠٠٠٠');
      await tester.tap(find.text('التالي'));
      await tester.pumpAndSettle();
      await _scrollTo(tester, find.text('يمكنني الشحن في المنزل'));
      await tester.tap(find.text('يمكنني الشحن في المنزل'));
      for (var i = 0; i < 2; i++) {
        await tester.tap(find.text('التالي'));
        await tester.pumpAndSettle();
      }
      await tester.tap(find.text('عرض الترشيحات'));
      await tester.pumpAndSettle();
      expect(find.text('لا يمكن الحسم'), findsOneWidget);
      await _allTexts(tester);
      expect(tester.takeException(), isNull);
    });
  });
}
