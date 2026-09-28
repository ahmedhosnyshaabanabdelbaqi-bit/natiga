import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/interceptors/request_headers_interceptor.dart';
import '../../../core/cache/cached_fetch.dart';
import '../../../core/cache/json_cache.dart';
import '../../../core/json/json_readers.dart';
import '../domain/station_models.dart';
import '../domain/station_query.dart';

/// Removes everything that could reveal where the user was before a response
/// is stored on the device (REQUIREMENTS §19: no precise location history):
/// distances and the echoed search centre. Distances of a saved copy are
/// recomputed on screen from the current (in-memory) reference point.
Object? stripLocation(Object? body) {
  if (body is! Map) return body;
  final out = asJsonObject(body).map((k, v) => MapEntry(k, v));
  final data = out['data'];
  if (data is List) {
    out['data'] = [
      for (final e in data)
        if (e is Map) (asJsonObject(e).map((k, v) => MapEntry(k, v))..['distanceM'] = null) else e,
    ];
  } else if (data is Map) {
    out['data'] = asJsonObject(data).map((k, v) => MapEntry(k, v))..['distanceM'] = null;
  }
  final meta = out['meta'];
  if (meta is Map) out['meta'] = asJsonObject(meta).map((k, v) => MapEntry(k, v))..['center'] = null;
  return out;
}

/// Wraps [JsonCache] so every stored station payload goes through
/// [stripLocation] first.
class _LocationFreeCache implements JsonCache {
  _LocationFreeCache(this.inner);

  final JsonCache inner;

  @override
  Future<CachedJson?> get(String key) => inner.get(key);

  @override
  Future<void> put(String key, Object? data, {String? etag}) => inner.put(key, stripLocation(data), etag: etag);

  @override
  Future<void> remove(String key) => inner.remove(key);

  @override
  Future<void> clear() => inner.clear();

  @override
  Future<int> purgeOlderThan(Duration age) => inner.purgeOlderThan(age);
}

/// `GET /stations…` (guests allowed) and the signed-in community writes.
///
/// Reads that a screen opens with go through [fetchWithCache], keyed by
/// language + market (+ area and filters for searches), so the last copy can
/// be shown — labelled with its date and WITHOUT live status — when offline.
class StationsRepository {
  StationsRepository({required this.api, required JsonCache cache, required this.locale})
    : cache = _LocationFreeCache(cache);

  final ApiClient api;
  final JsonCache cache;
  final RequestLocale Function() locale;

  /// One page of results (the API allows up to 500; 200 keeps the map light).
  static const pageSize = 200;

  String _key(String path, [String? variant]) {
    final l = locale();
    return JsonCache.key(path, lang: l.languageCode, market: l.marketCode, variant: variant);
  }

  static Map<String, String> searchQuery(SearchArea area, StationFilters filters, {String? cursor, int limit = pageSize}) => {
    ...area.toQuery(),
    ...filters.toQuery(),
    'sort': 'distance',
    'limit': '$limit',
    'cursor': ?cursor,
  };

  /// Cache key of a search: area rounded to ~1 km so panning slightly still
  /// finds the saved copy offline; the reference point is NOT part of it.
  static String searchCacheVariant(SearchArea area, StationFilters filters) {
    String r(double v) => v.toStringAsFixed(2);
    final geo = area.bounds != null
        ? 'b:${r(area.bounds!.west)},${r(area.bounds!.south)},${r(area.bounds!.east)},${r(area.bounds!.north)}'
        : 'p:${r(area.place!.point.lat)},${r(area.place!.point.lng)},${area.radiusKm}';
    final f = filters.toQuery().entries.map((e) => '${e.key}=${e.value}').toList()..sort();
    return '$geo|${f.join('&')}';
  }

  /// `GET /stations`. The first page is cached for offline use.
  Future<CachedResult<StationSearchPage>> search(SearchArea area, StationFilters filters, {String? cursor}) {
    Future<Object?> fetch() => api.getJson('/stations', query: searchQuery(area, filters, cursor: cursor));
    if (cursor != null) {
      return fetch().then(
        (json) => CachedResult(data: StationSearchPage.fromBody(json), savedAt: DateTime.now().toUtc(), fromCache: false),
      );
    }
    return fetchWithCache(
      cache: cache,
      key: _key('/stations', searchCacheVariant(area, filters)),
      fetch: fetch,
      parse: StationSearchPage.fromBody,
    );
  }

