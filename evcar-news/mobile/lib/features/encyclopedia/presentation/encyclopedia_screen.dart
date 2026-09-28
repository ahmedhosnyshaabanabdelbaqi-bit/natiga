import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/widgets/kit.dart';
import '../../search/application/paged_state.dart';
import '../../search/presentation/widgets/paged_footer.dart';
import '../application/encyclopedia_providers.dart';
import '../domain/encyclopedia_models.dart';
import 'widgets/encyclopedia_widgets.dart';

/// EV encyclopedia (`/encyclopedia`): beginner guides by category (car
/// types, connectors, batteries, range standards, home and fast charging,
/// warranty, used-car checks). Only technically reviewed entries are
/// published; each shows its review badge.
class EncyclopediaScreen extends ConsumerStatefulWidget {
  const EncyclopediaScreen({super.key, this.initialCategory});

  /// Optional pre-selected category key.
  final String? initialCategory;

  @override
  ConsumerState<EncyclopediaScreen> createState() => _EncyclopediaScreenState();
}

class _EncyclopediaScreenState extends ConsumerState<EncyclopediaScreen> {
  final _search = TextEditingController();
  Timer? _debounce;
  String? _category;
  String _q = '';

  @override
  void initState() {
    super.initState();
    _category = widget.initialCategory;
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onQuery(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted && value.trim() != _q) setState(() => _q = value.trim());
    });
  }

  EncyclopediaQuery get _query => EncyclopediaQuery(category: _category, q: _q.isEmpty ? null : _q);

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final query = _query;
    final provider = encyclopediaListProvider(query);
    final value = ref.watch(provider);
    final state = value.value;
    final categories = ref.watch(encyclopediaCategoriesProvider).value?.data ?? const <EncyclopediaCategory>[];
    final filtered = _category != null || _q.isNotEmpty;

    Future<void> refresh() async {
      ref.invalidate(encyclopediaCategoriesProvider);
      ref.invalidate(provider);
      try {
        await ref.read(provider.future);
      } on Object {
        // Rendered below.
      }
    }

    return AppScaffold.slivers(
      title: l10n.encyclopediaTitle,
      largeTitle: true,
      onRefresh: refresh,
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.fromLTRB(context.pageGutter, 0, context.pageGutter, AppSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  l10n.encyclopediaIntro,
                  style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
                const SizedBox(height: AppSpacing.md),
                AppSearchField(
                  controller: _search,
                  hintText: l10n.encyclopediaSearchHint,
                  onChanged: _onQuery,
                  onSubmitted: (v) {
                    _debounce?.cancel();
                    setState(() => _q = v.trim());
                  },
                ),
              ],
            ),
          ),
        ),
        if (categories.isNotEmpty)
          SliverToBoxAdapter(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: EdgeInsets.fromLTRB(context.pageGutter, 0, context.pageGutter, AppSpacing.md),
              child: Row(
                children: [
                  AppFilterChip(
                    label: l10n.encyclopediaAllCategories,
                    selected: _category == null,
                    onSelected: (_) => setState(() => _category = null),
                  ),
                  for (final c in categories) ...[
                    const SizedBox(width: AppSpacing.sm),
                    AppFilterChip(
                      icon: encyclopediaCategoryIcon(c.iconKey, c.key),
                      label: c.entryCount == null ? c.name : '${c.name} (${AppFormatters.of(context).number(c.entryCount)})',
                      selected: _category == c.key,
                      onSelected: (on) => setState(() => _category = on ? c.key : null),
                    ),
                  ],
                ],
              ),
            ),
          ),
        if (state?.fromCache ?? false)
          SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.fromLTRB(context.pageGutter, 0, context.pageGutter, AppSpacing.md),
              child: CachedDataNotice(savedAt: state!.savedAt!, onRetry: () => ref.invalidate(provider)),
            ),
          ),
        SliverAsyncStateView<PagedState<EncyclopediaEntrySummary>>(
          value: value,
          onRetry: () => ref.invalidate(provider),
          isEmpty: (s) => s.items.isEmpty,
          emptyIcon: filtered ? Icons.search_off : Icons.menu_book_outlined,
          emptyTitle: filtered ? l10n.encyclopediaNoMatchesTitle : l10n.encyclopediaEmptyTitle,
          emptyMessage: filtered ? l10n.encyclopediaNoMatchesMessage : l10n.encyclopediaEmptyMessage,
          emptyActions: [
            if (filtered)
              StateAction(
                label: l10n.encyclopediaClearFilters,
                icon: Icons.filter_alt_off_outlined,
                primary: true,
                onPressed: () {
                  _search.clear();
                  setState(() {
                    _category = null;
                    _q = '';
                  });
                },
              ),
          ],
          loading: const EncyclopediaListSkeleton(),
          builder: (context, s) => SliverResponsivePadding(
            maxWidth: kMaxReadableWidth,
            sliver: SliverList.builder(
              itemCount: s.items.length + 1,
              itemBuilder: (context, i) {
                final notifier = ref.read(provider.notifier);
                if (i == s.items.length) return PagedListFooter(state: s, onRetry: notifier.loadMore);
                prefetchNearEnd(context, i, s.items.length, notifier.loadMore);
                return Padding(
                  padding: EdgeInsets.fromLTRB(context.pageGutter, 0, context.pageGutter, AppSpacing.cardGap),
                  child: EncyclopediaEntryCard(entry: s.items[i]),
                );
              },
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.fromLTRB(context.pageGutter, AppSpacing.md, context.pageGutter, 0),
            child: _ReviewPolicyNote(),
          ),
        ),
      ],
    );
  }
}

/// Explains what "reviewed" means (not a guarantee; see an electrician).
class _ReviewPolicyNote extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.info_outline, size: 18, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Text(
            l10n.encyclopediaReviewPolicy,
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ),
      ],
    );
  }
}
