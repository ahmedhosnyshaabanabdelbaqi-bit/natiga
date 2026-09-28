import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/app_config/app_config_controller.dart';
import '../../../core/app_config/features.dart';
import '../../../shared/widgets/kit.dart';
import '../application/paged_state.dart';
import '../application/search_providers.dart';
import '../data/search_repository.dart';
import '../domain/search_models.dart';
import 'widgets/paged_footer.dart';
import 'widgets/search_hit_tile.dart';

/// Unified search (`/search?q=`): news, brands, models, trims, stations,
/// encyclopedia and services, in Arabic or English with alternative
/// spellings (server aliases). Debounced suggestions while typing, grouped
/// results with "see all" per group, recent searches kept on the device.
class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key, this.initialQuery});

  /// Optional `q` query parameter.
  final String? initialQuery;

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  late final TextEditingController _controller;
  final _focus = FocusNode();

  /// Query whose results are on screen (null = none yet).
  String? _submitted;

  /// Group shown alone ("see all"); null = every group.
  String? _type;

  @override
  void initState() {
    super.initState();
    final initial = widget.initialQuery?.trim() ?? '';
    _controller = TextEditingController(text: initial);
    _controller.addListener(_onText);
    if (isSearchableQuery(initial)) {
      _submitted = initial;
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _focus.requestFocus();
      });
    }
  }

  @override
  void dispose() {
    _controller.removeListener(_onText);
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _onText() => setState(() {});

  String get _text => _controller.text.trim();

  void _submit(String q) {
    final t = q.trim();
    if (t.isEmpty) return;
    if (!isSearchableQuery(t)) {
      showAppSnackBar(context, context.l10n.searchInvalidQuery, icon: Icons.info_outline);
      return;
    }
    if (_controller.text != t) {
      _controller.value = TextEditingValue(text: t, selection: TextSelection.collapsed(offset: t.length));
    }
    _focus.unfocus();
    ref.read(recentSearchesProvider.notifier).add(t);
    setState(() {
      _submitted = t;
      _type = null;
    });
  }

  void _clear() {
    _controller.clear();
    setState(() {
      _submitted = null;
      _type = null;
    });
    _focus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final showingResults = _submitted != null && _text == _submitted;
    final Widget body;
    if (_text.isEmpty) {
      body = _StartView(onPick: _submit);
    } else if (!showingResults) {
      body = _SuggestionsView(query: _controller.text, onSearch: _submit);
    } else if (_type != null) {
      body = _GroupView(query: _submitted!, type: _type!, onBack: () => setState(() => _type = null));
    } else {
      body = _ResultsView(query: _submitted!, onSeeAll: (t) => setState(() => _type = t));
    }
    return AppScaffold(
      titleWidget: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
        child: TextField(
          controller: _controller,
          focusNode: _focus,
          autofocus: false,
          textInputAction: TextInputAction.search,
          maxLength: SearchRepository.maxQueryLength,
          onSubmitted: _submit,
          decoration: InputDecoration(
            hintText: l10n.searchHint,
            counterText: '',
            border: InputBorder.none,
            enabledBorder: InputBorder.none,
            focusedBorder: InputBorder.none,
            filled: false,
            isDense: true,
          ),
        ),
      ),
      actions: [
        if (_controller.text.isNotEmpty)
          IconButton(tooltip: l10n.commonClearSearch, icon: const Icon(Icons.close), onPressed: _clear)
        else
          IconButton(tooltip: l10n.searchTitle, icon: const Icon(Icons.search), onPressed: () => _submit(_text)),
      ],
      body: AnimatedSwitcher(duration: AppMotion.of(context, AppMotion.fast), child: KeyedSubtree(key: ValueKey(body.runtimeType), child: body)),
    );
  }
}

// ---------------------------------------------------------------------------
// Empty field: recent searches + what can be searched
// ---------------------------------------------------------------------------

