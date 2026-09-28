import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/interceptors/request_headers_interceptor.dart';
import '../../../core/api/paged.dart';
import '../../../core/cache/cached_fetch.dart';
import '../../../core/cache/json_cache.dart';
import '../../../core/json/json_readers.dart';
import '../domain/tour_models.dart';

/// One page of tour cards.
class ToursPage {
  const ToursPage({required this.items, required this.meta});

  final List<TourCard> items;
  final PageMeta meta;

  bool get hasMore => meta.hasMore;
}

ToursPage parseToursPage(Object? body) {
  if (body is! Map) throw const FormatException('Expected a list envelope');
  final json = asJsonObject(body);
  final data = json['data'];
  if (data is! List) throw const FormatException('Expected data[]');
  return ToursPage(items: [for (final t in data) ?TourCard.tryParse(t)], meta: PageMeta.fromJson(json.objectOrNull('meta')));
}

TourDetail parseTourDetail(Object? body) => TourDetail.parse(ApiClient.unwrapData(body));

/// Public tours endpoints (guests allowed; language + market sent as headers
/// by Dio). First pages and tour details are cached for offline viewing.
class ToursRepository {
  ToursRepository({required this._api, required this._cache, required this._locale});

  final ApiClient _api;
  final JsonCache _cache;
  final RequestLocale Function() _locale;

  static const pageSize = 20;

  String _key(String path, {String? variant}) {
    final l = _locale();
    return JsonCache.key(path, lang: l.languageCode, market: l.marketCode, variant: variant);
  }

  /// `GET /tours` — exact tours first, then approved reference tours.
  Future<CachedResult<ToursPage>> tours({int page = 1, String? variantId, String? modelYearId}) {
    Future<Object?> fetch() => _api.getJson(
      '/tours',
      query: {'page': page, 'pageSize': pageSize, 'variantId': ?variantId, 'modelYearId': ?modelYearId},
    );
    if (page > 1) {
      return fetch().then((j) => CachedResult(data: parseToursPage(j), savedAt: DateTime.now().toUtc(), fromCache: false));
    }
    return fetchWithCache(
      cache: _cache,
      key: _key('/tours', variant: 'v=$variantId&y=$modelYearId'),
      fetch: fetch,
      parse: parseToursPage,
    );
  }

  /// `GET /tours/featured` (home strip; real tours before demo tours).
  Future<CachedResult<List<TourCard>>> featured({int limit = 10}) => fetchWithCache(
    cache: _cache,
    key: _key('/tours/featured', variant: 'limit=$limit'),
    fetch: () => _api.getJson('/tours/featured', query: {'limit': limit}),
    parse: (j) => parseToursPage(j).items,
  );

  /// `GET /tours/:idOrSlug?maxWidth=` — [maxWidth] is the widest single
  /// panorama this device should load (see `DeviceDisplayProfile`).
  Future<CachedResult<TourDetail>> tour(String idOrSlug, {required int maxWidth}) => fetchWithCache(
    cache: _cache,
    key: _key('/tours/$idOrSlug', variant: 'w=$maxWidth'),
    fetch: () => _api.getJson('/tours/${Uri.encodeComponent(idOrSlug)}', query: {'maxWidth': maxWidth}),
    parse: parseTourDetail,
  );
}

final toursRepositoryProvider = Provider<ToursRepository>(
  (ref) => ToursRepository(
    api: ref.watch(apiClientProvider),
    cache: ref.watch(jsonCacheProvider),
    locale: () => ref.read(requestLocaleProvider),
  ),
);
