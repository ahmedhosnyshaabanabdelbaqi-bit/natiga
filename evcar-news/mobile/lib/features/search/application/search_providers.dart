import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/cache/cached_fetch.dart';
import '../data/search_repository.dart';
import '../domain/search_models.dart';
import 'locale_key.dart';
import 'paged_state.dart';

/// Delay between the last keystroke and the suggestion request.
const searchSuggestDebounce = Duration(milliseconds: 250);

class RecentSearchesController extends Notifier<List<String>> {
  RecentSearchesStore get _store => ref.read(recentSearchesStoreProvider);

  @override
  List<String> build() => ref.watch(recentSearchesStoreProvider).read();

  /// Adds [q] at the top (case-insensitive duplicates move up).
  Future<void> add(String q) async {
    final t = q.trim();
    if (!isSearchableQuery(t)) return;
    final next = [
      t,
      for (final e in state)
        if (e.toLowerCase() != t.toLowerCase()) e,
    ].take(RecentSearchesStore.maxItems).toList(growable: false);
    state = next;
    await _store.write(next);
  }

  Future<void> remove(String q) async {
    state = [
      for (final e in state)
        if (e != q) e,
    ];
    await _store.write(state);
  }

  Future<void> clear() async {
    state = const [];
    await _store.clear();
  }
}

final recentSearchesProvider = NotifierProvider<RecentSearchesController, List<String>>(RecentSearchesController.new);

/// Suggestions for the text being typed (debounced; the previous request is
/// cancelled when the text changes).
final searchSuggestionsProvider = FutureProvider.autoDispose.family<List<SearchSuggestion>, String>((ref, q) async {
  ref.watch(requestLocaleProvider.select(localeKey));
  if (!isSearchableQuery(q)) return const [];
  final cancel = CancelToken();
  ref.onDispose(cancel.cancel);
  await Future<void>.delayed(searchSuggestDebounce);
  if (!ref.mounted || cancel.isCancelled) return const [];
  return ref.read(searchRepositoryProvider).suggest(q.trim(), cancel: cancel);
});

/// Grouped results of a submitted query (5 per group).
final searchResultsProvider = FutureProvider.autoDispose.family<SearchResults, String>((ref, q) {
  ref.watch(requestLocaleProvider.select(localeKey));
  final cancel = CancelToken();
  ref.onDispose(cancel.cancel);
  return ref.read(searchRepositoryProvider).search(q.trim(), cancel: cancel);
});

/// One group, paged ("see all").
@immutable
class SearchGroupQuery {
  const SearchGroupQuery(this.q, this.type);

  final String q;
  final String type;

  @override
  bool operator ==(Object other) => other is SearchGroupQuery && other.q == q && other.type == type;

  @override
  int get hashCode => Object.hash(q, type);
}

class SearchGroupController extends PagedController<SearchHit> {
  SearchGroupController(this.query);

  final SearchGroupQuery query;

  static const pageSize = 20;

  @override
  void watchDependencies() => ref.watch(requestLocaleProvider.select(localeKey));

  @override
  Future<CachedResult<PageChunk<SearchHit>>> fetchPage(int page) async {
    final res = await ref
        .read(searchRepositoryProvider)
        .search(query.q.trim(), types: [query.type], limit: pageSize, page: page);
    final group = res.group(query.type);
    return CachedResult(
      data: PageChunk(items: group?.items ?? const [], hasMore: (group?.hasMore ?? false) && page < 50, extra: res),
      savedAt: DateTime.now().toUtc(),
      fromCache: false,
    );
  }

  @override
  String idOf(SearchHit item) => '${item.type}:${item.id}';
}

final searchGroupProvider = AsyncNotifierProvider.autoDispose
    .family<SearchGroupController, PagedState<SearchHit>, SearchGroupQuery>(SearchGroupController.new);
