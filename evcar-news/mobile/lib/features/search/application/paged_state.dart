import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/cache/cached_fetch.dart';

/// One fetched page: items, whether more exist, and the offline flag.
@immutable
class PageChunk<T> {
  const PageChunk({required this.items, required this.hasMore, this.extra});

  final List<T> items;
  final bool hasMore;

  /// Page-level data besides the items (e.g. the sponsored slot).
  final Object? extra;
}

/// State of an infinite list shared by the discovery screens (search "see
/// all", encyclopedia, services directory).
@immutable
class PagedState<T> {
  const PagedState({
    required this.items,
    required this.page,
    required this.hasMore,
    this.fromCache = false,
    this.savedAt,
    this.loadingMore = false,
    this.loadMoreError,
    this.extra,
  });

  final List<T> items;
  final int page;
  final bool hasMore;

  /// The first page is an offline copy (show `CachedDataNotice`).
  final bool fromCache;
  final DateTime? savedAt;
  final bool loadingMore;
  final Object? loadMoreError;

  /// Page-level data of the first page.
  final Object? extra;

  PagedState<T> copyWith({
    List<T>? items,
    int? page,
    bool? hasMore,
    bool? loadingMore,
    Object? Function()? loadMoreError,
  }) => PagedState(
    items: items ?? this.items,
    page: page ?? this.page,
    hasMore: hasMore ?? this.hasMore,
    fromCache: fromCache,
    savedAt: savedAt,
    loadingMore: loadingMore ?? this.loadingMore,
    loadMoreError: loadMoreError != null ? loadMoreError() : this.loadMoreError,
    extra: extra,
  );
}

/// Infinite-list controller: subclasses implement [fetchPage] and [idOf];
/// duplicates across pages are dropped; an offline first page cannot be
/// continued (needs the network).
abstract class PagedController<T> extends AsyncNotifier<PagedState<T>> {
  Future<CachedResult<PageChunk<T>>> fetchPage(int page);

  String idOf(T item);

  /// Called at the start of [build] to watch dependencies (language …).
  void watchDependencies() {}

  @override
  Future<PagedState<T>> build() async {
    watchDependencies();
    final res = await fetchPage(1);
    return PagedState(
      items: _dedupe(const [], res.data.items),
      page: 1,
      hasMore: !res.fromCache && res.data.hasMore,
      fromCache: res.fromCache,
      savedAt: res.savedAt,
      extra: res.data.extra,
    );
  }

  List<T> _dedupe(List<T> existing, List<T> next) {
    final seen = {for (final e in existing) idOf(e)};
    return [
      ...existing,
      for (final e in next)
        if (seen.add(idOf(e))) e,
    ];
  }

  /// Loads the next page (no-op while loading or at the end).
  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || current.loadingMore || !current.hasMore || state.isLoading) return;
    state = AsyncData(current.copyWith(loadingMore: true, loadMoreError: () => null));
    try {
      final res = await fetchPage(current.page + 1);
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
