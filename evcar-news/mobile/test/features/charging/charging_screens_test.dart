import 'dart:typed_data';

import 'package:evcar_news/app/router/app_router.dart';
import 'package:evcar_news/app/router/app_routes.dart';
import 'package:evcar_news/core/auth/auth_tokens.dart';
import 'package:evcar_news/core/auth/token_storage.dart';
import 'package:evcar_news/features/charging/application/charging_providers.dart';
import 'package:evcar_news/features/charging/data/location_service.dart';
import 'package:evcar_news/features/charging/domain/station_query.dart';
import 'package:evcar_news/features/charging/presentation/charging_location_screen.dart';
import 'package:evcar_news/features/charging/presentation/charging_screen.dart';
import 'package:evcar_news/features/charging/presentation/station_detail_screen.dart';
import 'package:evcar_news/features/charging/presentation/widgets/station_card.dart';
import 'package:evcar_news/features/charging/presentation/widgets/stations_map.dart';
import 'package:evcar_news/shared/widgets/cached_data_notice.dart';
import 'package:evcar_news/shared/widgets/sign_in_required_view.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/fake_http_adapter.dart';
import '../../helpers/test_app.dart';
import 'charging_fixtures.dart';

/// Device location without the plugin.
class FakeLocationService implements LocationService {
  FakeLocationService({
    this.checkResult = LocationAccess.denied,
    this.requestResult = LocationAccess.denied,
    this.position,
  });

  LocationAccess checkResult;
  LocationAccess requestResult;
  GeoPoint? position;
  int requests = 0;
  int settingsOpened = 0;

  @override
  Future<LocationAccess> check() async => checkResult;

  @override
  Future<LocationAccess> request() async {
    requests++;
    return requestResult;
  }

  @override
  Future<GeoPoint?> currentPosition() async => position;

  @override
  Future<bool> openAppSettings() async {
    settingsOpened++;
    return true;
  }

  @override
  Future<bool> openLocationSettings() async {
    settingsOpened++;
    return true;
  }
}

/// Offline tiles for the map test (1×1 transparent PNG).
class _MemoryTileProvider extends TileProvider {
  static final _png = Uint8List.fromList(const [
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, //
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82,
  ]);

  @override
  ImageProvider getImage(TileCoordinates coordinates, TileLayer options) => MemoryImage(_png);
}

/// Fake stations backend built from real captured responses.
class _Server {
  _Server({this.language = 'en'}) {
    adapter.on('GET /stations', (req) {
      searches.add(req.queryParameters.map((k, v) => MapEntry(k, '$v')));
      if (!online) throw const FakeNetworkError();
      if (req.queryParameters.containsKey('vehicleVariantId') || req.queryParameters.containsKey('userVehicleId')) {
        return FakeResponse.error(
          422,
          'VEHICLE_COMPATIBILITY_UNKNOWN',
          message: 'There is no verified charging-inlet data for this trim in this market.',
        );
      }
      return FakeResponse.json(200, chargingFixture(language == 'ar' ? 'list_ar' : 'list_en'));
    });
    adapter.on('GET /stations/meta', (_) {
      if (!online) throw const FakeNetworkError();
      return FakeResponse.json(200, chargingFixture(language == 'ar' ? 'meta_ar' : 'meta_en'));
    });
    adapter.on('GET /stations/clusters', (_) => FakeResponse.json(200, chargingFixture('clusters')));
    adapter.on('GET /stations/$demoStationId', (_) {
      if (!online) throw const FakeNetworkError();
      return FakeResponse.json(200, chargingFixture(language == 'ar' ? 'detail_ar' : 'detail_community_en'));
    });
    adapter.on('GET /stations/$demoStation2Id', (_) {
      if (!online) throw const FakeNetworkError();
      return FakeResponse.json(200, chargingFixture('detail2_ar'));
    });
    adapter.on(
      'GET /stations/merged-one',
      (_) => FakeResponse.error(404, 'STATION_MERGED', message: 'Merged', details: {'mergedIntoId': demoStationId}),
    );
    adapter.on('GET /me', (_) => FakeResponse.json(200, {'data': fakeUserJson()}));
    adapter.on('GET /me/vehicles', (_) => FakeResponse.json(200, {'data': <Object>[]}));
    adapter.on('POST /stations/$demoStationId/reports', (req) {
      reportBodies.add(req.data);
      if (reportBodies.length == 1) {
        return FakeResponse.error(
          409,
          'STATION_REPORT_DUPLICATE',
          message: 'You already have an open report of this type.',
        );
      }
      return FakeResponse.json(201, {
        'data': {'id': 'r1', 'status': 'open'},
      });
    });
  }

