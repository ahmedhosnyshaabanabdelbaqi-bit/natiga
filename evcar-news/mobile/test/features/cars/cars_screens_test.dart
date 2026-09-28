import 'package:dio/dio.dart' show RequestOptions;
import 'package:evcar_news/app/router/app_router.dart';
import 'package:evcar_news/app/router/app_routes.dart';
import 'package:evcar_news/features/cars/presentation/widgets/car_page_parts.dart';
import 'package:evcar_news/shared/compare_tray.dart';
import 'package:evcar_news/shared/widgets/image_with_fallback.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/fake_http_adapter.dart';
import '../../helpers/kit_harness.dart' show FailingImage;
import '../../helpers/test_app.dart';
import 'cars_fixtures.dart';

/// Fake catalog backend built from real (demo-seed) API responses.
class _CarsServer {
  _CarsServer() {
    FakeResponse guard(FakeResponse Function() ok) {
      if (!online) throw const FakeNetworkError();
      return ok();
    }

    String lang(RequestOptions r) => (r.headers['Accept-Language'] as String?) ?? 'en';
    String market(RequestOptions r) =>
        (r.queryParameters['market'] as String?) ?? (r.headers['X-Market'] as String?) ?? 'EG';

    adapter.on('GET /cars', (r) => guard(() => FakeResponse.json(200, fixture(lang(r) == 'ar' ? 'cars_ar' : 'cars'))));
    adapter.on('GET /brands', (_) => guard(() => FakeResponse.json(200, fixture('brands'))));
    adapter.on('GET /brands/demo-motors', (_) => guard(() => FakeResponse.json(200, fixture('brand'))));
    adapter.on(
      'GET /cars/$demoCarSlug',
      (r) => guard(() {
        if (market(r) == 'SA') return FakeResponse.json(200, fixture('car_sa'));
        return FakeResponse.json(200, fixture(lang(r) == 'ar' ? 'car_ar' : 'car'));
      }),
    );
    adapter.on(
      'GET /variants/$demoBevSlug',
      (r) => guard(() {
        if (market(r) == 'SA') return FakeResponse.json(200, fixture('variant_sa'));
        return FakeResponse.json(200, fixture(lang(r) == 'ar' ? 'variant_ar' : 'variant'));
      }),
    );
    adapter.on('GET /variants/$demoPhevSlug', (_) => guard(() => FakeResponse.json(200, fixture('variant_phev'))));
    adapter.on(
      'GET /community/reviews/summary',
      (_) => guard(
        () => FakeResponse.json(200, {
          'data': {
            'count': 0,
            'average': null,
            'distribution': [
              for (final r in [5, 4, 3, 2, 1]) {'rating': r, 'count': 0},
            ],
            'verifiedOwnerCount': 0,
            'dimensions': <Object>[],
          },
        }),
      ),
    );
  }

  final adapter = FakeHttpAdapter();
  bool online = true;
}

final _shared = <String>[];

Future<(_CarsServer, TestAppHarness)> _pump(
  WidgetTester tester, {
  String language = 'en',
  required String location,
  Size size = const Size(360, 780),
  Map<String, Object> prefs = const {},
  Map<String, bool> features = allFeaturesOn,
  bool bigText = false,
}) async {
  tester.view.physicalSize = size * 3;
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  if (bigText) {
    // System 125 % × in-app 160 % = 200 %.
    tester.platformDispatcher.textScaleFactorTestValue = 1.25;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  }
  final server = _CarsServer();
  final harness = await pumpTestApp(
    tester,
    language: language,
    adapter: server.adapter,
    features: features,
    prefs: prefs,
    extraOverrides: [
      networkImageProviderFactory.overrideWithValue((_) => const FailingImage()),
      carShareProvider.overrideWithValue(({required text, required subject}) async => _shared.add(text)),
    ],
  );
  tester.container().read(routerProvider).go(location);
  await tester.pumpAndSettle();
  return (server, harness);
}

/// Opens a car-page tab (the tab bar scrolls, so use its controller).
Future<void> _openTab(WidgetTester tester, String label) async {
  final bar = tester.widget<TabBar>(find.byType(TabBar));
  final index = bar.tabs.indexWhere((t) => t is Tab && t.text == label);
  expect(index, isNot(-1), reason: label);
  bar.controller!.animateTo(index);
  await tester.pumpAndSettle();
}

