import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../shared/widgets/kit.dart';
import '../application/tours_providers.dart';
import 'widgets/tour_card.dart';

/// Every car/trim with a published 360° interior tour (`/tours`) in the
/// selected market; demo panoramas are labelled as demo, reference tours
/// say which trim was photographed.
class ToursScreen extends ConsumerWidget {
  const ToursScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final value = ref.watch(toursListProvider);
    final state = value.value;

    Future<void> refresh() async {
      ref.invalidate(toursListProvider);
      try {
        await ref.read(toursListProvider.future);
      } on Object {
        // Rendered below.
      }
    }

    return AppScaffold.slivers(
      title: l10n.toursListTitle,
      largeTitle: true,
      onRefresh: refresh,
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.fromLTRB(context.pageGutter, 0, context.pageGutter, AppSpacing.lg),
            child: Text(
              l10n.toursListIntro,
              style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ),
        ),
        if (state?.fromCache ?? false)
          SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.fromLTRB(context.pageGutter, 0, context.pageGutter, AppSpacing.md),
              child: CachedDataNotice(savedAt: state!.savedAt!, onRetry: () => ref.invalidate(toursListProvider)),
            ),
          ),
        SliverAsyncStateView<ToursListState>(
          value: value,
          onRetry: () => ref.invalidate(toursListProvider),
          isEmpty: (s) => s.items.isEmpty,
          emptyIcon: Icons.threesixty,
          emptyTitle: l10n.toursListEmptyTitle,
          emptyMessage: l10n.toursListEmptyMessage,
          emptyActions: [
            StateAction(
              label: l10n.toursBrowseCars,
              icon: Icons.directions_car_outlined,
              primary: true,
              onPressed: () => context.go(AppRoutes.cars),
            ),
          ],
          loading: const _ToursSkeleton(),
          builder: (context, s) => SliverResponsivePadding(
            sliver: SliverList.builder(
              itemCount: s.items.length + 1,
              itemBuilder: (context, i) {
                if (i == s.items.length) return _ListFooter(state: s);
                // Prefetch the next page near the end.
                if (i >= s.items.length - 3) {
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    if (context.mounted) ref.read(toursListProvider.notifier).loadMore();
                  });
                }
                return Padding(
                  padding: EdgeInsets.fromLTRB(context.pageGutter, 0, context.pageGutter, AppSpacing.cardGap),
                  child: TourListCard(card: s.items[i]),
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}

class _ListFooter extends ConsumerWidget {
  const _ListFooter({required this.state});

  final ToursListState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    if (state.loadingMore) {
      return const Padding(
        padding: EdgeInsets.all(AppSpacing.lg),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (state.loadMoreError != null) {
      return Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          children: [
            Text(l10n.toursLoadMoreFailed, textAlign: TextAlign.center),
            const SizedBox(height: AppSpacing.sm),
            SecondaryButton(
              label: l10n.commonRetry,
              icon: Icons.refresh,
              onPressed: () => ref.read(toursListProvider.notifier).loadMore(),
            ),
          ],
        ),
      );
    }
    return const SizedBox(height: AppSpacing.lg);
  }
}

class _ToursSkeleton extends StatelessWidget {
  const _ToursSkeleton();

  @override
  Widget build(BuildContext context) {
    return Skeleton(
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: context.pageGutter),
        child: Column(
          children: [
            for (var i = 0; i < 2; i++)
              const Padding(
                padding: EdgeInsets.only(bottom: AppSpacing.cardGap),
                child: SkeletonCard(
                  padding: EdgeInsets.zero,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SkeletonBox(aspectRatio: 2, radius: 0),
                      Padding(
                        padding: EdgeInsets.all(AppSpacing.md),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SkeletonLine(widthFactor: 0.7, fontSize: 18),
                            SizedBox(height: AppSpacing.sm),
                            SkeletonLine(widthFactor: 0.5),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
