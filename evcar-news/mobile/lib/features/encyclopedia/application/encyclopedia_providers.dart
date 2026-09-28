import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/cache/cached_fetch.dart';
import '../../search/application/locale_key.dart';
import '../../search/application/paged_state.dart';
import '../data/encyclopedia_repository.dart';
import '../domain/encyclopedia_models.dart';

final encyclopediaCategoriesProvider = FutureProvider.autoDispose<CachedResult<List<EncyclopediaCategory>>>((ref) {
  ref.watch(requestLocaleProvider.select(localeKey));
  return ref.watch(encyclopediaRepositoryProvider).categories();
});

/// Filters of the encyclopedia list.
@immutable
class EncyclopediaQuery {
  const EncyclopediaQuery({this.category, this.q});

  final String? category;
  final String? q;

  @override
  bool operator ==(Object other) => other is EncyclopediaQuery && other.category == category && other.q == q;

  @override
  int get hashCode => Object.hash(category, q);
}

class EncyclopediaListController extends PagedController<EncyclopediaEntrySummary> {
  EncyclopediaListController(this.query);

  final EncyclopediaQuery query;

  @override
  void watchDependencies() {
    ref.watch(requestLocaleProvider.select(localeKey));
    ref.watch(encyclopediaRepositoryProvider);
  }

  @override
  Future<CachedResult<PageChunk<EncyclopediaEntrySummary>>> fetchPage(int page) async {
    final res = await ref
        .read(encyclopediaRepositoryProvider)
        .entries(category: query.category, q: query.q, page: page);
    return CachedResult(
      data: PageChunk(items: res.data.items, hasMore: res.data.meta.hasMore),
      savedAt: res.savedAt,
      fromCache: res.fromCache,
    );
  }

  @override
  String idOf(EncyclopediaEntrySummary item) => item.id;
}

final encyclopediaListProvider = AsyncNotifierProvider.autoDispose
    .family<EncyclopediaListController, PagedState<EncyclopediaEntrySummary>, EncyclopediaQuery>(
      EncyclopediaListController.new,
    );

final encyclopediaEntryProvider = FutureProvider.autoDispose.family<CachedResult<EncyclopediaEntryDetail>, String>((
  ref,
  slug,
) {
  ref.watch(requestLocaleProvider.select(localeKey));
  return ref.watch(encyclopediaRepositoryProvider).entry(slug);
});
