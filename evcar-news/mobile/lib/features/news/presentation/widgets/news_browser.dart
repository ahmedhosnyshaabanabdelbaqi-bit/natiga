import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/app_config/app_config_controller.dart';
import '../../../../core/app_config/features.dart';
import '../../../../shared/widgets/kit.dart';
import '../../application/news_providers.dart';
import '../../domain/article.dart';
import '../../domain/news_query.dart';
import 'news_feed.dart';
import 'news_filter_sheet.dart';
import 'saved_articles_sliver.dart';

/// Shared page for `/news`, `/news/category/:slug` and `/news/tag/:slug`:
/// large title, filter bar (filters sheet, category chips, "Saved offline"),
/// pull-to-refresh and the infinite feed.
class NewsBrowser extends ConsumerStatefulWidget {
  const NewsBrowser({
    super.key,
    required this.title,
    this.initialQuery = const NewsQuery(),
    this.showCategoryChips = false,
    this.showSavedChip = false,
    this.header,
    this.now,
  });

  final String title;

  /// Starting filters. A category/tag set here is the page's fixed scope
  /// unless [showCategoryChips] lets the reader change the category.
  final NewsQuery initialQuery;
  final bool showCategoryChips;
  final bool showSavedChip;

  /// Extra content under the filter bar (e.g. a category description).
  final Widget? header;

  /// Injectable clock for tests.
  final DateTime? now;

  @override
  ConsumerState<NewsBrowser> createState() => _NewsBrowserState();
}

class _NewsBrowserState extends ConsumerState<NewsBrowser> {
  late NewsQuery _query = widget.initialQuery;
  bool _savedMode = false;

  void _setQuery(NewsQuery q) => setState(() {
    _query = q;
    _savedMode = false;
  });

  Future<void> _openFilters() async {
    final next = await showNewsFilterSheet(context, _query);
    if (next != null && mounted) _setQuery(next);
  }

  Future<void> _refresh() async {
    if (_savedMode) {
      ref.invalidate(savedArticlesProvider);
      await ref.read(savedArticlesProvider.future);
      return;
    }
    if (widget.showCategoryChips) ref.invalidate(newsCategoriesProvider);
    try {
      ref.invalidate(newsFeedProvider(_query));
      await ref.read(newsFeedProvider(_query).future);
    } on Object {
      // The feed shows the error state itself.
    }
  }

  List<Widget> _categoryChips(List<NewsCategory> categories) {
    final l10n = context.l10n;
    final top = categories.where((c) => c.parentId == null).toList();
    return [
      AppFilterChip(
        label: l10n.newsFilterAll,
        selected: !_savedMode && _query.category == null,
        onSelected: (_) => _setQuery(_query.copyWith(category: () => null)),
      ),
      for (final c in top)
        AppFilterChip(
          label: c.name,
          selected: !_savedMode && _query.category == c.slug,
          onSelected: (_) => _setQuery(_query.copyWith(category: () => c.slug)),
        ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final searchOn = Features.searchable.any((f) => ref.watch(featureFlagProvider(f)));
    final categories = widget.showCategoryChips
        ? (ref.watch(newsCategoriesProvider).value?.data ?? const <NewsCategory>[])
        : const <NewsCategory>[];

    final chips = <Widget>[
      if (widget.showCategoryChips) ..._categoryChips(categories),
      if (widget.showSavedChip)
        AppFilterChip(
          label: l10n.newsFilterSaved,
          icon: Icons.download_done,
          selected: _savedMode,
          onSelected: (v) => setState(() => _savedMode = v),
        ),
    ];

    final filtered = _query.activeFilterCount > 0;
    return AppScaffold.slivers(
      title: widget.title,
      largeTitle: true,
      onRefresh: _refresh,
      actions: [
        if (searchOn)
          IconButton(
            tooltip: l10n.newsSearch,
            icon: const Icon(Icons.search),
            onPressed: () => context.push(AppRoutes.search()),
          ),
      ],
      slivers: [
        SliverToBoxAdapter(
          child: Semantics(
            container: true,
            label: l10n.newsCategoriesLabel,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
              child: FilterBar(
                activeCount: _query.activeFilterCount,
                onOpenFilters: _savedMode ? null : _openFilters,
                chips: chips,
              ),
            ),
          ),
        ),
        if (widget.header != null) SliverToBoxAdapter(child: widget.header),
        if (_savedMode)
          SavedArticlesSliver(now: widget.now)
        else
          NewsFeedSliver(
            key: ValueKey(_query),
            query: _query,
            heroFirst: _query.category == null && _query.tag == null && _query.type == null,
            emptyMessage: filtered ? l10n.newsEmptyFilteredMessage : null,
            emptyActions: [
              if (filtered)
                StateAction(
                  label: l10n.newsClearFilters,
                  icon: Icons.filter_alt_off_outlined,
                  primary: true,
                  onPressed: () => _setQuery(NewsQuery(category: _query.category, tag: _query.tag)),
                ),
            ],
            onOpenSaved: widget.showSavedChip ? () => setState(() => _savedMode = true) : null,
            now: widget.now,
          ),
      ],
    );
  }
}
