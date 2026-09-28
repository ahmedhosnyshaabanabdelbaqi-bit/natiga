import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/cache/cached_fetch.dart';
import '../data/cars_repository.dart';
import '../domain/cars_query.dart';
import '../domain/catalog_models.dart';
import '../domain/variant_sheet.dart';

// ---------------------------------------------------------------------------
// Catalog (infinite list)
// ---------------------------------------------------------------------------

class CatalogState {
  const CatalogState({
    required this.items,
    required this.page,
    required this.hasMore,
    this.total,
    this.currencyCode,
    this.fromCache = false,
    this.savedAt,
    this.loadingMore = false,
    this.loadMoreError,
  });

  final List<CarSummary> items;
  final int page;
  final bool hasMore;
  final int? total;
  final String? currencyCode;
  final bool fromCache;
  final DateTime? savedAt;
  final bool loadingMore;
  final Object? loadMoreError;

  CatalogState copyWith({
    List<CarSummary>? items,
    int? page,
    bool? hasMore,
    bool? loadingMore,
    Object? Function()? loadMoreError,
  }) => CatalogState(
    items: items ?? this.items,
    page: page ?? this.page,
    hasMore: hasMore ?? this.hasMore,
    total: total,
    currencyCode: currencyCode,
    fromCache: fromCache,
    savedAt: savedAt,
    loadingMore: loadingMore ?? this.loadingMore,
    loadMoreError: loadMoreError != null ? loadMoreError() : this.loadMoreError,
  );
}

class CatalogController extends AsyncNotifier<CatalogState> {
  CatalogController(this.query);

  final CarsQuery query;

  @override
  Future<CatalogState> build() async {
    ref.watch(requestLocaleProvider);
    final res = await ref.watch(carsRepositoryProvider).carsPage(query);
    return CatalogState(
      items: _dedupe(const [], res.data.items),
      page: 1,
      hasMore: !res.fromCache && res.data.hasMore,
      total: res.data.meta.total,
      currencyCode: res.data.currencyCode,
      fromCache: res.fromCache,
      savedAt: res.savedAt,
    );
  }

  static List<CarSummary> _dedupe(List<CarSummary> existing, List<CarSummary> next) {
    final seen = {for (final c in existing) c.id};
    return [
      ...existing,
      for (final c in next)
        if (seen.add(c.id)) c,
    ];
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || current.loadingMore || !current.hasMore || state.isLoading) return;
    state = AsyncData(current.copyWith(loadingMore: true, loadMoreError: () => null));
    try {
      final res = await ref.read(carsRepositoryProvider).carsPage(query, page: current.page + 1);
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

final catalogProvider = AsyncNotifierProvider.autoDispose.family<CatalogController, CatalogState, CarsQuery>(
  CatalogController.new,
);

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------

/// All brands (strip on the catalog + `/brands`).
final brandsProvider = FutureProvider.autoDispose<CachedResult<List<BrandSummary>>>((ref) {
  ref.watch(requestLocaleProvider);
  return ref.watch(carsRepositoryProvider).brands();
});

final brandProvider = FutureProvider.autoDispose.family<CachedResult<BrandDetail>, String>((ref, slug) {
  ref.watch(requestLocaleProvider);
  return ref.watch(carsRepositoryProvider).brand(slug);
});

// ---------------------------------------------------------------------------
// Car page + spec sheet
// ---------------------------------------------------------------------------

/// A car / trim page request: slug + the market chosen on that page.
@immutable
class MarketKey {
  const MarketKey(this.slug, this.market);

  final String slug;

  /// ISO market code the user picked on the page.
  final String market;

  @override
  bool operator ==(Object other) => other is MarketKey && other.slug == slug && other.market == market;

  @override
  int get hashCode => Object.hash(slug, market);

  @override
  String toString() => '$slug@$market';
}

final carDetailProvider = FutureProvider.autoDispose.family<CachedResult<CarDetail>, MarketKey>((ref, key) {
  ref.watch(effectiveLanguageProvider);
  return ref.watch(carsRepositoryProvider).car(key.slug, market: key.market);
});

final variantSheetProvider = FutureProvider.autoDispose.family<VariantView, MarketKey>((ref, key) {
  ref.watch(effectiveLanguageProvider);
  return ref.watch(carsRepositoryProvider).variant(key.slug, market: key.market);
});

/// When this trim (id) + market was saved for offline reading (null = not saved).
class SavedSheetController extends AsyncNotifier<DateTime?> {
  SavedSheetController(this.key);

  /// [MarketKey.slug] holds the variant id here.
  final MarketKey key;

  @override
  Future<DateTime?> build() {
    ref.watch(effectiveLanguageProvider);
    return ref.watch(carsRepositoryProvider).savedAt(key.slug, market: key.market);
  }

  Future<DateTime> save(VariantView view) async {
    final at = await ref.read(carsRepositoryProvider).saveSheet(view);
    state = AsyncData(at);
    return at;
  }

  Future<void> remove() async {
    await ref.read(carsRepositoryProvider).removeSavedSheet(key.slug, market: key.market);
    state = const AsyncData(null);
  }
}

final savedSheetProvider = AsyncNotifierProvider.autoDispose.family<SavedSheetController, DateTime?, MarketKey>(
  SavedSheetController.new,
);

// ---------------------------------------------------------------------------
// Owner reviews (community API)
// ---------------------------------------------------------------------------

class OwnerReviews {
  const OwnerReviews({required this.summary, required this.top});

  final ReviewsSummary summary;
  final List<ReviewPreview> top;
}

final ownerReviewsProvider = FutureProvider.autoDispose.family<OwnerReviews, String>((ref, variantId) async {
  ref.watch(effectiveLanguageProvider);
  final repo = ref.watch(carsRepositoryProvider);
  final summary = await repo.reviewsSummary(variantId);
  final top = summary.count > 0 ? await repo.topReviews(variantId) : const <ReviewPreview>[];
  return OwnerReviews(summary: summary, top: top);
});