/// Scrolls the page back to the top, then down until [finder] is visible,
/// and taps it.
Future<void> _tapInPage(WidgetTester tester, Finder finder) async {
  await tester.drag(find.byType(Scrollable).first, const Offset(0, 20000));
  await tester.pumpAndSettle();
  await tester.scrollUntilVisible(finder, 120, scrollable: find.byType(Scrollable).first);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

Future<void> _scrollTo(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(finder, 200, scrollable: find.byType(Scrollable).first);
  await tester.pumpAndSettle();
}

void main() {
  group('catalog', () {
    testWidgets('lists market cars with range cycle, price type, 360° and demo labels', (tester) async {
      final (server, _) = await _pump(tester, location: AppRoutes.cars);
      expect(find.text('Demo EV One'), findsOneWidget);
      expect(find.textContaining('WLTP'), findsWidgets);
      expect(find.text('Demo data'), findsWidgets);
      expect(find.textContaining('Official price'), findsWidgets);
      expect(find.textContaining('Prices and availability for Egypt'), findsOneWidget);
      expect(find.text('1 car'), findsOneWidget);
      // Brand strip.
      expect(find.text('Demo Motors'), findsWidgets);

      // Quick powertrain chip → filtered request.
      await tester.ensureVisible(find.widgetWithText(FilterChip, 'BEV'));
      await tester.tap(find.widgetWithText(FilterChip, 'BEV'));
      await tester.pumpAndSettle();
      expect(server.adapter.requestsTo('GET /cars').last.queryParameters['powertrain'], 'BEV');
    });

    testWidgets('minimum range filter is always sent with its test cycle', (tester) async {
      final (server, _) = await _pump(tester, location: AppRoutes.cars);
      await tester.tap(find.text('Filters'));
      await tester.pumpAndSettle();
      final atLeast400 = find.text('At least 400 km');
      await tester.scrollUntilVisible(atLeast400, 150, scrollable: find.byType(Scrollable).last);
      await tester.tap(atLeast400);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(ChoiceChip, 'EPA'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Apply'));
      await tester.pumpAndSettle();
      final q = server.adapter.requestsTo('GET /cars').last.queryParameters;
      expect(q['minRange'], 400);
      expect(q['rangeCycle'], 'EPA');
    });

    testWidgets('empty result explains and offers to clear filters', (tester) async {
      final (server, _) = await _pump(tester, location: AppRoutes.cars);
      server.adapter.on(
        'GET /cars',
        (_) => FakeResponse.json(200, {
          'data': <Object>[],
          'meta': {'page': 1, 'pageSize': 20, 'total': 0, 'totalPages': 0, 'marketCode': 'EG', 'currencyCode': 'EGP'},
        }),
      );
      await tester.ensureVisible(find.widgetWithText(FilterChip, 'HEV'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilterChip, 'HEV'));
      await tester.pumpAndSettle();
      expect(find.text('No cars match these filters'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Clear filters'));
      await tester.pumpAndSettle();
      expect(server.adapter.requestsTo('GET /cars').last.queryParameters.containsKey('powertrain'), isFalse);
    });

    testWidgets('offline without a cached copy shows the offline state', (tester) async {
      final server = _CarsServer()..online = false;
      tester.view.physicalSize = const Size(360, 780) * 3;
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await pumpTestApp(tester, language: 'en', adapter: server.adapter, features: allFeaturesOn);
      tester.container().read(routerProvider).go(AppRoutes.cars);
      await tester.pumpAndSettle();
      expect(find.text("You're offline"), findsOneWidget);
      expect(find.text('Try again'), findsOneWidget);
    });
  });

  group('brands', () {
    testWidgets('brands list and brand page', (tester) async {
      await _pump(tester, location: AppRoutes.brands);
      expect(find.text('Demo Motors'), findsWidgets);
      expect(find.text('1 model'), findsOneWidget);
      await tester.tap(find.widgetWithText(ListTile, 'Demo Motors'));
      await tester.pumpAndSettle();
      expect(find.text('Models in Egypt'), findsOneWidget);
      expect(find.text('Demo EV One'), findsOneWidget);
    });
  });

  group('car page', () {
    testWidgets('explicit market / year / trim selection; nothing mixed', (tester) async {
      final (server, _) = await _pump(tester, location: AppRoutes.car(demoCarSlug));
      expect(find.text('Choose the exact version'), findsOneWidget);
      expect(find.widgetWithText(ChoiceChip, '2025'), findsOneWidget);
      expect(find.widgetWithText(ChoiceChip, 'Standard (demo) · BEV'), findsOneWidget);
      expect(server.adapter.requestsTo('GET /variants/$demoBevSlug').last.queryParameters['market'], 'EG');
      // Missing values say so (0–100 is null in the demo data).
      await _scrollTo(tester, find.text('0–100 km/h'));
      expect(find.text('Not available'), findsWidgets);
      // Prominent 360° card for the BEV trim.
      await _scrollTo(tester, find.text('360° interior tour'));
      expect(find.text('Start the tour'), findsOneWidget);

      // Switch to the PHEV trim → its own sheet, no tour.
      await _tapInPage(tester, find.widgetWithText(ChoiceChip, 'Standard (demo) · PHEV'));
      expect(server.adapter.requestsTo('GET /variants/$demoPhevSlug'), isNotEmpty);
      await _scrollTo(tester, find.text('The interior tour is not available for this trim'));
      expect(find.text('Start the tour'), findsNothing);
      // No local price for this trim in the demo data: said plainly, never 0.
      await tester.scrollUntilVisible(
        find.text('Price not available'),
        -200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Price not available'), findsOneWidget);
    });

    testWidgets('a market where the car is not sold says so', (tester) async {
      final (server, _) = await _pump(tester, location: AppRoutes.car(demoCarSlug));
      await _tapInPage(tester, find.widgetWithText(ChoiceChip, 'Saudi Arabia (not sold)'));
      expect(server.adapter.requestsTo('GET /cars/$demoCarSlug').last.queryParameters['market'], 'SA');
      expect(find.text('Not sold in this market'), findsOneWidget);
      expect(find.textContaining('This car is listed in: Egypt'), findsOneWidget);
    });

    testWidgets('compare, share and save offline act on the selected trim + market', (tester) async {
      _shared.clear();
      final (server, harness) = await _pump(tester, location: AppRoutes.car(demoCarSlug));
      await _tapInPage(tester, find.text('Add to compare'));
      final tray = tester.container().read(compareTrayProvider);
      expect(tray.single.variantId, demoBevId);
      expect(tray.single.marketCode, 'EG');
      expect(tray.single.modelYear, 2025);

      await _tapInPage(tester, find.text('Share'));
      expect(_shared.single, contains('https://evcar.news/cars/$demoCarSlug'));

      await _tapInPage(tester, find.text('Save specs offline'));
      await _scrollTo(tester, find.text('Remove offline copy'));
      expect(find.text('Remove offline copy'), findsOneWidget);
      expect(find.textContaining('Saved on'), findsOneWidget);

      // Offline, without the automatic cache: the saved copy opens, dated.
      await harness.cache.clear();
      server.online = false;
      // Leave the car page first so its in-memory sheet is disposed.
      tester.container().read(routerProvider).go(AppRoutes.brands);
      await tester.pumpAndSettle();
      tester.container().read(routerProvider).go(AppRoutes.variant(demoBevSlug));
      await tester.pumpAndSettle();
      expect(find.textContaining('Saved copy from'), findsOneWidget);
      expect(find.text('Demo Motors'), findsWidgets);
    });

    testWidgets('specs tab: cycle labels, charging curve, source details', (tester) async {
      await _pump(tester, location: AppRoutes.car(demoCarSlug));
      await _openTab(tester, 'Specifications');
      expect(find.text('Range & consumption'), findsOneWidget);
      expect(find.text('WLTP'), findsWidgets);
      await _scrollTo(tester, find.text('Charging times'));
      expect(find.textContaining('10%–80%'), findsWidgets);
      await _scrollTo(tester, find.byType(LineChart));
      expect(find.byType(LineChart), findsOneWidget);
      await _scrollTo(tester, find.text('Show as a table'));
      await tester.tap(find.text('Show as a table'));
      await tester.pumpAndSettle();
      expect(find.text('State of charge'), findsOneWidget);
      // Tap a source → details sheet.
      await _tapInPage(tester, find.textContaining('Source: Demo data (fictional)').first);
      expect(find.text('Data source'), findsOneWidget);
      expect(find.text('Publisher'), findsOneWidget);
    });

    testWidgets('owner reviews tab: honest empty state', (tester) async {
      await _pump(tester, location: AppRoutes.car(demoCarSlug));
      await _openTab(tester, 'Owner reviews');
      expect(find.text('No owner reviews for this trim yet'), findsOneWidget);
      expect(find.text('Write a review'), findsOneWidget);
    });

    testWidgets('owner reviews tab without the community feature', (tester) async {
      await _pump(tester, location: AppRoutes.car(demoCarSlug), features: {...allFeaturesOn, 'community': false});
      await _openTab(tester, 'Owner reviews');
      expect(find.text('Owner reviews are not available yet'), findsOneWidget);
    });

    testWidgets('360° tab: prominent tour card with seat views; gallery fallback', (tester) async {
      await _pump(tester, location: AppRoutes.car(demoCarSlug));
      await _openTab(tester, '360° tour');
      expect(find.text('360° interior tour'), findsOneWidget);
      expect(find.textContaining('Driver seat (demo)'), findsWidgets);
      expect(find.text('Demo data'), findsWidgets);
    });

    testWidgets('competitors tab: honest empty state', (tester) async {
      await _pump(tester, location: AppRoutes.car(demoCarSlug));
      await _openTab(tester, 'Competitors');
      expect(find.text('No competitors listed'), findsOneWidget);
    });

    testWidgets('unknown car → not found state', (tester) async {
      final (server, _) = await _pump(tester, location: AppRoutes.cars);
      server.adapter.on('GET /cars/no-such-car', (_) => FakeResponse.error(404, 'NOT_FOUND', message: 'Car not found'));
      tester.container().read(routerProvider).go(AppRoutes.car('no-such-car'));
      await tester.pumpAndSettle();
      expect(find.text('Car details'), findsWidgets);
      expect(find.textContaining('not found'), findsWidgets);
      expect(find.byType(TabBar), findsNothing);
    });
  });

  group('layouts', () {
    for (final (lang, dark) in [('ar', true), ('en', false)]) {
      testWidgets('car page tabs at 200% text ($lang, dark: $dark) do not overflow', (tester) async {
        await _pump(
          tester,
          language: lang,
          location: AppRoutes.car(demoCarSlug),
          bigText: true,
          prefs: {'settings.textScale': 1.6, 'settings.themeMode': dark ? 'dark' : 'light'},
        );
        final tabs = tester.widget<TabBar>(find.byType(TabBar)).controller!;
        for (var i = 0; i < 6; i++) {
          tabs.animateTo(i);
          await tester.pumpAndSettle();
          // Scroll through the whole tab.
          final scrollable = find.byType(Scrollable).first;
          for (var s = 0; s < 12; s++) {
            await tester.drag(scrollable, const Offset(0, -500));
            await tester.pump();
          }
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull, reason: 'tab $i');
          await tester.drag(scrollable, const Offset(0, 20000));
          await tester.pumpAndSettle();
        }
      });

      testWidgets('catalog and variant sheet at 200% text ($lang) do not overflow', (tester) async {
        await _pump(
          tester,
          language: lang,
          location: AppRoutes.cars,
          bigText: true,
          prefs: {'settings.textScale': 1.6, 'settings.themeMode': dark ? 'dark' : 'light'},
        );
        expect(tester.takeException(), isNull);
        tester.container().read(routerProvider).go(AppRoutes.variant(demoBevSlug));
        await tester.pumpAndSettle();
        final scrollable = find.byType(Scrollable).first;
        for (var s = 0; s < 20; s++) {
          await tester.drag(scrollable, const Offset(0, -500));
          await tester.pump();
        }
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('landscape shows the spec table', (tester) async {
      await _pump(tester, location: AppRoutes.variant(demoBevSlug), size: const Size(800, 400));
      final header = find.text('Reliability');
      await tester.scrollUntilVisible(header.first, 300, scrollable: find.byType(Scrollable).first);
      expect(find.byType(Table), findsWidgets);
      expect(find.text('Specification'), findsWidgets);
      expect(tester.takeException(), isNull);
    });
  });
}