  final String language;
  final adapter = FakeHttpAdapter();
  final searches = <Map<String, String>>[];
  final reportBodies = <Object?>[];
  bool online = true;
}

Map<String, dynamic> _configWithMap() {
  final json = fakeAppConfigJson(features: allFeaturesOn);
  (json['data'] as Map<String, dynamic>)['map'] = {
    'tileUrlTemplate': 'https://tiles.test/{z}/{x}/{y}.png',
    'attribution': '© Test tiles contributors',
    'maxZoom': 18,
    'configured': true,
  };
  return json;
}

Future<(_Server, FakeLocationService)> _pump(
  WidgetTester tester, {
  String language = 'en',
  String location = AppRoutes.charging,
  FakeLocationService? locationService,
  bool signedIn = false,
  bool mapConfigured = false,
  double textScale = 1,
  bool dark = false,
}) async {
  tester.view.physicalSize = const Size(360, 780) * 3;
  tester.view.devicePixelRatio = 3;
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  if (dark) tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearAllTestValues);
  final server = _Server(language: language);
  if (mapConfigured) server.adapter.on('GET /app-config', (_) => FakeResponse.json(200, _configWithMap()));
  final loc = locationService ?? FakeLocationService();
  await pumpTestApp(
    tester,
    language: language,
    adapter: server.adapter,
    features: allFeaturesOn,
    tokens: signedIn ? InMemoryTokenStorage(const AuthTokens(accessToken: 'a', refreshToken: 'r')) : null,
    prefs: dark ? const {'settings.themeMode': 'dark'} : const {},
    extraOverrides: [
      locationServiceProvider.overrideWithValue(loc),
      chargingClockProvider.overrideWithValue(() => DateTime.utc(2026, 9, 25, 12)),
      chargingTileProviderProvider.overrideWithValue(_MemoryTileProvider.new),
    ],
  );
  tester.container().read(routerProvider).go(location);
  await tester.pumpAndSettle();
  return (server, loc);
}

Finder _scrollable() => find.byType(Scrollable).first;

/// The vertical results list of the charging tab (the header has its own
/// horizontal chip scroller).
Finder _list() => find.descendant(of: find.byType(CustomScrollView), matching: find.byType(Scrollable)).first;

