import 'dart:async';

import 'package:dio/dio.dart' show RequestOptions;
import 'package:evcar_news/app/router/app_router.dart';
import 'package:evcar_news/app/router/app_routes.dart';
import 'package:evcar_news/core/auth/auth_tokens.dart';
import 'package:evcar_news/core/auth/token_storage.dart';
import 'package:evcar_news/features/charging/application/charging_providers.dart';
import 'package:evcar_news/features/charging/data/location_service.dart';
import 'package:evcar_news/features/charging/domain/station_query.dart';
import 'package:evcar_news/features/encyclopedia/presentation/encyclopedia_entry_screen.dart';
import 'package:evcar_news/features/encyclopedia/presentation/encyclopedia_screen.dart';
import 'package:evcar_news/features/favorites/presentation/favorites_screen.dart';
import 'package:evcar_news/features/home/presentation/home_screen.dart';
import 'package:evcar_news/features/home/presentation/widgets/home_sections.dart';
import 'package:evcar_news/features/search/presentation/search_screen.dart';
import 'package:evcar_news/features/services_directory/presentation/service_provider_screen.dart';
import 'package:evcar_news/features/services_directory/presentation/services_directory_screen.dart';
import 'package:evcar_news/shared/favorites/favorite_item.dart';
import 'package:evcar_news/shared/favorites/favorites_controller.dart';
import 'package:evcar_news/shared/widgets/image_with_fallback.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/fake_http_adapter.dart';
import '../../helpers/kit_harness.dart' show FailingImage;
import '../../helpers/test_app.dart';
import 'discovery_fixtures.dart';

/// Fake discovery backend serving the responses captured from the real
/// backend (demo seed, fictional rows). [online] = false makes every
/// request a transport failure.
class _Server {
  _Server({required this.language}) {
    String lang(RequestOptions r) =>
        r.queryParameters['lang'] as String? ?? r.headers['Accept-Language'] as String? ?? language;
    FakeResponse fx(String base, RequestOptions r) {
      if (!online) throw const FakeNetworkError();
      return FakeResponse.json(200, discoveryFixture('${base}_${lang(r).startsWith('ar') ? 'ar' : 'en'}'));
    }

    adapter.on('GET /home', (r) {
      homeRequests.add(Map.of(r.queryParameters));
      if (!online) throw const FakeNetworkError();
      final withPoint = r.queryParameters.containsKey('lat');
      return FakeResponse.json(
        200,
        discoveryFixture(withPoint ? 'home_nearby_en' : 'home_${lang(r).startsWith('ar') ? 'ar' : 'en'}'),
      );
    });
    adapter.on('GET /search/suggest', (r) {
      suggestRequests.add(r.queryParameters['q'] as String);
      if (!online) throw const FakeNetworkError();
      return FakeResponse.json(200, discoveryFixture('suggest_en'));
    });
    adapter.on('GET /search', (r) {
      searchRequests.add(Map.of(r.queryParameters));
      return fx('search', r);
    });
    adapter.on('GET /encyclopedia/categories', (r) => fx('encyclopedia_categories', r));
    adapter.on('GET /encyclopedia', (r) => fx('encyclopedia_list', r));
    adapter.on('GET /encyclopedia/demo-encyclopedia-entry', (r) => fx('encyclopedia_entry', r));
    adapter.on('GET /services/types', (r) => fx('services_types', r));
    adapter.on('GET /services', (r) {
      servicesRequests.add(Map.of(r.queryParameters));
      if (!online) throw const FakeNetworkError();
      return FakeResponse.json(
        200,
        servicesList ?? discoveryFixture('services_list_${lang(r).startsWith('ar') ? 'ar' : 'en'}'),
      );
    });
    adapter.on('GET /services/demo-service-centre', (r) => fx('service_detail', r));
    adapter.on('GET /services/test-verified-centre', (r) {
      if (!online) throw const FakeNetworkError();
      return FakeResponse.json(200, {'data': _verifiedSponsored(detail: true)});
    });
  }

  final String language;
  final adapter = FakeHttpAdapter();
  bool online = true;
  Map<String, dynamic>? servicesList;
  final homeRequests = <Map<String, dynamic>>[];
  final searchRequests = <Map<String, dynamic>>[];
  final suggestRequests = <String>[];
  final servicesRequests = <Map<String, dynamic>>[];
}

