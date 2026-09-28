import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../shared/widgets/kit.dart';
import '../../application/news_providers.dart';
import '../../domain/news_query.dart';
import 'article_card.dart';

/// Loading placeholder shaped like the feed (hero + rows).
class NewsFeedSkeleton extends StatelessWidget {
  const NewsFeedSkeleton({super.key, this.hero = true});

  final bool hero;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Skeleton(
      semanticLabel: l10n.commonLoading,
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: context.pageGutter, vertical: AppSpacing.sm),
        child: Column(
          children: [
            if (hero) ...[const NewsCardSkeleton(), const SizedBox(height: AppSpacing.cardGap)],
            for (var i = 0; i < 4; i++) ...[
              const NewsCardSkeleton.compact(),
              const SizedBox(height: AppSpacing.cardGap),
            ],
          ],
        ),
      ),
    );
  }
}

/// Infinite, refreshable list of articles for [query] as one sliver.
///
/// * First page: skeleton → cards (or empty / error / offline states);
///   an offline copy shows [CachedDataNotice].
/// * Next pages load automatically near the end; failures show an inline
///   retry row instead of replacing the list.
class NewsFeedSliver extends ConsumerWidget {
  const NewsFeedSliver({
    super.key,
    required this.query,
    this.heroFirst = true,
    this.emptyTitle,
    this.emptyMessage,
    this.emptyActions = const [],
    this.onOpenSaved,
    this.now,
  });

  final NewsQuery query;

  /// Show the first article as a large hero card.
  final bool heroFirst;
  final String? emptyTitle;
  final String? emptyMessage;
  final List<StateAction> emptyActions;

  /// Offered in the offline state ("Open saved articles").
  final VoidCallback? onOpenSaved;

  /// Injectable clock for tests.
  final DateTime? now;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final provider = newsFeedProvider(query);
    final value = ref.watch(provider);

    // Offline without any copy: offer the saved articles.
    if (value.hasError &&
        !value.hasValue &&
        onOpenSaved != null &&
        AsyncStateView.kindForError(value.error!) == StateKind.offline) {
      return SliverFillRemaining(
        hasScrollBody: false,
        child: OfflineState(
          onRetry: () => ref.invalidate(provider),
          actions: [StateAction(label: l10n.newsOpenSaved, icon: Icons.download_done, onPressed: onOpenSaved!)],
        ),
      );
    }

    return SliverAsyncStateView<NewsFeedState>(
      value: value,
      isEmpty: (s) => s.items.isEmpty,
      onRetry: () => ref.invalidate(provider),
      emptyTitle: emptyTitle ?? l10n.newsEmptyTitle,
      emptyMessage: emptyMessage ?? l10n.newsEmptyMessage,
      emptyIcon: Icons.newspaper_outlined,
      emptyActions: emptyActions,
      loading: NewsFeedSkeleton(hero: heroFirst),
      builder: (context, state) {
        final items = state.items;
        final hero = heroFirst && query.sort == NewsSort.latest;
        return SliverMainAxisGroup(
          slivers: [
            if (state.fromCache && state.savedAt != null)
              SliverToBoxAdapter(
                child: CachedDataNotice(savedAt: state.savedAt!, onRetry: () => ref.invalidate(provider), now: now),
              ),
            SliverResponsivePadding(
              maxWidth: kMaxReadableWidth,
              vertical: AppSpacing.sm,
              sliver: SliverList.builder(
                itemCount: items.length,
                itemBuilder: (context, i) {
                  if (i >= items.length - 4 && state.hasMore && !state.loadingMore && state.loadMoreError == null) {
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      if (context.mounted) ref.read(provider.notifier).loadMore();
                    });
                  }
                  final variant = (hero && i == 0)
                      ? NewsCardVariant.hero
                      : (i % 6 == 3 ? NewsCardVariant.standard : NewsCardVariant.compact);
                  return Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.cardGap),
                    child: ArticleCard(article: items[i], variant: variant, now: now),
                  );
                },
              ),
            ),
            SliverToBoxAdapter(
              child: _FeedFooter(state: state, onRetry: () => ref.read(provider.notifier).loadMore()),
            ),
          ],
        );
      },
    );
  }
}

class _FeedFooter extends StatelessWidget {
  const _FeedFooter({required this.state, required this.onRetry});

  final NewsFeedState state;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final Widget child;
    if (state.loadingMore) {
      child = Semantics(
        liveRegion: true,
        label: l10n.newsLoadingMore,
        child: const Padding(
          padding: EdgeInsets.all(AppSpacing.lg),
          child: SizedBox.square(dimension: 28, child: CircularProgressIndicator(strokeWidth: 3)),
        ),
      );
    } else if (state.loadMoreError != null) {
      child = Semantics(
        liveRegion: true,
        container: true,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Wrap(
            alignment: WrapAlignment.center,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.xs,
            children: [
              Icon(Icons.error_outline, color: theme.colorScheme.error),
              Text(l10n.newsLoadMoreFailed, style: theme.textTheme.bodyMedium, textAlign: TextAlign.center),
              TextButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh), label: Text(l10n.commonRetry)),
            ],
          ),
        ),
      );
    } else if (!state.hasMore && state.items.length > 3 && !state.fromCache) {
      child = Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.check_circle_outline, size: 20, color: theme.colorScheme.onSurfaceVariant),
            const SizedBox(width: AppSpacing.sm),
            Flexible(
              child: Text(
                l10n.newsEndOfFeed,
                style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
            ),
          ],
        ),
      );
    } else {
      child = const SizedBox(height: AppSpacing.sm);
    }
    return Center(child: child);
  }
}