void main() {
  group('charging tab', () {
    for (final lang in ['en', 'ar']) {
      testWidgets('list with map-not-configured notice, demo label, three statuses ($lang)', (tester) async {
        final (server, loc) = await _pump(tester, language: lang);
        expect(find.byType(ChargingScreen), findsOneWidget);
        final en = lang == 'en';
        expect(
          find.text(
            en
                ? 'The map is not configured yet, so stations are shown as a list.'
                : 'لم تُهيأ الخريطة بعد، لذا تُعرض المحطات كقائمة.',
          ),
          findsOneWidget,
        );
        final names = en
            ? ['[DEMO] Demo Charging Station (fictional)', '[DEMO] Demo AC Station 2 (fictional)']
            : ['محطة تجريبية (Demo)', 'محطة تجريبية 2 (Demo)'];
        expect(find.text(names[0]), findsOneWidget);
        expect(find.text(en ? 'Demo data' : 'بيانات تجريبية'), findsWidgets);
        // Open now + live availability are separate pills; no live source → unknown, never "available".
        expect(find.text(en ? 'Open now' : 'مفتوحة الآن'), findsWidgets);
        expect(find.text(en ? 'Availability unknown' : 'التوافر غير معروف'), findsWidgets);
        expect(find.text(en ? 'Connector free now' : 'منفذ متاح الآن'), findsNothing);
        await tester.scrollUntilVisible(find.text(names[1]), 200, scrollable: _list());
        expect(find.text(en ? 'Closed now' : 'مغلقة الآن'), findsOneWidget);
        // Default city, labelled; the permission was never requested on open.
        expect(loc.requests, 0);
        expect(server.searches.last['lat'], '30.0444');
        expect(server.searches.last['radiusKm'], '25');
        expect(find.textContaining(en ? 'Cairo (default)' : 'القاهرة (افتراضي)'), findsWidgets);
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('filters sheet sends one-connector filters and counts them', (tester) async {
      final (server, _) = await _pump(tester);
      await tester.tap(find.byTooltip('Filters'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('DC').first);
      await tester.pumpAndSettle();
      final ccs = find.text('CCS2 (Combo 2)');
      await tester.ensureVisible(ccs);
      await tester.tap(ccs);
      await tester.pumpAndSettle();
      final openNow = find.widgetWithText(SwitchListTile, 'Open now');
      await tester.ensureVisible(openNow);
      await tester.tap(openNow);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Apply'));
      await tester.pumpAndSettle();
      final q = server.searches.last;
      expect(q['current'], 'DC');
      expect(q['connectorTypes'], 'ccs2');
      expect(q['openNow'], 'true');
      expect(find.byTooltip('3 filters on'), findsOneWidget);
    });

    testWidgets('location denied → snackbar offers choosing a place', (tester) async {
      final (_, loc) = await _pump(tester);
      await tester.tap(find.text('Near me'));
      await tester.pumpAndSettle();
      expect(loc.requests, 1);
      expect(find.text('Location permission was not given. You can choose a place instead.'), findsOneWidget);
      expect(find.widgetWithText(SnackBarAction, 'Choose a place'), findsOneWidget);
    });

    testWidgets('location permanently denied → settings or manual city; city is used for the search', (tester) async {
      final (server, loc) = await _pump(
        tester,
        locationService: FakeLocationService(requestResult: LocationAccess.deniedForever),
      );
      await tester.tap(find.text('Near me'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Location access is turned off for this app'), findsOneWidget);
      await tester.tap(find.text('Open device settings'));
      await tester.pumpAndSettle();
      expect(loc.settingsOpened, 1);

      await tester.tap(find.text('Near me'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Choose a place').last);
      await tester.pumpAndSettle();
      expect(find.byType(ChargingLocationScreen), findsOneWidget);
      await tester.tap(find.text('Alexandria'));
      await tester.pumpAndSettle();
      expect(find.byType(ChargingScreen), findsOneWidget);
      expect(server.searches.last['lat'], '31.2001');
      expect(find.textContaining('Around Alexandria'), findsOneWidget);
    });

    testWidgets('permission already granted → searches around the device without prompting twice', (tester) async {
      final loc = FakeLocationService(
        checkResult: LocationAccess.granted,
        requestResult: LocationAccess.granted,
        position: const GeoPoint(32.45123456, 30.71234567),
      );
      final (server, _) = await _pump(tester, locationService: loc);
      expect(server.searches.last['lat'], '32.4512', reason: 'rounded to 4 decimals');
      expect(server.searches.last['lng'], '30.7123');
      expect(find.textContaining('Near you'), findsWidgets);
    });

    testWidgets('compatibility unknown (422) → explained, car filter can be removed', (tester) async {
      await _pump(tester);
      tester
          .container()
          .read(chargingFiltersProvider.notifier)
          .set(
            const StationFilters(
              vehicle: CompatVehicle.catalog(variantId: 'v1', name: 'Demo EV'),
            ),
          );
      await tester.pumpAndSettle();
      expect(find.text("Compatibility can't be checked"), findsOneWidget);
      expect(find.byType(StationCard), findsNothing, reason: 'never an empty "nothing compatible" list');
      await tester.ensureVisible(find.text('Remove car filter'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Remove car filter'));
      await tester.pumpAndSettle();
      expect(find.text("Compatibility can't be checked"), findsNothing);
      expect(find.text('[DEMO] Demo Charging Station (fictional)'), findsOneWidget);
    });

    testWidgets('offline → saved copy labelled with its date, no live status', (tester) async {
      final (server, _) = await _pump(tester);
      server.online = false;
      tester.container().invalidate(stationSearchProvider);
      await tester.pumpAndSettle();
      expect(find.byType(CachedDataNotice), findsOneWidget);
      expect(find.text('This is saved data. Live status is never shown from saved data.'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('[DEMO] Demo Charging Station (fictional)'), 200, scrollable: _list());
      expect(find.text('No live status (saved data)'), findsWidgets);
      expect(find.text('Availability unknown'), findsNothing);
      expect(
        find.descendant(of: find.byType(StationCard), matching: find.text('Open now')),
        findsNothing,
        reason: 'open-now of a saved list is not shown as current',
      );
    });

    testWidgets('Arabic, dark mode, 200% text: no overflow', (tester) async {
      await _pump(tester, language: 'ar', textScale: 2, dark: true);
      await tester.scrollUntilVisible(find.text('محطة تجريبية 2 (Demo)'), 300, scrollable: _list());
      expect(find.byType(StationCard), findsWidgets);
      expect(tester.takeException(), isNull);
    });

    testWidgets('map view with tiles, attribution, pins and a selected station card', (tester) async {
      final loc = FakeLocationService(
        checkResult: LocationAccess.granted,
        requestResult: LocationAccess.granted,
        position: const GeoPoint(32.45, 30.7),
      );
      await _pump(tester, mapConfigured: true, locationService: loc);
      expect(find.byType(StationsMap), findsOneWidget);
      expect(find.text('© Test tiles contributors'), findsOneWidget);
      expect(find.text('2 stations'), findsOneWidget);
      final pin = find.bySemanticsLabel('[DEMO] Demo Charging Station (fictional)');
      expect(pin, findsOneWidget);
      await tester.tap(pin);
      await tester.pumpAndSettle();
      expect(find.byType(StationCard), findsOneWidget);
      // Switch to the list: same results.
      await tester.tap(find.byTooltip('List'));
      await tester.pumpAndSettle();
      expect(find.text('[DEMO] Demo Charging Station (fictional)'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  group('station page', () {
    for (final lang in ['en', 'ar']) {
      testWidgets('three statuses, demo label, prices, community, source ($lang)', (tester) async {
        await _pump(tester, language: lang, location: AppRoutes.station(demoStationId));
        final en = lang == 'en';
        expect(find.byType(StationDetailScreen), findsOneWidget);
        expect(find.text(en ? 'Demo data' : 'بيانات تجريبية'), findsWidgets);
        await tester.scrollUntilVisible(find.text(en ? 'Status now' : 'الحالة الآن'), 300, scrollable: _scrollable());
        expect(find.text(en ? 'Operational' : 'تعمل'), findsWidgets);
        expect(find.text(en ? 'Open now' : 'مفتوحة الآن'), findsWidgets);
        // The demo reading ("available") expired → uncertain, never available.
        expect(find.text(en ? 'Uncertain (reading expired)' : 'غير مؤكدة (انتهت صلاحية القراءة)'), findsWidgets);
        expect(find.text(en ? 'Connector free now' : 'منفذ متاح الآن'), findsNothing);
        await tester.scrollUntilVisible(
          find.text(
            en
                ? 'The number of connectors is not the number of cars that can charge at the same time.'
                : 'عدد المنافذ لا يساوي عدد السيارات التي يمكن شحنها في الوقت نفسه.',
          ),
          300,
          scrollable: _scrollable(),
        );
        await tester.scrollUntilVisible(find.text(en ? 'Prices' : 'الأسعار'), 300, scrollable: _scrollable());
        expect(find.text(en ? 'Taxes: not stated' : 'الضرائب: غير مذكورة'), findsOneWidget);
        await tester.scrollUntilVisible(
          find.text(en ? 'Data source and licence' : 'مصدر البيانات والترخيص'),
          300,
          scrollable: _scrollable(),
        );
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('community data is dated and separate from live status', (tester) async {
      await _pump(tester, location: AppRoutes.station(demoStationId));
      await tester.scrollUntilVisible(find.text('Recent check-ins'), 300, scrollable: _scrollable());
      expect(find.text('Charged successfully'), findsWidgets);
      expect(find.textContaining('not an official live status'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Reports (last 90 days)'), 300, scrollable: _scrollable());
      expect(find.text('Price changed'), findsOneWidget);
    });

    testWidgets('schedule with a closed day and station time zone', (tester) async {
      await _pump(tester, language: 'ar', location: AppRoutes.station(demoStation2Id));
      await tester.scrollUntilVisible(find.text('مواعيد العمل'), 300, scrollable: _scrollable());
      expect(find.textContaining('الجمعة'), findsWidgets);
      expect(find.text('مغلقة'), findsWidgets);
      expect(find.textContaining('Africa/Cairo'), findsWidgets);
    });

    testWidgets('offline copy of a station: dated, no live status', (tester) async {
      final (server, _) = await _pump(tester, location: AppRoutes.station(demoStationId));
      server.online = false;
      tester.container().invalidate(stationDetailProvider(demoStationId));
      await tester.pumpAndSettle();
      expect(find.byType(CachedDataNotice), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Status now'), 300, scrollable: _scrollable());
      expect(find.text('No live status (saved data)'), findsWidgets);
    });

    testWidgets('merged station redirects to the kept one', (tester) async {
      await _pump(tester, location: AppRoutes.station('merged-one'));
      expect(find.text('This station was merged'), findsOneWidget);
      await tester.tap(find.text('Open the station'));
      await tester.pumpAndSettle();
      // The merged notice is replaced by the kept station's page. (This used
      // to assert that a section below the fold was not built yet, which
      // depended on card heights; see docs/decisions/design-review.md.)
      expect(find.text('This station was merged'), findsNothing);
      expect(find.byType(StationDetailScreen), findsOneWidget);
    });

    testWidgets('Arabic, 200% text: whole page without overflow', (tester) async {
      await _pump(tester, language: 'ar', textScale: 2, location: AppRoutes.station(demoStationId));
      await tester.scrollUntilVisible(find.text('مصدر البيانات والترخيص'), 400, scrollable: _scrollable());
      expect(tester.takeException(), isNull);
    });
  });

  group('community writes', () {
    testWidgets('guests are asked to sign in', (tester) async {
      await _pump(tester, location: AppRoutes.stationCheckIn(demoStationId));
      expect(find.byType(SignInRequiredView), findsOneWidget);
      await tester.pump(const Duration(seconds: 30));
    });

    testWidgets('report: details required, 409 shown, then sent', (tester) async {
      final (server, _) = await _pump(tester, signedIn: true, location: AppRoutes.stationReport(demoStationId));
      await tester.ensureVisible(find.text('Other problem'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Other problem'));
      await tester.pumpAndSettle();
      final send = find.text('Send');
      await tester.ensureVisible(send);
      await tester.pumpAndSettle();
      await tester.tap(send);
      await tester.pumpAndSettle();
      expect(find.text('Please describe the problem.'), findsOneWidget);
      expect(server.reportBodies, isEmpty);

      await tester.enterText(find.byType(TextField).last, 'Screen is dark');
      await tester.ensureVisible(send);
      await tester.pumpAndSettle();
      await tester.tap(send);
      await tester.pumpAndSettle();
      expect(find.text('You already have an open report of this type.'), findsOneWidget);
      expect((server.reportBodies.single as Map)['type'], 'other');
      expect((server.reportBodies.single as Map)['description'], 'Screen is dark');

      await tester.ensureVisible(send);
      await tester.pumpAndSettle();
      await tester.tap(send);
      await tester.pumpAndSettle();
      expect(find.text('Thanks for your report'), findsOneWidget);
    });
  });
}