/// A fictional non-demo provider with verified contacts and a sponsorship,
/// built from the captured demo row (test-only data).
Map<String, dynamic> _verifiedSponsored({bool detail = false}) {
  final base = copyJson(
    (detail
            ? discoveryFixture('service_detail_en')['data']
            : (discoveryFixture('services_list_en')['data'] as List).first)
        as Map<String, dynamic>,
  );
  return {
    ...base,
    'id': 'd0000000-0000-4000-8000-0000000000aa',
    'slug': 'test-verified-centre',
    'name': 'Test Verified Centre',
    'isDemo': false,
    'latitude': 30.05,
    'longitude': 31.24,
    'isSponsored': true,
    'sponsorLabel': 'Sponsored',
    'contact': {
      'phone': '+20 100 000 0000',
      'whatsapp': null,
      'email': null,
      'websiteUrl': 'https://example.com',
      'verified': true,
      'verifiedAt': '2026-03-03T10:00:00.000Z',
      'stale': false,
      'label': 'Verified on 3 March 2026',
    },
  };
}

Future<_Server> _pump(
  WidgetTester tester, {
  String language = 'en',
  required String location,
  double textScale = 1,
  bool dark = false,
  bool signedIn = false,
  FakeLocationService? locationService,
  void Function(_Server server)? setup,
}) async {
  tester.view.physicalSize = const Size(360, 780) * 3;
  tester.view.devicePixelRatio = 3;
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  if (dark) tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearAllTestValues);
  final server = _Server(language: language);
  setup?.call(server);
  await pumpTestApp(
    tester,
    language: language,
    adapter: server.adapter,
    features: allFeaturesOn,
    tokens: signedIn ? InMemoryTokenStorage(const AuthTokens(accessToken: 'a', refreshToken: 'r')) : null,
    prefs: dark ? const {'settings.themeMode': 'dark'} : const {},
    extraOverrides: [
      locationServiceProvider.overrideWithValue(locationService ?? FakeLocationService()),
      chargingClockProvider.overrideWithValue(() => DateTime.utc(2026, 9, 25, 12)),
      networkImageProviderFactory.overrideWithValue((_) => const FailingImage()),
    ],
  );
  tester.container().read(routerProvider).go(location);
  await tester.pumpAndSettle();
  return server;
}

/// The first vertical scrollable (the page's list, not a chip row).
Finder _mainList() =>
    find.byWidgetPredicate((w) => w is Scrollable && axisDirectionToAxis(w.axisDirection) == Axis.vertical).first;