class _StartView extends ConsumerWidget {
  const _StartView({required this.onPick});

  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final recent = ref.watch(recentSearchesProvider);
    final config = ref.watch(appConfigProvider);
    return ListView(
      padding: EdgeInsets.symmetric(horizontal: context.pageGutter, vertical: AppSpacing.md),
      children: [
        if (recent.isNotEmpty) ...[
          SectionHeader(
            title: l10n.searchRecentTitle,
            icon: Icons.history,
            padding: EdgeInsets.zero,
            trailing: TextButton(
              onPressed: () async {
                final ok = await showConfirmSheet(
                  context: context,
                  title: l10n.searchClearRecentTitle,
                  message: l10n.searchClearRecentMessage,
                  confirmLabel: l10n.searchClearRecent,
                  destructive: true,
                );
                if (ok) await ref.read(recentSearchesProvider.notifier).clear();
              },
              child: Text(l10n.searchClearRecent),
            ),
          ),
          for (final q in recent)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.history),
              title: Text(q, maxLines: 1, overflow: TextOverflow.ellipsis),
              onTap: () => onPick(q),
              trailing: IconButton(
                tooltip: l10n.searchRemoveRecent(q),
                icon: const Icon(Icons.close),
                onPressed: () => ref.read(recentSearchesProvider.notifier).remove(q),
              ),
            ),
          const SizedBox(height: AppSpacing.lg),
          Text(
            l10n.searchRecentPrivacy,
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ] else
          Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
            child: EmptyState(
              icon: Icons.manage_search,
              title: l10n.searchStartTitle,
              message: l10n.searchStartMessage,
              compact: true,
            ),
          ),
        const SizedBox(height: AppSpacing.lg),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          alignment: WrapAlignment.center,
          children: [
            if (config.isFeatureEnabled(Features.encyclopedia))
              ActionChip(
                avatar: const Icon(Icons.menu_book_outlined, size: 18),
                label: Text(l10n.searchBrowseEncyclopedia),
                onPressed: () => context.push(AppRoutes.encyclopedia),
              ),
            if (config.isFeatureEnabled(Features.servicesDirectory))
              ActionChip(
                avatar: const Icon(Icons.handyman_outlined, size: 18),
                label: Text(l10n.searchBrowseServices),
                onPressed: () => context.push(AppRoutes.services),
              ),
            if (config.isFeatureEnabled(Features.cars))
              ActionChip(
                avatar: const Icon(Icons.local_offer_outlined, size: 18),
                label: Text(l10n.searchBrowseBrands),
                onPressed: () => context.push(AppRoutes.brands),
              ),
          ],
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Typing: suggestions
// ---------------------------------------------------------------------------

class _SuggestionsView extends ConsumerWidget {
  const _SuggestionsView({required this.query, required this.onSearch});

