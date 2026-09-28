import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/cache/cached_fetch.dart';
import '../../../shared/widgets/kit.dart';
import '../application/compare_providers.dart';
import '../domain/comparison_models.dart';
import 'compare_screen.dart';
import 'widgets/compare_actions.dart';
import 'widgets/compare_labels.dart';
import 'widgets/comparison_view.dart';

/// Shared comparison (`/compare/s/:shareId`, deep link
/// `https://evcar.news/compare/<shareId>`): the computed result with the same
/// views as the Compare tab, share, favorite, and "Edit in Compare".
class SharedComparisonScreen extends ConsumerWidget {
  const SharedComparisonScreen({super.key, required this.shareId});

  /// Share id from the link.
  final String shareId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final value = ref.watch(sharedComparisonProvider(shareId));
    final options = ref.watch(compareViewProvider);
    final data = value.value?.data;
    final gutter = context.pageGutter;
    final notFound = value.error is ApiException && (value.error! as ApiException).kind == ApiErrorKind.notFound;

    return AppScaffold.slivers(
      title: l10n.compareSharedTitle,
      onRefresh: () async {
        ref.invalidate(sharedComparisonProvider(shareId));
        await ref.read(sharedComparisonProvider(shareId).future).then((_) {}, onError: (_) {});
      },
      actions: [
        if (data != null)
          FavoriteButton(
            item: FavoriteItem(
              key: FavoriteKey(FavoriteType.comparison, data.comparison.id),
              title: data.comparison.displayTitle,
              subtitle: l10n.compareFavoriteSubtitle(data.comparison.items.length),
              route: AppRoutes.sharedComparison(data.comparison.shareId),
            ),
          ),
        if (data != null)
          IconButton(
            tooltip: l10n.compareShare,
            icon: const Icon(Icons.share_outlined),
            onPressed: () => shareComparisonLink(ref, data.comparison),
          ),
      ],
      slivers: [
        if (notFound)
          SliverFillRemaining(
            hasScrollBody: false,
            child: EmptyState(
              icon: Icons.link_off,
              title: l10n.compareSharedNotFoundTitle,
              message: l10n.compareSharedNotFoundMessage,
              actions: [
                StateAction(
                  label: l10n.compareGoToCompare,
                  icon: Icons.compare_arrows,
                  primary: true,
                  onPressed: () => context.go(AppRoutes.compare),
                ),
              ],
            ),
          )
        else
          SliverAsyncStateView<CachedResult<SharedComparison>>(
            value: value,
            onRetry: () => ref.invalidate(sharedComparisonProvider(shareId)),
            loading: const ComparisonSkeleton(),
            builder: (context, res) {
              final shared = res.data;
              final result = shared.result;
              return SliverMainAxisGroup(
                slivers: [
                  SliverPadding(
                    padding: EdgeInsets.fromLTRB(gutter, AppSpacing.sm, gutter, AppSpacing.sm),
                    sliver: SliverToBoxAdapter(
                      child: ResponsiveCenter(
                        maxWidth: kMaxContentWidth,
                        padding: EdgeInsets.zero,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            if (res.fromCache) ...[
                              CachedDataNotice(
                                savedAt: res.savedAt,
                                onRetry: () => ref.invalidate(sharedComparisonProvider(shareId)),
                              ),
                              const SizedBox(height: AppSpacing.sm),
                            ],
                            _SharedHeader(shared: shared),
                            if (shared.unavailableItems.isNotEmpty) ...[
                              const SizedBox(height: AppSpacing.md),
                              _UnavailableCard(items: shared.unavailableItems),
                            ],
                            if (result != null) ...[
                              const SizedBox(height: AppSpacing.md),
                              CompareControls(
                                options: options,
                                onSummary: ref.read(compareViewProvider.notifier).setSummary,
                                onDifferencesOnly: ref.read(compareViewProvider.notifier).setDifferencesOnly,
                                actions: [
                                  SecondaryButton(
                                    label: l10n.compareEditInCompare,
                                    icon: Icons.edit_outlined,
                                    onPressed: () => _editInCompare(context, ref, result),
                                  ),
                                ],
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),
                  if (result == null)
                    SliverToBoxAdapter(
                      child: EmptyState(
                        icon: Icons.car_crash_outlined,
                        title: l10n.compareSharedNoResultTitle,
                        message: l10n.compareSharedNoResultMessage,
                        compact: true,
                      ),
                    )
                  else
                    ComparisonSliver(
                      result: result,
                      summaryView: options.summary,
                      differencesOnly: options.differencesOnly,
                      onShowAllRows: () {
                        ref.read(compareViewProvider.notifier).setSummary(false);
                        ref.read(compareViewProvider.notifier).setDifferencesOnly(false);
                      },
                    ),
                ],
              );
            },
          ),
      ],
    );
  }

  /// Copies the cars of this comparison into the tray and opens the tab.
  Future<void> _editInCompare(BuildContext context, WidgetRef ref, ComparisonData result) async {
    final l10n = context.l10n;
    final tray = ref.read(compareTrayProvider);
    if (tray.isNotEmpty) {
      final ok = await showConfirmSheet(
        context: context,
        title: l10n.compareReplaceTrayTitle,
        message: l10n.compareReplaceTrayMessage(tray.length),
        confirmLabel: l10n.compareReplaceTrayConfirm,
      );
      if (!ok || !context.mounted) return;
    }
    final fmt = AppFormatters.of(context);
    ref.read(compareTrayProvider.notifier).setAll([
      for (final c in result.cars)
        if (c.modelYear != null)
          CompareSelection(
            variantId: c.variantId,
            modelYear: c.modelYear!,
            marketCode: c.market.code,
            title: [?c.brandName, ?c.modelName].join(' ').trim().isEmpty
                ? c.title
                : [?c.brandName, ?c.modelName].join(' '),
            subtitle: [c.name, CompareLabels.powertrain(l10n, c.powertrainType)].join(' · '),
            variantSlug: c.variantSlug,
            modelSlug: c.modelSlug,
            imageUrl: c.image?.url,
          ),
    ]);
    if (context.mounted) {
      showAppSnackBar(context, l10n.compareCopiedToTray(fmt.number(result.cars.length)!), icon: Icons.check);
      context.go(AppRoutes.compare);
    }
  }
}

class _SharedHeader extends StatelessWidget {
  const _SharedHeader({required this.shared});

  final SharedComparison shared;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final c = shared.comparison;
    final kind = switch (c.kind) {
      'curated' => (Icons.star_outline, l10n.compareKindCurated),
      'saved' => (Icons.bookmark_outline, c.isMine ? l10n.compareKindMine : l10n.compareKindSaved),
      _ => (Icons.link, l10n.compareKindShared),
    };
    final title = c.isMine && c.title?.trim().isNotEmpty == true ? c.title!.trim() : c.displayTitle;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          header: true,
          child: Text(title, style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
        ),
        const SizedBox(height: AppSpacing.sm),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.xs,
          children: [
            Pill(icon: kind.$1, label: kind.$2, tone: AppTone.brand, dense: true),
            if (c.isDemo) const DemoBadge(dense: true),
          ],
        ),
      ],
    );
  }
}

class _UnavailableCard extends StatelessWidget {
  const _UnavailableCard({required this.items});

  final List<ComparisonItemView> items;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final colors = context.palette.tone(AppTone.warning);
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(color: colors.container, borderRadius: BorderRadius.circular(AppRadii.md)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.block, color: colors.onContainer, size: 20),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  l10n.compareUnavailableTitle(items.length),
                  style: theme.textTheme.titleSmall?.copyWith(color: colors.onContainer, fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          for (final i in items)
            Text(
              '• ${i.title ?? l10n.commonNotAvailable} · ${i.marketCode}',
              style: theme.textTheme.bodySmall?.copyWith(color: colors.onContainer),
            ),
        ],
      ),
    );
  }
}
