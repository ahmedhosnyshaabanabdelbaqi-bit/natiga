import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../shared/widgets/kit.dart';
import '../../domain/encyclopedia_models.dart';

/// Icon of a category (server `iconKey`, else the category key).
IconData encyclopediaCategoryIcon(String? iconKey, [String? key]) {
  final k = (iconKey ?? key ?? '').toLowerCase();
  if (k.contains('home')) return Icons.home_outlined;
  if (k.contains('fast') || k.contains('dc')) return Icons.bolt;
  if (k.contains('connector') || k.contains('plug')) return Icons.power_outlined;
  if (k.contains('batter')) return Icons.battery_charging_full;
  if (k.contains('range')) return Icons.route_outlined;
  if (k.contains('type') || k.contains('car') || k.contains('vehicle')) return Icons.directions_car_outlined;
  if (k.contains('warrant')) return Icons.verified_user_outlined;
  if (k.contains('used') || k.contains('inspect')) return Icons.fact_check_outlined;
  if (k.contains('maint')) return Icons.build_outlined;
  if (k.contains('cost') || k.contains('money')) return Icons.payments_outlined;
  return Icons.menu_book_outlined;
}

String encyclopediaLanguageName(AppLocalizations l10n, String? code) => switch (code) {
  'ar' => l10n.encyclopediaLanguageAr,
  'en' => l10n.encyclopediaLanguageEn,
  _ => code ?? l10n.commonUnknown,
};

/// "Technically reviewed · 3 Mar 2026" — icon + text, never colour only.
class ReviewedBadge extends StatelessWidget {
  const ReviewedBadge({super.key, required this.review, this.dense = true, this.withDate = false});

  final EncyclopediaReview review;
  final bool dense;
  final bool withDate;

  @override
  Widget build(BuildContext context) {
    if (!review.reviewed) return const SizedBox.shrink();
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final label = review.label ?? l10n.encyclopediaReviewed;
    final date = fmt.date(review.reviewedAt);
    return Pill(
      icon: Icons.verified_outlined,
      tone: AppTone.success,
      dense: dense,
      label: withDate && date != null ? l10n.encyclopediaReviewedOn(label, date) : label,
      tooltip: l10n.encyclopediaReviewedExplain,
    );
  }
}

/// Square tinted icon tile used when an entry has no cover image.
class _CategoryTile extends StatelessWidget {
  const _CategoryTile({required this.icon, this.size = 56});

  final IconData icon;
  final double size;

  @override
  Widget build(BuildContext context) {
    final tone = context.palette.tone(AppTone.brand);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: tone.container, borderRadius: AppRadii.control),
      alignment: Alignment.center,
      child: Icon(icon, color: tone.onContainer, size: size * 0.5),
    );
  }
}

/// One entry in a list / carousel. Opens `/encyclopedia/:slug`.
class EncyclopediaEntryCard extends StatelessWidget {
  const EncyclopediaEntryCard({super.key, required this.entry, this.compact = false});

  final EncyclopediaEntrySummary entry;

  /// Vertical, shorter card for horizontal carousels (home guides).
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final fmt = AppFormatters.of(context);
    final e = entry;
    final minutes = e.readingMinutes;
    final pills = <Widget>[
      ReviewedBadge(review: e.review),
      if (minutes != null)
        Pill(
          icon: Icons.schedule,
          dense: true,
          label: l10n.encyclopediaReadingMinutes(minutes, fmt.number(minutes) ?? '$minutes'),
        ),
      if (e.isFallback && e.language != null)
        Pill(
          icon: Icons.translate,
          dense: true,
          label: l10n.encyclopediaShownInLanguage(encyclopediaLanguageName(l10n, e.language)),
        ),
      if (e.isDemo) const DemoBadge(dense: true),
    ];
    final semantic = [
      e.title,
      e.category.name,
      if (e.review.reviewed) e.review.label ?? l10n.encyclopediaReviewed,
      if (minutes != null) l10n.encyclopediaReadingMinutes(minutes, fmt.number(minutes) ?? '$minutes'),
      if (e.isDemo) l10n.commonDemoLabel,
    ].join('. ');
    final icon = encyclopediaCategoryIcon(e.category.iconKey, e.category.key);
    final titleStyle = theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700);
    final category = Text(
      e.category.name,
      style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.primary),
    );

    if (compact) {
      return AppCard(
        semanticLabel: semantic,
        onTap: () => context.push(AppRoutes.encyclopediaEntry(e.slug)),
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _CategoryTile(icon: icon, size: 44),
            const SizedBox(height: AppSpacing.sm),
            category,
            const SizedBox(height: 2),
            Text(e.title, style: titleStyle, maxLines: 3, overflow: TextOverflow.ellipsis),
            const SizedBox(height: AppSpacing.sm),
            Wrap(spacing: AppSpacing.xs, runSpacing: AppSpacing.xs, children: pills),
          ],
        ),
      );
    }

    return AppCard(
      semanticLabel: semantic,
      onTap: () => context.push(AppRoutes.encyclopediaEntry(e.slug)),
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (e.coverImage != null)
            SizedBox(
              width: 72,
              child: ImageWithFallback(
                url: e.coverImage!.url,
                semanticLabel: e.coverImage!.alt,
                aspectRatio: 1,
                width: 72,
                borderRadius: AppRadii.control,
                fallbackIcon: icon,
                showFallbackText: false,
              ),
            )
          else
            _CategoryTile(icon: icon),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                category,
                const SizedBox(height: 2),
                Text(e.title, style: titleStyle),
                if (e.summary != null) ...[
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    e.summary!,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  ),
                ],
                const SizedBox(height: AppSpacing.sm),
                Wrap(spacing: AppSpacing.xs, runSpacing: AppSpacing.xs, children: pills),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Skeleton of an entry list.
class EncyclopediaListSkeleton extends StatelessWidget {
  const EncyclopediaListSkeleton({super.key, this.count = 4});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Skeleton(
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: context.pageGutter),
        child: Column(
          children: [
            for (var i = 0; i < count; i++)
              const Padding(
                padding: EdgeInsets.only(bottom: AppSpacing.cardGap),
                child: SkeletonCard(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SkeletonBox(width: 56, height: 56),
                      SizedBox(width: AppSpacing.md),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SkeletonLine(widthFactor: 0.3),
                            SizedBox(height: AppSpacing.sm),
                            SkeletonLine(widthFactor: 0.9, fontSize: 16),
                            SizedBox(height: AppSpacing.sm),
                            SkeletonLine(widthFactor: 0.6),
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
