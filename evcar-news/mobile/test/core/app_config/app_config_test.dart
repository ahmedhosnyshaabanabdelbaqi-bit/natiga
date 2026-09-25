import 'package:evcar_news/app/di/providers.dart';
import 'package:evcar_news/core/app_config/app_config.dart';
import 'package:evcar_news/core/app_config/app_config_controller.dart';
import 'package:evcar_news/core/cache/json_cache.dart';
import 'package:evcar_news/core/settings/settings_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/fake_http_adapter.dart';
import '../../helpers/test_app.dart';

Future<(ProviderContainer, FakeHttpAdapter, MemoryJsonCache)> setup({MemoryJsonCache? cache}) async {
  SharedPreferences.setMockInitialValues({});
  final sp = await SharedPreferences.getInstance();
  final adapter = FakeHttpAdapter();
  final memory = cache ?? MemoryJsonCache();
  final c = ProviderContainer(
    retry: (_, _) => null,
    overrides: [
      sharedPreferencesProvider.overrideWithValue(sp),
      httpClientAdapterProvider.overrideWithValue(adapter),
      jsonCacheProvider.overrideWithValue(memory),
    ],
  );
  addTearDown(c.dispose);
  return (c, adapter, memory);
}

void main() {
  group('AppConfig.fromJson', () {
    test('parses the contract shape', () {
      final data = fakeAppConfigJson()['data'] as Map<String, dynamic>;
      data['features'] = {'tripPlanner': true, 'assistant': false, 'bogus': 'yes'};
      data['homeSections'] = [
        {'key': 'tours', 'enabled': true, 'order': 2},
        {'key': 'hero', 'enabled': true, 'order': 1},
        {'key': 'ads', 'enabled': false, 'order': 0},
      ];
      data['map'] = {
        'tileUrlTemplate': 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        'attribution': '© OpenStreetMap contributors',
        'maxZoom': 19,
        'configured': true,
      };
      data['legal'] = {'privacyUrl': 'https://evcar.news/privacy', 'termsUrl': null};
      final c = AppConfig.fromJson(data);

      expect(c.branding.appName, 'EV Car News');
      expect(c.defaultMarket, 'EG');
      expect(c.markets.map((m) => m.code), ['EG', 'SA']);
      expect(c.marketByCode('SA')!.nameFor('ar'), 'السعودية');
      expect(c.isFeatureEnabled('tripPlanner'), isTrue);
      expect(c.isFeatureEnabled('assistant'), isFalse);
      expect(c.isFeatureEnabled('bogus'), isFalse, reason: 'non-bool flags are ignored');
      expect(c.isFeatureEnabled('unknownFlag'), isFalse, reason: 'unknown flags are off');
      expect(c.orderedHomeSections.map((s) => s.key), ['hero', 'tours']);
      expect(c.map.isUsable, isTrue);
      expect(c.map.maxZoom, 19);
      expect(c.legal.privacyUrl, 'https://evcar.news/privacy');
      expect(c.share.articleUrl('my slug'), 'https://evcar.news/n/my%20slug');
      expect(c.share.comparisonUrl('abc'), 'https://evcar.news/compare/abc');
    });

    test('round-trips through toJson', () {
      final c = AppConfig.fromJson(fakeAppConfigJson()['data'] as Map<String, dynamic>);
      final again = AppConfig.fromJson(c.toJson());
      expect(again.toJson(), c.toJson());
    });

    test('missing sections use safe defaults; explicit empty markets are respected', () {
      final minimal = AppConfig.fromJson({});
      expect(minimal.branding.primaryColor, '#0A5CFF');
      expect(minimal.markets.map((m) => m.code), ['EG', 'SA', 'AE']);
      expect(minimal.map.configured, isFalse);
      expect(minimal.features, isEmpty);

      final empty = AppConfig.fromJson({'markets': <Object>[]});
      expect(empty.markets, isEmpty);
    });

    test('the built-in fallback has every feature off and no map', () {
      final f = AppConfig.fallback();
      expect(f.features, isEmpty);
      expect(f.map.isUsable, isFalse);
      expect(f.legal.privacyUrl, isNull);
    });
  });

  group('AppConfigController', () {
    test('network success → source network, cached for next start', () async {
      final (c, adapter, cache) = await setup();
      adapter.on('GET /app-config', (_) => FakeResponse.json(200, fakeAppConfigJson()));
      final state = await c.read(appConfigControllerProvider.future);
      expect(state.source, AppConfigSource.network);
      expect(state.lastError, isNull);
      expect(await cache.get(AppConfigController.cacheKey), isNotNull);
      expect(adapter.requests.single.headers.containsKey('Authorization'), isFalse);
    });

    test('offline with no cache → built-in fallback with the error recorded', () async {
      final (c, adapter, _) = await setup();
      adapter.on('GET /app-config', (_) => throw const FakeNetworkError());
      final state = await c.read(appConfigControllerProvider.future);
      expect(state.source, AppConfigSource.fallback);
      expect(state.lastError!.isConnectivityProblem, isTrue);
      expect(c.read(appConfigProvider).branding.appName, 'EV Car News');
    });

    test('cached copy is used immediately and refreshed in the background', () async {
      final cache = MemoryJsonCache();
      final cachedData = fakeAppConfigJson()['data'] as Map<String, dynamic>;
      cachedData['branding'] = {'appName': 'Cached Name', 'primaryColor': '#112233', 'accentColor': '#445566'};
      await cache.put(AppConfigController.cacheKey, cachedData);
      final (c, adapter, _) = await setup(cache: cache);
      adapter.on('GET /app-config', (_) => FakeResponse.json(200, fakeAppConfigJson()));

      final first = await c.read(appConfigControllerProvider.future);
      expect(first.source, AppConfigSource.cache);
      expect(first.config.branding.appName, 'Cached Name');

      // Background refresh (Timer.run) → network value.
      await Future<void>.delayed(const Duration(milliseconds: 20));
      final next = c.read(appConfigControllerProvider).value!;
      expect(next.source, AppConfigSource.network);
      expect(next.config.branding.appName, 'EV Car News');
    });

    test('failed background refresh keeps the cached config', () async {
      final cache = MemoryJsonCache();
      await cache.put(AppConfigController.cacheKey, fakeAppConfigJson()['data']);
      final (c, adapter, _) = await setup(cache: cache);
      adapter.on('GET /app-config', (_) => FakeResponse.error(500, 'INTERNAL_ERROR'));
      await c.read(appConfigControllerProvider.future);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      final s = c.read(appConfigControllerProvider).value!;
      expect(s.source, AppConfigSource.cache);
      expect(s.lastError!.statusCode, 500);
    });

    test('featureFlagProvider reads server flags', () async {
      final (c, adapter, _) = await setup();
      final json = fakeAppConfigJson();
      (json['data'] as Map<String, dynamic>)['features'] = {'tripPlanner': true};
      adapter.on('GET /app-config', (_) => FakeResponse.json(200, json));
      await c.read(appConfigControllerProvider.future);
      expect(c.read(featureFlagProvider('tripPlanner')), isTrue);
      expect(c.read(featureFlagProvider('assistant')), isFalse);
    });
  });
}
