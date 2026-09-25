import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/di/providers.dart';
import '../api/api_client.dart';
import '../api/api_exception.dart';
import '../cache/json_cache.dart';
import '../json/json_readers.dart';
import 'app_config.dart';

/// Where the active configuration came from.
enum AppConfigSource {
  /// Fetched from the server in this session.
  network,

  /// Last saved copy (server unreachable or not fetched yet).
  cache,

  /// Built-in defaults — the server has never been reached on this device.
  fallback,
}

class AppConfigState {
  const AppConfigState({required this.config, required this.source, this.savedAt, this.lastError});

  final AppConfig config;
  final AppConfigSource source;

  /// When the config was fetched (network/cache); null for fallback.
  final DateTime? savedAt;

  /// Last refresh error, if the latest attempt failed.
  final ApiException? lastError;
}

/// Loads `/app-config` with an offline-first strategy:
/// 1. a cached copy (if any) is returned immediately so startup never blocks
///    on the network, and a refresh is started in the background;
/// 2. with no cache, the network is awaited;
/// 3. if both fail, built-in defaults are used ([AppConfigSource.fallback]).
///
/// The controller never throws: the app can always start.
class AppConfigController extends AsyncNotifier<AppConfigState> {
  static const cacheKey = 'app-config';

  JsonCache get _cache => ref.read(jsonCacheProvider);
  ApiClient get _api => ref.read(apiClientProvider);

  @override
  Future<AppConfigState> build() async {
    final cached = await _readCache();
    if (cached != null) {
      // Refresh in a later event-loop turn (after this build's result has
      // been applied); keeps the cached config on failure.
      Timer.run(() => unawaited(_refreshFrom(cached)));
      return cached;
    }
    return _fetch(previous: null);
  }

  /// Re-fetches from the server; on failure keeps the current config and
  /// records [AppConfigState.lastError].
  Future<void> refresh() => _refreshFrom(state.value);

  Future<void> _refreshFrom(AppConfigState? previous) async {
    if (!ref.mounted) return;
    final next = await _fetch(previous: previous);
    if (ref.mounted) state = AsyncData(next);
  }

  Future<AppConfigState?> _readCache() async {
    try {
      final entry = await _cache.get(cacheKey);
      if (entry == null) return null;
      return AppConfigState(
        config: AppConfig.fromJson(asJsonObject(entry.data)),
        source: AppConfigSource.cache,
        savedAt: entry.savedAt,
      );
    } on FormatException {
      return null;
    }
  }

  Future<AppConfigState> _fetch({required AppConfigState? previous}) async {
    try {
      final data = await _api.getData('/app-config', (d) => asJsonObject(d, 'app-config'), skipAuth: true);
      final config = AppConfig.fromJson(data);
      await _cache.put(cacheKey, data);
      return AppConfigState(config: config, source: AppConfigSource.network, savedAt: DateTime.now().toUtc());
    } on ApiException catch (e) {
      if (previous != null) {
        return AppConfigState(
          config: previous.config,
          source: previous.source,
          savedAt: previous.savedAt,
          lastError: e,
        );
      }
      return AppConfigState(config: AppConfig.fallback(), source: AppConfigSource.fallback, lastError: e);
    } on FormatException catch (e) {
      final err = ApiException(kind: ApiErrorKind.badResponse, code: 'BAD_RESPONSE', details: e.message);
      return AppConfigState(
        config: previous?.config ?? AppConfig.fallback(),
        source: previous?.source ?? AppConfigSource.fallback,
        savedAt: previous?.savedAt,
        lastError: err,
      );
    }
  }
}

final appConfigControllerProvider = AsyncNotifierProvider<AppConfigController, AppConfigState>(AppConfigController.new);

/// The active configuration (fallback while loading).
final appConfigProvider = Provider<AppConfig>(
  (ref) => ref.watch(appConfigControllerProvider).value?.config ?? AppConfig.fallback(),
);

/// Convenience: `ref.watch(featureFlagProvider('tripPlanner'))`.
final featureFlagProvider = Provider.family<bool, String>(
  (ref, key) => ref.watch(appConfigProvider).isFeatureEnabled(key),
);
