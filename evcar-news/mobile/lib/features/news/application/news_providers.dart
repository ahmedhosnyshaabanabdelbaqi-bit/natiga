import 'dart:async';

import 'package:flutter/painting.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/cache/cached_fetch.dart';
import '../data/news_repository.dart';
import '../data/saved_articles_repository.dart';
import '../domain/article.dart';
import '../domain/news_query.dart';

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

/// Active categories (sorted), refetched when language or market changes.
final newsCategoriesProvider = FutureProvider<CachedResult<List<NewsCategory>>>((ref) {
  ref.watch(requestLocaleProvider);
  return ref.watch(newsRepositoryProvider).categories();
});

final newsCategoryProvider = FutureProvider.autoDispose.family<CachedResult<NewsCategory>, String>((ref, slug) {
  ref.watch(requestLocaleProvider);
  return ref.watch(newsRepositoryProvider).category(slug);
});

final newsTagProvider = FutureProvider.autoDispose.family<CachedResult<NewsTag>, String>((ref, slug) {
  ref.watch(requestLocaleProvider);
  return ref.watch(newsRepositoryProvider).tag(slug);
});

// ---------------------------------------------------------------------------
// Feed (infinite scroll)
// ---------------------------------------------------------------------------

/// State of a paginated feed.
class NewsFeedState {
  const NewsFeedState({
    required this.items,
    required this.page,
    required this.hasMore,
    this.fromCache = false,
    this.savedAt,
    this.loadingMore = false,
    this.loadMoreError,
  });

  final List<ArticleSummary> items;

  /// Last page loaded.
  final int page;
  final bool hasMore;

  /// First page is an offline copy (show `CachedDataNotice`).
  final bool fromCache;
  final DateTime? savedAt;
  final bool loadingMore;

  /// Error of the last "load more" (shown inline with a retry button).
  final Object? loadMoreError;

  NewsFeedState copyWith({
    List<ArticleSummary>? items,
    int? page,
    bool? hasMore,
    bool? loadingMore,
    Object? Function()? loadMoreError,
  }) => NewsFeedState(
    items: items ?? this.items,
    page: page ?? this.page,
    hasMore: hasMore ?? this.hasMore,
    fromCache: fromCache,
    savedAt: savedAt,
    loadingMore: loadingMore ?? this.loadingMore,
    loadMoreError: loadMoreError != null ? loadMoreError() : this.loadMoreError,
  );
}

class NewsFeedController extends AsyncNotifier<NewsFeedState> {
  NewsFeedController(this.query);

  final NewsQuery query;

  NewsRepository get _repo => ref.read(newsRepositoryProvider);

  @override
  Future<NewsFeedState> build() async {
    // Language / market are part of every request: refetch when they change.
    ref.watch(requestLocaleProvider);
    final res = await ref.watch(newsRepositoryProvider).feedPage(query);
    return NewsFeedState(
      items: _dedupe(const [], res.data.items),
      page: 1,
      // An offline copy cannot be continued without the network.
      hasMore: !res.fromCache && res.data.hasMore,
      fromCache: res.fromCache,
      savedAt: res.savedAt,
    );
  }

  static List<ArticleSummary> _dedupe(List<ArticleSummary> existing, List<ArticleSummary> next) {
    final seen = {for (final a in existing) a.id};
    return [
      ...existing,
      for (final a in next)
        if (seen.add(a.id)) a,
    ];
  }

  /// Loads the next page (no-op while loading, at the end, or offline copy).
  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || current.loadingMore || !current.hasMore || state.isLoading) return;
    state = AsyncData(current.copyWith(loadingMore: true, loadMoreError: () => null));
    try {
      final res = await _repo.feedPage(query, page: current.page + 1);
      if (!ref.mounted) return;
      final latest = state.value ?? current;
      state = AsyncData(
        latest.copyWith(
          items: _dedupe(latest.items, res.data.items),
          page: current.page + 1,
          hasMore: res.data.hasMore && res.data.items.isNotEmpty,
          loadingMore: false,
        ),
      );
    } on Object catch (e) {
      if (!ref.mounted) return;
      final latest = state.value ?? current;
      state = AsyncData(latest.copyWith(loadingMore: false, loadMoreError: () => e));
    }
  }
}

