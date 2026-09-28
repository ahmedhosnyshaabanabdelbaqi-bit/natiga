import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/interceptors/request_headers_interceptor.dart';
import '../../../core/api/paged.dart';
import '../../../core/cache/cached_fetch.dart';
import '../../../core/cache/json_cache.dart';
import '../../../core/json/json_readers.dart';
import '../domain/encyclopedia_models.dart';

/// A page of encyclopedia entries.
class EncyclopediaPage {
  const EncyclopediaPage({required this.items, required this.meta});

  final List<EncyclopediaEntrySummary> items;
  final PageMeta meta;
}

EncyclopediaPage parseEncyclopediaPage(Object? body) {
  if (body is! Map) throw const FormatException('Expected a list envelope');
  final json = asJsonObject(body);
  final data = json['data'];
  if (data is! List) throw const FormatException('Expected data[]');
  return EncyclopediaPage(
    items: [for (final e in data) ?EncyclopediaEntrySummary.tryParse(e)],
    meta: PageMeta.fromJson(json.objectOrNull('meta')),
  );
}

List<EncyclopediaCategory> parseEncyclopediaCategories(Object? body) {
  final data = ApiClient.unwrapData(body);
  if (data is! List) throw const FormatException('Expected data[]');
  final list = [for (final c in data) ?EncyclopediaCategory.tryParse(c)];
  list.sort((a, b) => (a.sortOrder ?? 1 << 30).compareTo(b.sortOrder ?? 1 << 30));
  return list;
}

/// Public encyclopedia API (`/encyclopedia…`, guests allowed). The first
/// page of each list and every entry are cached for offline reading.
class EncyclopediaRepository {
  EncyclopediaRepository({required this.api, required this.cache, required this.locale});

  final ApiClient api;
  final JsonCache cache;
  final RequestLocale Function() locale;

  static const pageSize = 20;

  String _key(String path, [String? variant]) {
    final l = locale();
    return JsonCache.key(path, lang: l.languageCode, market: l.marketCode, variant: variant);
  }

  Future<CachedResult<List<EncyclopediaCategory>>> categories() => fetchWithCache(
    cache: cache,
    key: _key('/encyclopedia/categories'),
    fetch: () => api.getJson('/encyclopedia/categories'),
    parse: parseEncyclopediaCategories,
  );

  Future<CachedResult<EncyclopediaPage>> entries({String? category, String? q, int page = 1}) {
    final query = <String, dynamic>{
      'category': ?category,
      if (q != null && q.trim().isNotEmpty) 'q': q.trim(),
      'page': page,
      'pageSize': pageSize,
    };
    Future<Object?> fetch() => api.getJson('/encyclopedia', query: query);
    // Searches and later pages are not worth an offline copy.
    if (page > 1 || query.containsKey('q')) {
      return fetch().then(
        (json) => CachedResult(data: parseEncyclopediaPage(json), savedAt: DateTime.now().toUtc(), fromCache: false),
      );
    }
    return fetchWithCache(
      cache: cache,
      key: _key('/encyclopedia', 'category=${category ?? ''}'),
      fetch: fetch,
      parse: parseEncyclopediaPage,
    );
  }

  Future<CachedResult<EncyclopediaEntryDetail>> entry(String slug) => fetchWithCache(
    cache: cache,
    key: _key('/encyclopedia/$slug'),
    fetch: () => api.getJson('/encyclopedia/${Uri.encodeComponent(slug)}'),
    parse: (json) => EncyclopediaEntryDetail.fromData(ApiClient.unwrapData(json)),
  );
}

final encyclopediaRepositoryProvider = Provider<EncyclopediaRepository>(
  (ref) => EncyclopediaRepository(
    api: ref.watch(apiClientProvider),
    cache: ref.watch(jsonCacheProvider),
    locale: () => ref.read(requestLocaleProvider),
  ),
);
