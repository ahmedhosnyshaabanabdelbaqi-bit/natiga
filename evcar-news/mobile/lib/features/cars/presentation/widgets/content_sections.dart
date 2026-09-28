import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/app_config/app_config_controller.dart';
import '../../../../core/app_config/features.dart';
import '../../../../shared/widgets/kit.dart';
import '../../application/cars_providers.dart';
import '../../domain/catalog_models.dart';
import 'car_labels.dart';
import 'car_summary_card.dart';

/// News, reviews and guides linked to the car / trim.
class RelatedArticlesList extends ConsumerWidget {
  const RelatedArticlesList({super.key, required this.articles});

  final List<RelatedArticle> articles;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final newsOn = ref.watch(featureFlagProvider(Features.news));
    if (articles.isEmpty) {
      return EmptyState(
        icon: Icons.article_outlined,
        title: l10n.carsNoArticlesTitle,
        message: l10n.carsNoArticlesMessage,
        compact: true,
      );
    }
    // Reviews and test drives first, then the rest (each group newest first).
    const reviewTypes = {'review', 'test_drive'};
    final sorted = [
      ...articles.where((a) => reviewTypes.contains(a.type)),
      ...articles.where((a) => !reviewTypes.contains(a.type)),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < sorted.length; i++) ...[
          if (i > 0) const SizedBox(height: AppSpacing.cardGap),
          NewsCard(
            variant: NewsCardVariant.compact,
            title: sorted[i].title,
            summary: sorted[i].summary,
            imageUrl: sorted[i].coverImage?.url,
            imageAlt: sorted[i].coverImage?.alt,
            imageCredit: sorted[i].coverImage?.credit,
            category: CarLabels.articleType(l10n, sorted[i].type),
            publishedAt: sorted[i].publishedAt,
            isSponsored: sorted[i].isSponsored,
            sponsorName: sorted[i].sponsorName,
            isDemo: sorted[i].isDemo,
            onTap: newsOn ? () => context.push(AppRoutes.article(sorted[i].slug)) : null,
          ),
        ],
      ],
    );
  }
}

/// Owner reviews of the selected trim (community API). Honest empty and
/// "not available" states; never invented ratings — an average is shown
/// only when the server has one.
class OwnerReviewsSection extends ConsumerWidget {
  const OwnerReviewsSection({super.key, required this.carSlug, required this.variantId});

  final String carSlug;
  final String variantId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final enabled = ref.watch(featureFlagProvider(Features.community));
    if (!enabled) {
      return EmptyState(
        icon: Icons.reviews_outlined,
        title: l10n.carsOwnerReviewsUnavailableTitle,
        message: l10n.carsOwnerReviewsUnavailableMessage,
        compact: true,
      );
    }
    final value = ref.watch(ownerReviewsProvider(variantId));
    return AsyncStateView<OwnerReviews>(
      value: value,
      compact: true,
      onRetry: () => ref.invalidate(ownerReviewsProvider(variantId)),
      loading: const Skeleton(child: SkeletonList(item: ListTileSkeleton(), count: 3)),
      isEmpty: (r) => r.summary.count == 0,
      emptyIcon: Icons.reviews_outlined,
      emptyTitle: l10n.carsOwnerReviewsEmptyTitle,
      emptyMessage: l10n.carsOwnerReviewsEmptyMessage,
      emptyActions: [
        StateAction(
          label: l10n.carsWriteReview,
          icon: Icons.rate_review_outlined,
          primary: true,
          onPressed: () => context.push(AppRoutes.writeCarReview(carSlug)),
        ),
      ],
      builder: (context, r) => _ReviewsBody(carSlug: carSlug, reviews: r),
    );
  }
}

class _ReviewsBody extends StatelessWidget {
  const _ReviewsBody({required this.carSlug, required this.reviews});