  final String query;
  final ValueChanged<String> onSearch;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final q = query.trim();
    final value = ref.watch(searchSuggestionsProvider(q));
    // Previous suggestions stay visible while the next ones load.
    final items = value.value ?? const <SearchSuggestion>[];
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      children: [
        ListTile(
          leading: const Icon(Icons.search),
          title: Text(l10n.searchFor(q), maxLines: 2, overflow: TextOverflow.ellipsis),
          onTap: () => onSearch(q),
        ),
        if (value.isLoading && items.isEmpty) const LinearProgressIndicator(minHeight: 2),
        for (final s in items)
          ListTile(
            leading: Icon(s.isEntity ? searchTypeIcon(s.type) : Icons.search),
            title: HighlightedText(s.text, ranges: s.highlights, maxLines: 2),
            subtitle: Text(searchHitTypeLabel(l10n, s.isEntity ? s.type : null)),
            trailing: Icon(s.isEntity ? Icons.chevron_right : Icons.north_west, size: 20),
            onTap: () {
              final route = s.route;
              if (route != null) {
                ref.read(recentSearchesProvider.notifier).add(q);
                context.push(route);
              } else {
                onSearch(s.text);
              }
            },
          ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Grouped results
// ---------------------------------------------------------------------------

class _ResultsView extends ConsumerWidget {
  const _ResultsView({required this.query, required this.onSeeAll});

  final String query;
  final ValueChanged<String> onSeeAll;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final provider = searchResultsProvider(query);
    final value = ref.watch(provider);
    return AsyncStateView<SearchResults>(
      value: value,
      onRetry: () => ref.invalidate(provider),
      isEmpty: (r) => r.nonEmptyGroups.isEmpty,
      emptyIcon: Icons.search_off,
      emptyTitle: l10n.searchNoResultsTitle,
      emptyMessage: l10n.searchNoResultsMessage(query),
      loading: const Skeleton(child: SkeletonList(item: ListTileSkeleton(), count: 6)),
      builder: (context, r) {
        final groups = r.nonEmptyGroups;
        final fmt = AppFormatters.of(context);
        return RefreshIndicator.adaptive(
          onRefresh: () => ref.refresh(provider.future),
          child: ListView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: EdgeInsets.fromLTRB(context.pageGutter, AppSpacing.sm, context.pageGutter, AppSpacing.xl),
            children: [
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (final g in groups) ...[
                      AppFilterChip(
                        icon: searchTypeIcon(g.type),
                        label: '${searchGroupLabel(l10n, g.type)} (${fmt.number(g.total)})',
                        selected: false,
                        onSelected: (_) => onSeeAll(g.type),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                    ],
                  ],
                ),
              ),
              if (r.expansions.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.sm),
                  child: Row(
                    children: [
                      Icon(Icons.spellcheck, size: 18, color: theme.colorScheme.onSurfaceVariant),
                      const SizedBox(width: AppSpacing.xs),
                      Expanded(
                        child: Text(
                          l10n.searchAlsoMatched(r.expansions.map((e) => e.canonical).toSet().join('، ')),
                          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                        ),
                      ),
                    ],
                  ),
                ),
              Semantics(
                liveRegion: true,
                child: Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.sm),
                  child: Text(
                    l10n.searchResultCount(r.totalHits, fmt.number(r.totalHits) ?? '${r.totalHits}'),
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  ),
                ),
              ),
              for (final g in groups) ...[
                SectionHeader(
                  title: searchGroupLabel(l10n, g.type),
                  icon: searchTypeIcon(g.type),
                  padding: const EdgeInsetsDirectional.only(top: AppSpacing.lg, bottom: AppSpacing.xs),
                  actionLabel: g.total > g.items.length ? l10n.searchSeeAllCount(fmt.number(g.total) ?? '${g.total}') : null,
                  onSeeAll: g.total > g.items.length ? () => onSeeAll(g.type) : null,
                ),
                for (final h in g.items) SearchHitTile(hit: h),
              ],
            ],
          ),
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// One group, paged
// ---------------------------------------------------------------------------

class _GroupView extends ConsumerWidget {
  const _GroupView({required this.query, required this.type, required this.onBack});

  final String query;
  final String type;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final provider = searchGroupProvider(SearchGroupQuery(query, type));
    final value = ref.watch(provider);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) onBack();
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: EdgeInsetsDirectional.fromSTEB(context.pageGutter - AppSpacing.sm, AppSpacing.xs, context.pageGutter, 0),
            child: Row(
              children: [
                TextButton.icon(
                  onPressed: onBack,
                  icon: const Icon(Icons.arrow_back),
                  label: Text(l10n.searchAllGroups),
                ),
                const Spacer(),
                Flexible(
                  child: Pill(icon: searchTypeIcon(type), label: searchGroupLabel(l10n, type)),
                ),
              ],
            ),
          ),
          Expanded(
            child: AsyncStateView<PagedState<SearchHit>>(
              value: value,
              onRetry: () => ref.invalidate(provider),
              isEmpty: (s) => s.items.isEmpty,
              emptyIcon: Icons.search_off,
              emptyTitle: l10n.searchNoResultsTitle,
              emptyMessage: l10n.searchNoResultsMessage(query),
              loading: const Skeleton(child: SkeletonList(item: ListTileSkeleton(), count: 6)),
              builder: (context, s) => ListView.builder(
                padding: EdgeInsets.symmetric(horizontal: context.pageGutter, vertical: AppSpacing.sm),
                itemCount: s.items.length + 1,
                itemBuilder: (context, i) {
                  final notifier = ref.read(provider.notifier);
                  if (i == s.items.length) return PagedListFooter(state: s, onRetry: notifier.loadMore);
                  prefetchNearEnd(context, i, s.items.length, notifier.loadMore);
                  return SearchHitTile(hit: s.items[i]);
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
