import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/cache/cached_fetch.dart';
import '../data/tours_repository.dart';
import '../domain/tour_models.dart';

/// State of the `/tours` list (infinite scroll).
@immutable
class ToursListState {
  const ToursListState({
    required this.items,
    required this.page,
    required this.hasMore,
    this.total,
    this.fromCache = false,
    this.savedAt,
    this.loadingMore = false,
    this.loadMoreError,
  });

  final List<TourCard> items;
  final int page;
  final bool hasMore;
  final int? total;
  final bool fromCache;
  final DateTime? savedAt;
  final bool loadingMore;
  final Object? loadMoreError;

  ToursListState copyWith({
    List<TourCard>? items,
    int? page,
    bool? hasMore,
    bool? loadingMore,
    Object? Function()? loadMoreError,
  }) => ToursListState(
    items: items ?? this.items,
    page: page ?? this.page,
    hasMore: hasMore ?? this.hasMore,
    total: total,
    fromCache: fromCache,
    savedAt: savedAt,
    loadingMore: loadingMore ?? this.loadingMore,
    loadMoreError: loadMoreError != null ? loadMoreError() : this.loadMoreError,
  );
}

class ToursListController extends AsyncNotifier<ToursListState> {
  @override
  Future<ToursListState> build() async {
    ref.watch(requestLocaleProvider);
    final res = await ref.watch(toursRepositoryProvider).tours();
    return ToursListState(
      items: _dedupe(const [], res.data.items),
      page: 1,
      hasMore: !res.fromCache && res.data.hasMore,
      total: res.data.meta.total,
      fromCache: res.fromCache,
      savedAt: res.savedAt,
    );
  }

  static List<TourCard> _dedupe(List<TourCard> existing, List<TourCard> next) {
    final seen = {for (final t in existing) t.id};
    return [
      ...existing,
      for (final t in next)
        if (seen.add(t.id)) t,
    ];
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || current.loadingMore || !current.hasMore || state.isLoading) return;
    state = AsyncData(current.copyWith(loadingMore: true, loadMoreError: () => null));
    try {
      final res = await ref.read(toursRepositoryProvider).tours(page: current.page + 1);
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

final toursListProvider = AsyncNotifierProvider.autoDispose<ToursListController, ToursListState>(
  ToursListController.new,
);

/// Home-page strip of tours (for the home feature): real tours before demo
/// tours, request market only.
final featuredToursProvider = FutureProvider.autoDispose<CachedResult<List<TourCard>>>((ref) {
  ref.watch(requestLocaleProvider);
  return ref.watch(toursRepositoryProvider).featured();
});

/// Tour detail for the viewer: `(idOrSlug, maxWidth)`.
typedef TourDetailArgs = ({String idOrSlug, int maxWidth});

final tourDetailProvider = FutureProvider.autoDispose.family<CachedResult<TourDetail>, TourDetailArgs>((ref, args) {
  ref.watch(requestLocaleProvider);
  return ref.watch(toursRepositoryProvider).tour(args.idOrSlug, maxWidth: args.maxWidth);
});
