import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/interceptors/request_headers_interceptor.dart';
import '../../../core/api/paged.dart';
import '../../../core/cache/cached_fetch.dart';
import '../../../core/cache/json_cache.dart';
import '../../../core/json/json_readers.dart';
import '../domain/article.dart';
import '../domain/news_query.dart';

/// One page of a news feed.
class NewsPage {
  const NewsPage({required this.items, required this.meta});

  final List<ArticleSummary> items;
  final PageMeta meta;

  bool get hasMore => meta.hasMore;
}

/// Parses a `{data: [...], meta}` list body. Malformed items (no slug or
/// title) are skipped instead of failing the whole page.
NewsPage parseNewsPage(Object? body) {
  if (body is! Map) throw const FormatException('Expected a list envelope');
  final json = asJsonObject(body);
  final data = json['data'];
  if (data is! List) throw const FormatException('Expected data[]');
  return NewsPage(
    items: [for (final item in data) ?ArticleSummary.tryParse(item)],
    meta: PageMeta.fromJson(json.objectOrNull('meta')),
  );
}

List<NewsCategory> parseCategories(Object? body) {
  final data = ApiClient.unwrapData(body);
  if (data is! List) throw const FormatException('Expected data[]');
  final list = [for (final c in data) ?NewsCategory.tryParse(c)];
  list.sort((a, b) => (a.sortOrder ?? 1 << 30).compareTo(b.sortOrder ?? 1 << 30));
  return list;
}

/// `GET /articles`, `/articles/:slug`, `/categories`, `/tags` (public, guests
/// allowed). Every read that a screen opens with goes through
/// [fetchWithCache], so the last copy is shown (labelled as saved) when the
/// device is offline. Cache keys contain language + market.
class NewsRepository {
  NewsRepository({required this.api, required this.cache, required this.locale});

  final ApiClient api;
  final JsonCache cache;

  /// Language + market of the next request (read per call).
  final RequestLocale Function() locale;

  static const pageSize = 20;

  String _key(String path, [String? variant]) {
    final l = locale();
    return JsonCache.key(path, lang: l.languageCode, market: l.marketCode, variant: variant);
  }

  /// Page [page] of [query]. The first page is cached for offline use;
  /// further pages need the network.
  Future<CachedResult<NewsPage>> feedPage(NewsQuery query, {int page = 1}) {
    Future<Object?> fetch() => api.getJson(
      '/articles',
      query: query.toQueryParameters(page: page, pageSize: pageSize),
    );
    if (page > 1) {
      return fetch().then(
        (json) => CachedResult(data: parseNewsPage(json), savedAt: DateTime.now().toUtc(), fromCache: false),
      );
    }
    return fetchWithCache(cache: cache, key: _key('/articles', query.cacheKey), fetch: fetch, parse: parseNewsPage);
  }

  /// `GET /articles/:slug` (slug or id). 404 → `ApiException` (not found).
  Future<CachedResult<ArticleDetail>> article(String slug) => fetchWithCache(
    cache: cache,
    key: _key('/articles/$slug'),
    fetch: () => api.getJson('/articles/${Uri.encodeComponent(slug)}'),
    parse: (json) => ArticleDetail.fromData(ApiClient.unwrapData(json)),
  );

  Future<CachedResult<List<NewsCategory>>> categories() => fetchWithCache(
    cache: cache,
    key: _key('/categories'),
    fetch: () => api.getJson('/categories'),
    parse: parseCategories,
  );

  Future<CachedResult<NewsCategory>> category(String slug) => fetchWithCache(
    cache: cache,
    key: _key('/categories/$slug'),
    fetch: () => api.getJson('/categories/${Uri.encodeComponent(slug)}'),
    parse: (json) =>
        NewsCategory.tryParse(ApiClient.unwrapData(json)) ?? (throw const FormatException('Invalid category')),
  );

  Future<CachedResult<NewsTag>> tag(String slug) => fetchWithCache(
    cache: cache,
    key: _key('/tags/$slug'),
    fetch: () => api.getJson('/tags/${Uri.encodeComponent(slug)}'),
    parse: (json) => NewsTag.tryParse(ApiClient.unwrapData(json)) ?? (throw const FormatException('Invalid tag')),
  );

  /// Anonymous read counter (`POST /articles/:slug/view` → 204). Best effort:
  /// never throws.
  Future<void> recordView(String slug) async {
    try {
      await api.send('POST', '/articles/${Uri.encodeComponent(slug)}/view', skipAuth: true);
    } on Object {
      // Counting a view must never disturb reading.
    }
  }
}

final newsRepositoryProvider = Provider<NewsRepository>(
  (ref) => NewsRepository(
    api: ref.watch(apiClientProvider),
    cache: ref.watch(jsonCacheProvider),
    locale: () => ref.read(requestLocaleProvider),
  ),
);