void main() {
  group('home', () {
    for (final lang in ['en', 'ar']) {
      testWidgets('server sections in order, prominent tours strip, location prompt ($lang)', (tester) async {
        final server = await _pump(tester, language: lang, location: AppRoutes.home);
        final en = lang == 'en';
        expect(find.byType(HomeScreen), findsOneWidget);
        expect(server.homeRequests.single.containsKey('lat'), isFalse, reason: 'no location without permission');
        // Top story (hero) first.
        final hero =
            (((discoveryFixture('home_$lang')['data'] as Map)['sections'] as List).first as Map)['items'] as List;
        expect(find.text((hero.first as Map)['title'] as String, findRichText: true), findsWidgets);
        // The 360° strip has its own intro and "all tours" link.
        await tester.scrollUntilVisible(
          find.text(en ? 'All 360° tours' : 'كل الجولات 360°'),
          300,
          scrollable: _mainList(),
        );
        if (en) expect(find.text('Step inside the cabin and look around, seat by seat.'), findsOneWidget);
        // Nearby stations: a prompt (allow location / choose a city), never guessed.
        await tester.scrollUntilVisible(find.byType(NearbyPromptCard), 300, scrollable: _mainList());
        expect(find.byType(NearbyPromptCard), findsOneWidget);
        // Empty sections (latest news, reviews in the demo seed) are hidden, not shown as zero.
        expect(find.text('0'), findsNothing);
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('sections render in the order sent by the server', (tester) async {
      await _pump(tester, location: AppRoutes.home);
      final seen = <String>[];
      const keys = [
        'top_story',
        'interior_tours',
        'new_cars',
        'featured_comparisons',
        'nearby_stations',
        'charging_guides',
      ];
      for (var i = 0; i < 15; i++) {
        for (final key in keys) {
          if (!seen.contains(key) && find.byKey(ValueKey('home-section-$key')).evaluate().isNotEmpty) seen.add(key);
        }
        await tester.drag(_mainList(), const Offset(0, -250));
        await tester.pumpAndSettle();
      }
      expect(seen, keys);
    });

    testWidgets('granted location: point is rounded and nearby stations show', (tester) async {
      final loc = FakeLocationService(access: LocationAccess.granted, position: const GeoPoint(30.044412, 31.235712));
      final server = await _pump(tester, location: AppRoutes.home, locationService: loc);
      await tester.pumpAndSettle();
      final withPoint = server.homeRequests.where((q) => q.containsKey('lat')).toList();
      expect(withPoint, isNotEmpty);
      expect(withPoint.last['lat'], '30.044');
      expect(withPoint.last['lng'], '31.236');
      // Already granted: located without a tap (request() returns at once, no dialog).
      await tester.scrollUntilVisible(
        find.textContaining('Demo Charging Station', findRichText: true),
        300,
        scrollable: _mainList(),
      );
      expect(find.textContaining('Demo Charging Station', findRichText: true), findsWidgets);
      expect(tester.takeException(), isNull);
    });

    testWidgets('offline: last copy with its date, stations stripped', (tester) async {
      final server = await _pump(tester, location: AppRoutes.home);
      server.online = false;
      final container = tester.container();
      unawaited(tester.state<RefreshIndicatorState>(find.byType(RefreshIndicator).first).show());
      await tester.pumpAndSettle();
      // Content still there, with a visible notice (never a silent stale page).
      expect(find.textContaining('Saved copy from', findRichText: true), findsOneWidget);
      expect(find.textContaining('it may not be up to date', findRichText: true), findsOneWidget);
      expect(find.textContaining('[DEMO] Sample article', findRichText: true), findsWidgets);
      expect(container.read(routerProvider).state.uri.path, AppRoutes.home);
      expect(tester.takeException(), isNull);
    });

    testWidgets('Arabic, dark, 200% text: no overflow', (tester) async {
      await _pump(tester, language: 'ar', location: AppRoutes.home, textScale: 2, dark: true);
      for (var i = 0; i < 12; i++) {
        await tester.drag(_mainList(), const Offset(0, -400));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      }
    });
  });

  group('search', () {
    testWidgets('debounced suggestions, grouped results, recent searches', (tester) async {
      final server = await _pump(tester, location: AppRoutes.search());
      expect(find.byType(SearchScreen), findsOneWidget);
      expect(find.text('Search everything'), findsOneWidget);

      await tester.enterText(find.byType(TextField), 'd');
      await tester.enterText(find.byType(TextField), 'de');
      await tester.enterText(find.byType(TextField), 'demo');
      await tester.pump(const Duration(milliseconds: 100));
      expect(server.suggestRequests, isEmpty, reason: 'debounced');
      await tester.pumpAndSettle(const Duration(milliseconds: 300));
      expect(server.suggestRequests, ['demo'], reason: 'only the last text is sent');
      expect(find.text('Search for “demo”'), findsOneWidget);
      expect(find.byType(RichText), findsWidgets);

      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pumpAndSettle();
      expect(server.searchRequests.last['q'], 'demo');
      // Groups in fixed order, empty groups hidden, counts shown.
      expect(find.text('4 results'), findsOneWidget);
      expect(find.textContaining('[DEMO] Demo Charging Station', findRichText: true), findsWidgets);
      // A subtitle repeating the (highlighted) snippet is not shown twice.
      expect(find.text('Station · Demo address — not a real place'), findsNothing);
      expect(find.text('Station'), findsWidgets);
      await tester.scrollUntilVisible(
        find.textContaining('[DEMO] Demo service centre', findRichText: true),
        200,
        scrollable: _mainList(),
      );
      expect(find.text('Service · Service centre'), findsOneWidget);
      expect(find.text('Service · Service centre · Service centre'), findsNothing);
      expect(tester.takeException(), isNull);

      // Recent searches (device only), clearable.
      await tester.tap(find.byTooltip('Clear search'));
      await tester.pumpAndSettle();
      expect(find.text('Recent searches'), findsOneWidget);
      expect(find.text('demo'), findsWidgets);
      await tester.tap(find.text('Clear all'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Clear all').last);
      await tester.pumpAndSettle();
      expect(find.text('Recent searches'), findsNothing);
    });

    testWidgets('initial query from the route runs immediately', (tester) async {
      final server = await _pump(tester, location: AppRoutes.search(query: 'demo'));
      expect(server.searchRequests.single['q'], 'demo');
      expect(find.text('4 results'), findsOneWidget);
    });

    testWidgets('a query without letters or digits is not sent', (tester) async {
      final server = await _pump(tester, location: AppRoutes.search());
      await tester.enterText(find.byType(TextField), '!!!');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pumpAndSettle(const Duration(milliseconds: 300));
      expect(server.searchRequests, isEmpty);
      expect(server.suggestRequests, isEmpty);
      expect(find.text('Type at least one letter or number.'), findsOneWidget);
    });

    testWidgets('offline search shows the offline state, not "no results"', (tester) async {
      final server = await _pump(tester, location: AppRoutes.search(), setup: (s) => s.online = true);
      server.online = false;
      server.adapter.on('GET /search', (_) => throw const FakeNetworkError());
      await tester.enterText(find.byType(TextField), 'demo');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pumpAndSettle();
      expect(find.text('No results'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  });

  group('favorites', () {
    testWidgets('guest: device favorites per tab, sign-in hint, empty tabs explain', (tester) async {
      await _pump(tester, location: AppRoutes.favorites);
      expect(find.byType(FavoritesScreen), findsOneWidget);
      expect(find.text('No favorite articles yet'), findsOneWidget);
      final notifier = tester.container().read(favoritesProvider.notifier);
      await notifier.toggle(
        FavoriteItem(
          key: const FavoriteKey(FavoriteType.article, 'd0000000-0000-4000-8000-000000000021'),
          title: '[DEMO] Sample article for testing the news layout',
          route: AppRoutes.article('demo-sample-article'),
          savedAt: DateTime.utc(2026, 9, 20),
          isDemo: true,
        ),
      );
      await notifier.toggle(
        const FavoriteItem(
          key: FavoriteKey(FavoriteType.station, 'd0000000-0000-4000-8000-000000000031'),
          title: '[DEMO] Demo Charging Station (fictional)',
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Saved on this device. Sign in to keep them in your account on every device.'), findsOneWidget);
      expect(find.text('Articles (1)'), findsOneWidget);
      expect(find.text('Stations (1)'), findsOneWidget);
      expect(find.text('[DEMO] Sample article for testing the news layout'), findsOneWidget);
      expect(find.text('Demo data'), findsWidgets);

      await tester.ensureVisible(find.text('Stations (1)'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Stations (1)'));
      await tester.pumpAndSettle();
      expect(find.text('[DEMO] Demo Charging Station (fictional)'), findsOneWidget);

      // Remove with undo.
      await tester.tap(find.byIcon(Icons.favorite).last);
      await tester.pumpAndSettle();
      expect(find.text('No favorite stations yet'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('signed in: device favorites are merged, then the account list is shown', (tester) async {
      await _pump(
        tester,
        location: AppRoutes.favorites,
        signedIn: true,
        setup: (s) {
          s.adapter.on(
            'GET /me',
            (_) => FakeResponse.json(200, {
              'data': {
                'id': 'u1',
                'email': 'test@example.com',
                'displayName': 'Test',
                'emailVerified': true,
                'roles': <String>[],
                'permissions': <String>[],
                'language': 'en',
                'createdAt': '2026-01-01T00:00:00Z',
              },
            }),
          );
          s.adapter.on('GET /me/favorites', (_) => FakeResponse.json(200, discoveryFixture('favorites_list_en')));
          s.adapter.on('POST /me/favorites/merge', (_) => FakeResponse.json(200, discoveryFixture('favorites_merge')));
        },
      );
      await tester.pumpAndSettle();
      expect(find.text('Articles (1)'), findsOneWidget);
      expect(find.text('Comparisons (1)'), findsOneWidget);
      expect(find.text('Stations (1)'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('encyclopedia', () {
    for (final lang in ['en', 'ar']) {
      testWidgets('categories, reviewed badge, entry with safety notice ($lang)', (tester) async {
        await _pump(tester, language: lang, location: AppRoutes.encyclopedia);
        expect(find.byType(EncyclopediaScreen), findsOneWidget);
        final en = lang == 'en';
        final title = en ? '[DEMO] Sample encyclopedia entry' : null;
        if (title != null) expect(find.text(title), findsOneWidget);
        expect(
          find.textContaining(en ? 'Reviewed by a technical specialist' : 'راجعه', findRichText: true),
          findsWidgets,
        );

        unawaited(tester.container().read(routerProvider).push(AppRoutes.encyclopediaEntry('demo-encyclopedia-entry')));
        await tester.pumpAndSettle();
        expect(find.byType(EncyclopediaEntryScreen), findsOneWidget);
        await tester.scrollUntilVisible(
          find.textContaining(en ? 'qualified, licensed electrician' : 'كهربائي', findRichText: true).first,
          200,
          scrollable: _mainList(),
        );
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('unknown entry: its own "not available" state with a way back', (tester) async {
      await _pump(
        tester,
        location: AppRoutes.encyclopediaEntry('missing-entry'),
        setup: (s) => s.adapter.on(
          'GET /encyclopedia/missing-entry',
          (_) => FakeResponse.json(404, discoveryFixture('encyclopedia_404')),
        ),
      );
      expect(find.text("This guide isn't available"), findsOneWidget);
      await tester.tap(find.text('Browse the encyclopedia'));
      await tester.pumpAndSettle();
      expect(find.byType(EncyclopediaScreen), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('200% text: list and entry do not overflow', (tester) async {
      await _pump(tester, location: AppRoutes.encyclopediaEntry('demo-encyclopedia-entry'), textScale: 2);
      for (var i = 0; i < 6; i++) {
        await tester.drag(_mainList(), const Offset(0, -400));
        await tester.pumpAndSettle();
      }
      expect(tester.takeException(), isNull);
    });
  });

  group('services directory', () {
    testWidgets('type chips, demo entry without contact actions, verification label', (tester) async {
      final server = await _pump(tester, location: AppRoutes.services);
      expect(find.byType(ServicesDirectoryScreen), findsOneWidget);
      expect(find.textContaining('[DEMO] Demo service centre', findRichText: true), findsWidgets);
      expect(find.text('Contact details have not been verified'), findsWidgets, reason: 'server label');
      expect(
        find.text('Ordered by verified contact details first, then name. Sponsorship never changes this order.'),
        findsOneWidget,
      );
      expect(find.text('Call'), findsNothing, reason: 'demo numbers are never dialled');

      await tester.ensureVisible(find.text('Open now'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open now'));
      await tester.pumpAndSettle();
      expect(server.servicesRequests.last['openNow'], 'true');
      expect(tester.takeException(), isNull);
    });

    testWidgets('sponsored entries are labelled and shown in their own slot; verified date', (tester) async {
      await _pump(
        tester,
        location: AppRoutes.services,
        setup: (s) {
          final list = copyJson(discoveryFixture('services_list_en'));
          final item = _verifiedSponsored();
          list['data'] = [item, ...(list['data'] as List)];
          (list['meta'] as Map)['sponsored'] = [item];
          (list['meta'] as Map)['total'] = 2;
          s.servicesList = list;
        },
      );
      expect(find.text('Sponsored listings'), findsOneWidget);
      expect(find.text('Test Verified Centre'), findsWidgets);
      expect(find.text('Sponsored by Sponsored', findRichText: true), findsNothing);
      expect(find.textContaining('Sponsored', findRichText: true), findsWidgets);
      // The editorial entry keeps its normal place below the slot, labelled too.
      await tester.scrollUntilVisible(find.text('Call'), 200, scrollable: _mainList());
      expect(find.text('Website'), findsWidgets);
      expect(tester.takeException(), isNull);
    });

    testWidgets('detail: hours with unknown days, call/website/directions', (tester) async {
      await _pump(tester, location: AppRoutes.serviceProvider('test-verified-centre'));
      expect(find.byType(ServiceProviderScreen), findsOneWidget);
      expect(find.text('Call'), findsWidgets);
      expect(find.text('Website'), findsWidgets);
      expect(find.text('Directions'), findsOneWidget);
      expect(find.textContaining('This listing is sponsored.', findRichText: true), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Friday'), 200, scrollable: _mainList());
      expect(find.text('Not available'), findsWidgets, reason: 'unknown hours are never shown as closed');
      expect(tester.takeException(), isNull);
    });

    testWidgets('unknown provider: its own "not listed" state with a way back', (tester) async {
      await _pump(
        tester,
        location: AppRoutes.serviceProvider('missing-provider'),
        setup: (s) => s.adapter.on(
          'GET /services/missing-provider',
          (_) => FakeResponse.error(404, 'SERVICE_PROVIDER_NOT_FOUND', message: 'Not found'),
        ),
      );
      expect(find.text("This provider isn't listed anymore"), findsOneWidget);
      await tester.tap(find.text('Browse the directory'));
      await tester.pumpAndSettle();
      expect(find.byType(ServicesDirectoryScreen), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('location denied: near me explains and offers a city instead', (tester) async {
      final loc = FakeLocationService(access: LocationAccess.denied);
      final server = await _pump(tester, location: AppRoutes.services, locationService: loc);
      await tester.tap(find.text('Near me'));
      await tester.pumpAndSettle();
      expect(loc.requests, 1);
      expect(server.servicesRequests.every((q) => !q.containsKey('lat')), isTrue);
      expect(find.text('Choose a city'), findsWidgets);
      expect(tester.takeException(), isNull);
    });
  });
}
