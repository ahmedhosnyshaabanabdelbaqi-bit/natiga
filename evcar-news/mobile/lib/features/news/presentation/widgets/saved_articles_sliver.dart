import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../shared/widgets/kit.dart';
import '../../application/news_providers.dart';
import '../../data/saved_articles_repository.dart';
import 'article_card.dart';

/// Articles saved for offline reading, newest first, each with its save
/// date. Reads only the device store, so it works without a connection.
///
/// Reusable by the favorites feature's `/saved` screen.
class SavedArticlesSliver extends ConsumerWidget {
  const SavedArticlesSliver({super.key, this.now});

  /// Injectable clock for tests.
  final DateTime? now;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return SliverAsyncStateView<List<SavedArticle>>(
      value: ref.watch(savedArticlesProvider),
      isEmpty: (items) => items.isEmpty,
      onRetry: () => ref.invalidate(savedArticlesProvider),
      emptyTitle: l10n.newsSavedEmptyTitle,
      emptyMessage: l10n.newsSavedEmptyMessage,
      emptyIcon: Icons.download_for_offline_outlined,
      loading: const Skeleton(child: SkeletonList(item: NewsCardSkeleton.compact())),
      builder: (context, items) => SliverMainAxisGroup(
        slivers: [
          SliverResponsivePadding(
            maxWidth: kMaxReadableWidth,
            sliver: SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                child: Row(
                  children: [
                    Icon(Icons.offline_pin_outlined, size: 20, color: Theme.of(context).colorScheme.primary),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Text(l10n.newsSavedCount(items.length), style: Theme.of(context).textTheme.titleSmall),
                    ),
                  ],
                ),
              ),
            ),
          ),
          SliverResponsivePadding(
            maxWidth: kMaxReadableWidth,
            sliver: SliverList.builder(
              itemCount: items.length,
              itemBuilder: (context, i) => Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.cardGap),
                child: SavedArticleTile(saved: items[i], now: now),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// One saved article: compact card + "Saved `date`" + remove.
class SavedArticleTile extends ConsumerWidget {
  const SavedArticleTile({super.key, required this.saved, this.now});

  final SavedArticle saved;
  final DateTime? now;

  Future<void> _remove(BuildContext context, WidgetRef ref) async {
    final l10n = context.l10n;
    final ok = await showConfirmSheet(
      context: context,
      title: l10n.newsRemoveSavedConfirmTitle,
      message: l10n.newsRemoveSavedConfirmMessage,
      confirmLabel: l10n.newsRemoveSaved,
      destructive: true,
      icon: Icons.delete_outline,
    );
    if (!ok || !context.mounted) return;
    await ref.read(savedArticlesProvider.notifier).remove(saved.article.id);
    if (context.mounted) showAppSnackBar(context, l10n.newsRemovedSnack, icon: Icons.delete_outline);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final when = friendlyTime(context, saved.savedAt, now: now) ?? '';
    final exact = AppFormatters.of(context).dateTime(saved.savedAt) ?? '';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ArticleCard(
          article: saved.article,
          variant: NewsCardVariant.compact,
          showFavorite: false,
          now: now,
          extraBadges: [
            Pill(
              label: l10n.newsSavedOn(when),
              semanticLabel: l10n.newsSavedOn(exact),
              tooltip: exact,
              icon: Icons.download_done,
              tone: AppTone.success,
              dense: true,
            ),
            if (!saved.allImagesSaved)
              Pill(
                label: l10n.newsSavedImagesPartial,
                icon: Icons.hide_image_outlined,
                tone: AppTone.warning,
                dense: true,
              ),
          ],
        ),
        Align(
          alignment: AlignmentDirectional.centerEnd,
          child: TextButton.icon(
            onPressed: () => _remove(context, ref),
            icon: const Icon(Icons.delete_outline),
            label: Text(l10n.newsRemoveSaved),
            style: TextButton.styleFrom(foregroundColor: theme.colorScheme.error),
          ),
        ),
      ],
    );
  }
}
