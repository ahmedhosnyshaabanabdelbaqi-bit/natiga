import 'dart:ui' as ui;

import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/dio_factory.dart';
import '../../core/api/interceptors/request_headers_interceptor.dart';
import '../../core/app_config/app_config.dart';
import '../../core/app_config/app_config_controller.dart';
import '../../core/auth/device_id_store.dart';
import '../../core/auth/session_events.dart';
import '../../core/auth/token_refresher.dart';
import '../../core/auth/token_storage.dart';
import '../../core/cache/cache_database.dart';
import '../../core/cache/json_cache.dart';
import '../../core/cache/saved_items_store.dart';
import '../../core/config/env.dart';
import '../../core/platform/platform_capabilities.dart';
import '../../core/settings/app_settings.dart';
import '../../core/settings/settings_controller.dart';

// ---------------------------------------------------------------------------
// Infrastructure singletons. `main()` overrides the ones that need async
// initialization; tests override the rest with fakes (see test/helpers).
// ---------------------------------------------------------------------------

/// Opened SQLite database, or `null` when it could not be opened (the app
/// then falls back to in-memory caches rather than crashing).
final cacheDatabaseProvider = Provider<CacheDatabase?>((ref) => null);

final jsonCacheProvider = Provider<JsonCache>((ref) {
  final db = ref.watch(cacheDatabaseProvider);
  return db == null ? MemoryJsonCache() : SqfliteJsonCache(db);
});

final savedItemsStoreProvider = Provider<SavedItemsStore>((ref) {
  final db = ref.watch(cacheDatabaseProvider);
  return db == null ? MemorySavedItemsStore() : SqfliteSavedItemsStore(db);
});

/// Keystore/keychain on Android/iOS. The web design preview keeps tokens in
/// memory only (never in browser storage), so a reload signs out.
final tokenStorageProvider = Provider<TokenStorage>(
  (ref) => ref.watch(platformCapabilitiesProvider).secureTokenStorage ? SecureTokenStorage() : InMemoryTokenStorage(),
);

/// Installation id sent as `X-Device-Id` on sign-in (see [DeviceIdStore]).
final deviceIdStoreProvider = Provider<DeviceIdStore>(
  (ref) => ref.watch(platformCapabilitiesProvider).secureTokenStorage ? SecureDeviceIdStore() : InMemoryDeviceIdStore(),
);

final sessionEventsProvider = Provider<SessionEvents>((ref) {
  final events = SessionEvents();
  ref.onDispose(events.dispose);
  return events;
});

/// App version string (from package_info_plus in `main()`), sent as
/// `X-App-Version` and shown in settings.
final appVersionProvider = Provider<String?>((ref) => null);

/// API base URL (`--dart-define=API_BASE_URL`); overridable in tests.
final apiBaseUrlProvider = Provider<String>((ref) => Env.apiBaseUrl);

/// Transport override for tests (a fake [HttpClientAdapter]); `null` = real.
final httpClientAdapterProvider = Provider<HttpClientAdapter?>((ref) => null);

/// Device locales; the app invalidates this when the system locale changes.
final deviceLocalesProvider = Provider<List<Locale>>((ref) => ui.PlatformDispatcher.instance.locales);

// ---------------------------------------------------------------------------
// Effective language / market
// ---------------------------------------------------------------------------

/// The UI + content language actually in use (`ar` or `en`).
final effectiveLanguageProvider = Provider<String>((ref) {
  final chosen = ref.watch(settingsControllerProvider.select((s) => s.languageCode));
  final device = ref.watch(deviceLocalesProvider);
  final serverDefault = ref.watch(appConfigControllerProvider.select((c) => c.value?.config.defaultLanguage));
  return resolveLanguageCode(chosen, device, fallback: serverDefault ?? 'ar');
});

/// The market actually in use: the user's choice if it exists and is enabled,
/// otherwise the server's default market.
final effectiveMarketProvider = Provider<MarketConfig>((ref) {
  final chosen = ref.watch(settingsControllerProvider.select((s) => s.marketCode));
  final config = ref.watch(appConfigControllerProvider.select((c) => c.value?.config)) ?? AppConfig.fallback();
  final picked = config.marketByCode(chosen);
  if (picked != null && picked.enabled) return picked;
  final def = config.marketByCode(config.defaultMarket);
  if (def != null) return def;
  if (config.enabledMarkets.isNotEmpty) return config.enabledMarkets.first;
  return AppConfig.fallback().markets.first;
});

final requestLocaleProvider = Provider<RequestLocale>((ref) {
  return RequestLocale(
    languageCode: ref.watch(effectiveLanguageProvider),
    marketCode: ref.watch(effectiveMarketProvider).code,
  );
});

// ---------------------------------------------------------------------------
// Networking
// ---------------------------------------------------------------------------

final dioFactoryProvider = Provider<DioFactory>((ref) {
  return DioFactory(
    baseUrl: ref.watch(apiBaseUrlProvider),
    // Read lazily per request so language/market changes apply immediately.
    locale: () => ref.read(requestLocaleProvider),
    appVersion: () => ref.read(appVersionProvider),
    adapter: ref.watch(httpClientAdapterProvider),
  );
});

final tokenRefresherProvider = Provider<TokenRefresher>((ref) {
  final factory = ref.watch(dioFactoryProvider);
  final bare = factory.createBare();
  ref.onDispose(bare.close);
  return TokenRefresher(
    storage: ref.watch(tokenStorageProvider),
    refreshCall: factory.refreshCallFor(bare),
    events: ref.watch(sessionEventsProvider),
  );
});

final dioProvider = Provider<Dio>((ref) {
  final dio = ref
      .watch(dioFactoryProvider)
      .createAuthenticated(storage: ref.watch(tokenStorageProvider), refresher: ref.watch(tokenRefresherProvider));
  ref.onDispose(dio.close);
  return dio;
});

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient(ref.watch(dioProvider)));