final newsFeedProvider = AsyncNotifierProvider.autoDispose.family<NewsFeedController, NewsFeedState, NewsQuery>(
  NewsFeedController.new,
);

// ---------------------------------------------------------------------------
// Saved for offline reading
// ---------------------------------------------------------------------------

class SavedArticlesController extends AsyncNotifier<List<SavedArticle>> {
  SavedArticlesRepository get _repo => ref.read(savedArticlesRepositoryProvider);

  @override
  Future<List<SavedArticle>> build() => ref.watch(savedArticlesRepositoryProvider).list();

  Future<SavedArticle> save(ArticleDetail article) async {
    final saved = await _repo.save(article, lang: ref.read(effectiveLanguageProvider));
    state = AsyncData(await _repo.list());
    return saved;
  }

  Future<void> remove(String articleId) async {
    await _repo.remove(articleId);
    state = AsyncData(await _repo.list());
  }
}

final savedArticlesProvider = AsyncNotifierProvider<SavedArticlesController, List<SavedArticle>>(
  SavedArticlesController.new,
);

/// Whether an article (by id) has an offline copy.
final isArticleSavedProvider = Provider.family<bool, String>(
  (ref, id) => ref.watch(savedArticlesProvider).value?.any((s) => s.article.id == id) ?? false,
);

// ---------------------------------------------------------------------------
// Article reader
// ---------------------------------------------------------------------------

/// Where the article on screen comes from.
enum ArticleOrigin {
  /// Fresh from the server.
  live,

  /// Last automatically cached response (offline).
  cache,

  /// Copy the user saved for offline reading.
  saved,
}

class ArticleView {
  const ArticleView({required this.article, required this.origin, this.savedAt, this.localImages = const {}});

  final ArticleDetail article;
  final ArticleOrigin origin;

  /// Time of the copy when [origin] is not live.
  final DateTime? savedAt;

  /// Images stored on the device (URL → provider), used before the network.
  final Map<String, ImageProvider> localImages;

  bool get isOfflineCopy => origin != ArticleOrigin.live;
}

/// Loads an article: network first; offline → the newer of the saved copy
/// and the cached response. When a saved copy exists and the article changed
/// on the server (e.g. a correction), the saved copy is refreshed in the
/// background so offline reading stays accurate.
final articleViewProvider = FutureProvider.autoDispose.family<ArticleView, String>((ref, slug) async {
  ref.watch(requestLocaleProvider);
  final repo = ref.watch(newsRepositoryProvider);
  final savedRepo = ref.watch(savedArticlesRepositoryProvider);
  final lang = ref.read(effectiveLanguageProvider);

  CachedResult<ArticleDetail>? result;
  Object? error;
  StackTrace? stack;
  try {
    result = await repo.article(slug);
  } on ApiException catch (e, s) {
    if (!(e.isConnectivityProblem || e.kind == ApiErrorKind.server)) rethrow;
    error = e;
    stack = s;
  }

  final saved = await savedRepo.find(slug, lang: lang);
  final images = saved == null ? const <String, ImageProvider>{} : await savedRepo.localImages(saved);

  if (result != null && !result.fromCache) {
    if (saved != null && ref.mounted && _changed(saved.article, result.data)) {
      unawaited(ref.read(savedArticlesProvider.notifier).save(result.data).then((_) {}, onError: (Object _) {}));
    }
    return ArticleView(article: result.data, origin: ArticleOrigin.live, localImages: images);
  }
  if (saved != null && (result == null || !saved.savedAt.isBefore(result.savedAt))) {
    return ArticleView(
      article: saved.article,
      origin: ArticleOrigin.saved,
      savedAt: saved.savedAt,
      localImages: images,
    );
  }
  if (result != null) {
    return ArticleView(article: result.data, origin: ArticleOrigin.cache, savedAt: result.savedAt, localImages: images);
  }
  Error.throwWithStackTrace(error!, stack!);
});

bool _changed(ArticleDetail saved, ArticleDetail live) =>
    saved.updatedAt != live.updatedAt ||
    saved.contentUpdatedAt != live.contentUpdatedAt ||
    saved.corrections.length != live.corrections.length ||
    saved.language != live.language;
