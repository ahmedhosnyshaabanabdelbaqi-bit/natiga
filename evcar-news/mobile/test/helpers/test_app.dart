import 'package:evcar_news/app/app.dart';
import 'package:evcar_news/app/di/providers.dart';
import 'package:evcar_news/core/auth/device_id_store.dart';
import 'package:evcar_news/core/auth/token_storage.dart';
import 'package:evcar_news/core/cache/json_cache.dart';
import 'package:evcar_news/core/cache/saved_items_store.dart';
import 'package:evcar_news/core/connectivity/connectivity_service.dart';
import 'package:evcar_news/core/settings/settings_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_http_adapter.dart';

/// Everything a widget test may want to inspect after pumping the app.
class TestAppHarness {
  TestAppHarness({required this.adapter, required this.tokens, required this.cache, required this.connectivity});

  /// Installation id the app sends as `X-Device-Id` on sign-in.
  static const deviceId = 'test-installation-id-0123456789';

  final FakeHttpAdapter adapter;
  final InMemoryTokenStorage tokens;
  final MemoryJsonCache cache;
  final FakeConnectivityService connectivity;
}

/// Every feature flag on (as if all modules had shipped and were enabled).
const allFeaturesOn = <String, bool>{
  'news': true,
  'cars': true,
  'comparisons': true,
  'interiorTours': true,
  'stations': true,
  'calculators': true,
  'garage': true,
  'favorites': true,
  'chargingLogs': true,
  'reminders': true,
  'encyclopedia': true,
  'notifications': true,
  'community': true,
  'tripPlanner': true,
  'servicesDirectory': true,
};

/// Minimal valid `/app-config` payload (every feature off, like the real
/// server today — see [allFeaturesOn]).
Map<String, dynamic> fakeAppConfigJson({Map<String, bool> features = const {}, String? logoUrl}) => {
  'data': {
    'branding': {'appName': 'EV Car News', 'logoUrl': logoUrl, 'primaryColor': '#0A5CFF', 'accentColor': '#00C2E0'},
    'languages': ['ar', 'en'],
    'defaultLanguage': 'ar',
    'defaultMarket': 'EG',
    'markets': [
      {
        'code': 'EG',
        'nameAr': 'مصر',
        'nameEn': 'Egypt',
        'currency': 'EGP',
        'timezone': 'Africa/Cairo',
        'enabled': true,
      },
      {
        'code': 'SA',
        'nameAr': 'السعودية',
        'nameEn': 'Saudi Arabia',
        'currency': 'SAR',
        'timezone': 'Asia/Riyadh',
        'enabled': true,
      },
    ],
    'homeSections': [],
    'features': features,
    'map': {'tileUrlTemplate': null, 'attribution': null, 'maxZoom': 18, 'configured': false},
    'share': {'baseUrl': 'https://evcar.news'},
    'legal': {'privacyUrl': null, 'termsUrl': null},
  },
};

/// Pumps the full app (router, shell, theme, l10n) with fakes:
/// in-memory caches and token storage, a fake HTTP adapter, fixed
/// connectivity, and mock SharedPreferences with [language].
Future<TestAppHarness> pumpTestApp(
  WidgetTester tester, {
  String language = 'ar',
  FakeHttpAdapter? adapter,
  InMemoryTokenStorage? tokens,
  bool online = true,
  Map<String, Object> prefs = const {},
  Map<String, bool> features = const {},
  String? logoUrl,
  List<Override> extraOverrides = const [],
}) async {
  SharedPreferences.setMockInitialValues({'settings.language': language, ...prefs});
  final sharedPrefs = await SharedPreferences.getInstance();
  final http = adapter ?? FakeHttpAdapter();
  http.routes.putIfAbsent(
    'GET /app-config',
    () =>
        (_) => FakeResponse.json(200, fakeAppConfigJson(features: features, logoUrl: logoUrl)),
  );
  final harness = TestAppHarness(
    adapter: http,
    tokens: tokens ?? InMemoryTokenStorage(),
    cache: MemoryJsonCache(),
    connectivity: FakeConnectivityService(online: online),
  );

  await tester.pumpWidget(
    ProviderScope(
      retry: (_, _) => null,
      overrides: [
        sharedPreferencesProvider.overrideWithValue(sharedPrefs),
        httpClientAdapterProvider.overrideWithValue(http),
        apiBaseUrlProvider.overrideWithValue('https://api.test/api/v1'),
        tokenStorageProvider.overrideWithValue(harness.tokens),
        jsonCacheProvider.overrideWithValue(harness.cache),
        savedItemsStoreProvider.overrideWithValue(MemorySavedItemsStore()),
        connectivityServiceProvider.overrideWithValue(harness.connectivity),
        deviceLocalesProvider.overrideWithValue(const [Locale('en', 'US')]),
        deviceIdStoreProvider.overrideWithValue(InMemoryDeviceIdStore(TestAppHarness.deviceId)),
        ...extraOverrides,
      ],
      child: const EvCarApp(),
    ),
  );
  await tester.pumpAndSettle();
  return harness;
}
