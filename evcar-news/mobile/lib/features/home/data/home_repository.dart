import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/api/interceptors/request_headers_interceptor.dart';
import '../../../core/cache/cached_fetch.dart';
import '../../../core/cache/json_cache.dart';
import '../domain/home_models.dart';

/// `GET /home` with an offline copy.
///
/// The copy is written without the nearby-stations items and never contains
/// the point (REQUIREMENTS §19); the point itself is rounded to ~100 m before
/// it leaves the device and is used for this request only.
class HomeRepository {
  HomeRepository({required this.api, required this.cache, required this.locale, DateTime Function()? clock})
    : _clock = clock ?? (() => DateTime.now().toUtc());

  final ApiClient api;
  final JsonCache cache;
  final RequestLocale Function() locale;
  final DateTime Function() _clock;

  /// Cache key per language + market + signed-in state (personalized
  /// sections of one account are not shown to a guest on the same device).
  String _key({required bool signedIn}) {
    final l = locale();
    return JsonCache.key('/home', lang: l.languageCode, market: l.marketCode, variant: signedIn ? 'user' : 'guest');
  }

  static double roundCoord(double v) => (v * 1000).roundToDouble() / 1000;

  Future<CachedResult<HomeFeed>> home({double? lat, double? lng, required bool signedIn}) async {
    final key = _key(signedIn: signedIn);
    try {
      final body = await api.getJson(
        '/home',
        query: {
          if (lat != null && lng != null) 'lat': roundCoord(lat).toString(),
          if (lat != null && lng != null) 'lng': roundCoord(lng).toString(),
        },
      );
      final feed = HomeFeed.fromData(ApiClient.unwrapData(body));
      await cache.put(key, stripLocationFromHomeJson(body));
      return CachedResult(data: feed, savedAt: _clock(), fromCache: false);
    } on ApiException catch (e, st) {
      if (!(e.isConnectivityProblem || e.kind == ApiErrorKind.server)) rethrow;
      final cached = await cache.get(key);
      if (cached == null) rethrow;
      try {
        return CachedResult(
          data: HomeFeed.fromData(ApiClient.unwrapData(cached.data)),
          savedAt: cached.savedAt,
          fromCache: true,
        );
      } on Object {
        // A corrupt copy is useless: report the network problem.
        await cache.remove(key);
        Error.throwWithStackTrace(e, st);
      }
    }
  }

  /// Removes the offline copies (e.g. on sign-out).
  Future<void> forgetUserCopy() => cache.remove(_key(signedIn: true));
}

final homeRepositoryProvider = Provider<HomeRepository>(
  (ref) => HomeRepository(
    api: ref.watch(apiClientProvider),
    cache: ref.watch(jsonCacheProvider),
    locale: () => ref.read(requestLocaleProvider),
  ),
);
