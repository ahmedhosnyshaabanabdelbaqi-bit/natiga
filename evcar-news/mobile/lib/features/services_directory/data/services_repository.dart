import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/interceptors/request_headers_interceptor.dart';
import '../../../core/api/paged.dart';
import '../../../core/cache/cached_fetch.dart';
import '../../../core/cache/json_cache.dart';
import '../../../core/json/json_readers.dart';
import '../domain/service_models.dart';

/// One page of `GET /services`: editorial order in [items]; the labelled
/// sponsored slot separately in [sponsored] (REQUIREMENTS §15/§16).
class ServicesPage {
  const ServicesPage({required this.items, required this.meta, this.sponsored = const [], this.truncated = false});

  final List<ServiceProvider> items;
  final PageMeta meta;
  final List<ServiceProvider> sponsored;
  final bool truncated;
}

ServicesPage parseServicesPage(Object? body) {
  if (body is! Map) throw const FormatException('Expected a list envelope');
  final json = asJsonObject(body);
  final data = json['data'];
  if (data is! List) throw const FormatException('Expected data[]');
  final meta = json.objectOrNull('meta');
  final sponsored = meta?['sponsored'];
  return ServicesPage(
    items: [for (final e in data) ?ServiceProvider.tryParse(e)],
    meta: PageMeta.fromJson(meta),
    sponsored: [
      for (final e in (sponsored is List ? sponsored : const []))
        // A sponsored entry is only shown with its label.
        if (ServiceProvider.tryParse(e) case final p? when p.isSponsored) p,
    ],
    truncated: meta?.boolOr('truncated', false) ?? false,
  );
}

List<ServiceTypeCount> parseServiceTypes(Object? body) {
  final data = ApiClient.unwrapData(body);
  if (data is! List) throw const FormatException('Expected data[]');
  return [for (final t in data) ?ServiceTypeCount.tryParse(t)];
}

/// Public services directory (`/services…`, guests allowed).
///
/// Near-me requests carry a rounded point (~100 m) and are never written to
/// the offline cache (the point must not be stored — REQUIREMENTS §19).
class ServicesRepository {
  ServicesRepository({required this.api, required this.cache, required this.locale});

  final ApiClient api;
  final JsonCache cache;
  final RequestLocale Function() locale;

  static const pageSize = 20;

  String _key(String path, [String? variant]) {
    final l = locale();
    return JsonCache.key(path, lang: l.languageCode, market: l.marketCode, variant: variant);
  }

  Future<CachedResult<ServicesPage>> list(ServiceFilters filters, {int page = 1}) {
    Future<Object?> fetch() => api.getJson(
      '/services',
      query: filters.toQuery(page: page, pageSize: pageSize),
    );
    final text = filters.q?.trim() ?? '';
    if (page > 1 || filters.nearMe || text.isNotEmpty) {
      return fetch().then(
        (json) => CachedResult(data: parseServicesPage(json), savedAt: DateTime.now().toUtc(), fromCache: false),
      );
    }
    return fetchWithCache(
      cache: cache,
      key: _key('/services', filters.cacheKey),
      fetch: fetch,
      parse: parseServicesPage,
    );
  }

  Future<CachedResult<List<ServiceTypeCount>>> types() => fetchWithCache(
    cache: cache,
    key: _key('/services/types'),
    fetch: () => api.getJson('/services/types'),
    parse: parseServiceTypes,
  );

  /// Detail by slug or id. Without a point the response is cached.
  Future<CachedResult<ServiceProvider>> detail(String idOrSlug, {double? lat, double? lng}) {
    ServiceProvider parse(Object? json) =>
        ServiceProvider.tryParse(ApiClient.unwrapData(json)) ?? (throw const FormatException('Invalid provider'));
    final path = '/services/${Uri.encodeComponent(idOrSlug)}';
    if (lat != null && lng != null) {
      return api
          .getJson(path, query: {'lat': lat.toStringAsFixed(3), 'lng': lng.toStringAsFixed(3)})
          .then((json) => CachedResult(data: parse(json), savedAt: DateTime.now().toUtc(), fromCache: false));
    }
    return fetchWithCache(cache: cache, key: _key('/services/$idOrSlug'), fetch: () => api.getJson(path), parse: parse);
  }
}

final servicesRepositoryProvider = Provider<ServicesRepository>(
  (ref) => ServicesRepository(
    api: ref.watch(apiClientProvider),
    cache: ref.watch(jsonCacheProvider),
    locale: () => ref.read(requestLocaleProvider),
  ),
);