  final String carSlug;
  final OwnerReviews reviews;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final theme = Theme.of(context);
    final s = reviews.summary;
    final maxCount = s.distribution.values.fold<int>(0, (a, b) => a > b ? a : b);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppCard(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Wrap(
                spacing: AppSpacing.lg,
                runSpacing: AppSpacing.sm,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Semantics(
                    label: s.average == null
                        ? l10n.commonNotAvailable
                        : l10n.carsRatingOutOfFive(fmt.number(s.average, maxDecimals: 1)!),
                    excludeSemantics: true,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.star_rounded, color: Color(0xFFF5A623), size: 32),
                        const SizedBox(width: AppSpacing.xs),
                        ValueOrNotAvailable(
                          s.average == null ? null : fmt.number(s.average, maxDecimals: 1),
                          style: theme.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800),
                        ),
                        Text(' / 5', style: theme.textTheme.titleMedium),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(l10n.carsReviewCount(s.count), style: theme.textTheme.bodyMedium),
                      if (s.verifiedOwnerCount > 0)
                        Pill(
                          label: l10n.carsVerifiedOwners(s.verifiedOwnerCount),
                          icon: Icons.verified_outlined,
                          tone: AppTone.success,
                          dense: true,
                        ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
              for (final r in const [5, 4, 3, 2, 1])
                Semantics(
                  label: l10n.carsStarsCount(r, s.distribution[r] ?? 0),
                  excludeSemantics: true,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Row(
                      children: [
                        SizedBox(width: 28, child: Text('$r★', style: theme.textTheme.labelMedium)),
                        Expanded(
                          child: ClipRRect(
                            borderRadius: AppRadii.pill,
                            child: LinearProgressIndicator(
                              value: maxCount == 0 ? 0 : (s.distribution[r] ?? 0) / maxCount,
                              minHeight: 8,
                            ),
                          ),
                        ),
                        const SizedBox(width: AppSpacing.sm),
                        Text('${s.distribution[r] ?? 0}', style: theme.textTheme.labelMedium),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
        for (final r in reviews.top) ...[
          const SizedBox(height: AppSpacing.cardGap),
          AppCard(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.xs,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Pill(
                      label: l10n.carsRatingOutOfFive('${r.rating}'),
                      icon: Icons.star_rounded,
                      tone: AppTone.brand,
                      dense: true,
                    ),
                    if (r.verifiedOwner)
                      Pill(
                        label: r.verifiedOwnerLabel ?? l10n.carsVerifiedOwner,
                        icon: Icons.verified_outlined,
                        tone: AppTone.success,
                        dense: true,
                      ),
                  ],
                ),
                if (r.title != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  Text(r.title!, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                ],
                const SizedBox(height: AppSpacing.xs),
                Text(r.body, maxLines: 5, overflow: TextOverflow.ellipsis, style: theme.textTheme.bodyMedium),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  [?r.authorName, ?friendlyTime(context, r.createdAt)].join(' · '),
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: AppSpacing.md),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [
            FilledButton.tonalIcon(
              onPressed: () => context.push(AppRoutes.carReviews(carSlug)),
              icon: const Icon(Icons.reviews_outlined),
              label: Text(l10n.carsAllReviews),
            ),
            OutlinedButton.icon(
              onPressed: () => context.push(AppRoutes.writeCarReview(carSlug)),
              icon: const Icon(Icons.rate_review_outlined),
              label: Text(l10n.carsWriteReview),
            ),
          ],
        ),
      ],
    );
  }
}

/// Curated competitors (market-aware).
class CompetitorsList extends StatelessWidget {
  const CompetitorsList({super.key, required this.cars});

  final List<CarSummary> cars;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    if (cars.isEmpty) {
      return EmptyState(
        icon: Icons.compare_arrows,
        title: l10n.carsNoCompetitorsTitle,
        message: l10n.carsNoCompetitorsMessage,
        compact: true,
      );
    }
    return AdaptiveGrid(
      minItemWidth: 300,
      children: [for (final c in cars) CarSummaryCard(car: c, layout: CarCardLayout.horizontal)],
    );
  }
}

/// Short lists of trims of the selected year (overview): name, powertrain,
/// availability, key facts and price.
class TrimQuickFacts extends StatelessWidget {
  const TrimQuickFacts({super.key, required this.variant});

  final VariantSummary variant;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final k = variant.keyFacts;
    RangeSpan? electric;
    for (final r in k.ranges) {
      if (r.rangeType == 'electric') {
        electric = r;
        break;
      }
    }
    return StatTileRow(
      minTileWidth: 150,
      tiles: [
        StatTile(
          icon: Icons.route_outlined,
          label: l10n.carsStatElectricRange,
          value: CarLabels.rangeSpan(fmt, electric),
          qualifier: electric == null ? null : l10n.carsMeasuredCycle(CarLabels.cycle(l10n, electric.cycle)),
        ),
        StatTile(
          icon: Icons.battery_charging_full,
          label: l10n.carsStatUsableBattery,
          value: fmt.energyKwh(k.usableBatteryKwh),
        ),
        StatTile(icon: Icons.bolt, label: l10n.carsStatDcPeak, value: fmt.powerKw(k.dcPeakKw)),
      ],
    );
  }
}
