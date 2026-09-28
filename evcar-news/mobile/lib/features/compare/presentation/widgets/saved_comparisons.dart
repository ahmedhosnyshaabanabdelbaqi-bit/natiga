import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/errors/app_errors.dart';
import '../../../../shared/widgets/kit.dart';
import '../../../auth/presentation/auth_controller.dart';
import '../../application/compare_providers.dart';
import '../../domain/comparison_models.dart';
import 'compare_labels.dart';

/// A saved / shared / curated comparison in a list (opens `/compare/s/:id`).
class SavedComparisonTile extends StatelessWidget {
  const SavedComparisonTile({super.key, required this.comparison, this.trailing, this.onOpen});

  final SavedComparison comparison;
  final Widget? trailing;

  /// Called before navigating (e.g. to close a sheet).
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final fmt = AppFormatters.of(context);
    final c = comparison;
    final title = c.title?.trim().isNotEmpty == true ? c.title!.trim() : c.displayTitle;
    final items = [
      for (final i in c.items)
        [
          i.title ?? l10n.commonNotAvailable,
          if (i.modelYear != null && !(i.title?.contains('${i.modelYear}') ?? false))
            CompareLabels.year(fmt, i.modelYear!),
          i.marketCode,
        ].join(' · '),
    ];
    return AppCard(
      onTap: () {
        onOpen?.call();
        context.push(AppRoutes.sharedComparison(c.shareId));
      },
      semanticLabel: '$title. ${items.join('; ')}',
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(c.isCurated ? Icons.star_outline : Icons.compare_arrows, color: theme.colorScheme.primary),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                for (final line in items)
                  Text(line, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                if (c.isDemo || c.items.any((i) => !i.available)) ...[
                  const SizedBox(height: AppSpacing.xs),
                  Wrap(
                    spacing: AppSpacing.xs,
                    runSpacing: 4,
                    children: [
                      if (c.isDemo) const DemoBadge(dense: true),
                      if (c.items.any((i) => !i.available))
                        Pill(icon: Icons.block, label: l10n.compareSomeUnavailable, tone: AppTone.warning, dense: true),
                    ],
                  ),
                ],
              ],
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

/// «مقارنات مختارة» — published curated comparisons of the market.
class FeaturedComparisonsSection extends ConsumerWidget {
  const FeaturedComparisonsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final value = ref.watch(featuredComparisonsProvider);
    final items = value.value?.data ?? const <SavedComparison>[];
    // Nothing curated (or not loaded) → no section at all; this list is optional.
    if (items.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SectionHeader(title: l10n.compareFeaturedTitle, icon: Icons.star_outline, padding: EdgeInsets.zero),
          const SizedBox(height: AppSpacing.sm),
          for (final c in items)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: SavedComparisonTile(comparison: c),
            ),
        ],
      ),
    );
  }
}

/// The signed-in user's saved comparisons (guests get a short hint).
class MySavedComparisonsSection extends ConsumerWidget {
  const MySavedComparisonsSection({super.key, this.onOpen, this.showHeader = true});

  final VoidCallback? onOpen;
  final bool showHeader;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final signedIn = ref.watch(authControllerProvider.select((s) => s.isSignedIn));
    final header = showHeader
        ? Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: SectionHeader(
              title: l10n.compareSavedTitle,
              icon: Icons.bookmarks_outlined,
              padding: EdgeInsets.zero,
            ),
          )
        : const SizedBox.shrink();
    if (!signedIn) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          header,
          Text(
            l10n.compareSavedGuestHint,
            style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: AppSpacing.sm),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton.icon(
              onPressed: () {
                onOpen?.call();
                context.push(AppRoutes.login(from: AppRoutes.compare));
              },
              icon: const Icon(Icons.login),
              label: Text(l10n.commonSignIn),
            ),
          ),
        ],
      );
    }
    final value = ref.watch(myComparisonsProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        header,
        AsyncStateView(
          value: value,
          compact: true,
          onRetry: () => ref.invalidate(myComparisonsProvider),
          isEmpty: (page) => page == null || page.items.isEmpty,
          emptyIcon: Icons.bookmark_border,
          emptyTitle: l10n.compareSavedEmptyTitle,
          emptyMessage: l10n.compareSavedEmptyMessage,
          loading: const Skeleton(child: Column(children: [ListTileSkeleton(), ListTileSkeleton()])),
          builder: (context, page) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final c in page!.items)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: SavedComparisonTile(
                    comparison: c,
                    onOpen: onOpen,
                    trailing: IconButton(
                      tooltip: l10n.compareDeleteSaved,
                      icon: const Icon(Icons.delete_outline),
                      onPressed: () => _delete(context, ref, c),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, SavedComparison c) async {
    final l10n = context.l10n;
    final ok = await showConfirmSheet(
      context: context,
      title: l10n.compareDeleteSavedTitle,
      message: l10n.compareDeleteSavedMessage(c.displayTitle),
      confirmLabel: l10n.compareDeleteSaved,
      destructive: true,
    );
    if (!ok || !context.mounted) return;
    try {
      await ref.read(compareRepositoryProvider).deleteMine(c.id);
      ref.invalidate(myComparisonsProvider);
      if (context.mounted) showAppSnackBar(context, l10n.compareDeleted, icon: Icons.delete_outline);
    } on Object catch (e) {
      if (context.mounted) showAppSnackBar(context, errorMessage(l10n, e), tone: AppTone.danger);
    }
  }
}

/// App-bar sheet listing the user's saved comparisons.
Future<void> showSavedComparisonsSheet(BuildContext context) {
  final l10n = context.l10n;
  return showAppBottomSheet<void>(
    context: context,
    title: l10n.compareSavedTitle,
    builder: (sheet) => Padding(
      padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.lg),
      child: MySavedComparisonsSection(showHeader: false, onOpen: () => Navigator.of(sheet).pop()),
    ),
  );
}