  /// `GET /stations/clusters` (low zoom / truncated results). Not cached.
  Future<List<StationCluster>> clusters(GeoBounds bounds, int zoom, StationFilters filters) async {
    final q = filters.toQuery()..remove('openNow');
    final json = await api.getJson(
      '/stations/clusters',
      query: {'bbox': bounds.toQuery(), 'zoom': '${zoom.clamp(0, 22)}', ...q},
    );
    return StationCluster.listFromBody(json);
  }

  /// `GET /stations/meta` (filter chips, report reasons, …).
  Future<CachedResult<StationMeta>> meta() => fetchWithCache(
    cache: cache,
    key: _key('/stations/meta'),
    fetch: () => api.getJson('/stations/meta'),
    parse: (json) => StationMeta.fromData(ApiClient.unwrapData(json)),
  );

  /// `GET /stations/:idOrSlug` (+ compatibility for [vehicle]). Cached per
  /// station (without distance).
  Future<CachedResult<StationDetail>> detail(String idOrSlug, {GeoPoint? from, CompatVehicle? vehicle}) {
    String r(double v) => v.toStringAsFixed(4);
    return fetchWithCache(
      cache: cache,
      key: _key('/stations/$idOrSlug', vehicle == null ? null : 'v:${vehicle.userVehicleId ?? vehicle.variantId}'),
      fetch: () => api.getJson(
        '/stations/${Uri.encodeComponent(idOrSlug)}',
        query: {
          if (from != null) 'lat': r(from.lat),
          if (from != null) 'lng': r(from.lng),
          ...?vehicle?.toQuery(),
        },
      ),
      parse: (json) => StationDetail.fromData(ApiClient.unwrapData(json)),
    );
  }

  /// `GET /me/vehicles` (signed in) — cars for "compatible with my car".
  Future<List<GarageCar>> myCars() async {
    final json = await api.getJson('/me/vehicles');
    final data = ApiClient.unwrapData(json);
    if (data is! List) return const [];
    return [
      for (final e in data)
        if (e is Map) ?GarageCar.tryParse(asJsonObject(e)),
    ];
  }

  /// `POST /stations/:id/reports`.
  Future<void> report(
    String stationId, {
    required String type,
    String? connectorId,
    String? description,
    Map<String, Object?>? suggestedData,
  }) async {
    await api.postData(
      '/stations/${Uri.encodeComponent(stationId)}/reports',
      (d) => d,
      body: {
        'type': type,
        'connectorId': ?connectorId,
        if (description != null && description.trim().isNotEmpty) 'description': description.trim(),
        if (suggestedData != null && suggestedData.isNotEmpty) 'suggestedData': suggestedData,
      },
    );
  }

  /// `POST /stations/:id/checkins`. Returns the moderation status
  /// (`approved` / `pending`).
  Future<String?> checkIn(
    String stationId, {
    required String outcome,
    String? connectorId,
    String? variantId,
    double? observedPowerKw,
    int? waitMinutes,
    String? comment,
  }) {
    return api.postData(
      '/stations/${Uri.encodeComponent(stationId)}/checkins',
      (d) => d is Map ? asJsonObject(d).stringOrNull('status') : null,
      body: {
        'outcome': outcome,
        'connectorId': ?connectorId,
        'variantId': ?variantId,
        'observedPowerKw': ?observedPowerKw,
        'waitMinutes': ?waitMinutes,
        if (comment != null && comment.trim().isNotEmpty) 'comment': comment.trim(),
      },
    );
  }

  /// `POST /stations/suggestions`.
  Future<SuggestionResult> suggest(Map<String, Object?> body) =>
      api.postData('/stations/suggestions', SuggestionResult.fromData, body: body);
}

final stationsRepositoryProvider = Provider<StationsRepository>(
  (ref) => StationsRepository(
    api: ref.watch(apiClientProvider),
    cache: ref.watch(jsonCacheProvider),
    locale: () => ref.read(requestLocaleProvider),
  ),
);
