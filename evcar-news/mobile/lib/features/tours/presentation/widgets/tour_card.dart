import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../shared/widgets/kit.dart';
import '../../domain/tour_models.dart';
import 'tour_facts.dart';
import 'tour_labels.dart';

/// Where a tour card leads: the viewer under its car page.
String? tourLocation(TourCard card) {
  final slug = card.modelSlug;
  return slug == null ? null : AppRoutes.tour(slug, card.id);
}

/// Large tour card (list of tours, home strip): preview, car, binding,
/// seats, demo / reference labels and a clear "open 360°" action.
class TourListCard extends StatelessWidget {
  const TourListCard({super.key, required this.card, this.width});

  final TourCard card;

  /// Fixed width inside horizontal lists.
  final double? width;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final location = tourLocation(card);
    void open() {
      if (location != null) context.push(location);
    }

    final fmt = AppFormatters.of(context);
    final semantics = [
      l10n.commonTour360,
      card.displayName,
      if (card.modelYear != null) l10n.toursModelYear(TourLabels.year(fmt, card.modelYear!)),
      if (card.interiorColorName != null) l10n.toursInterior(card.interiorColorName!),
      if (card.seatScenes.isNotEmpty) card.seatScenes.map((s) => TourLabels.seatRef(l10n, s)).join('، '),
      if (card.isReferenceForSimilarTrim) l10n.toursReferenceTitle,
      if (card.isDemo) TourLabels.demo(l10n, card),
    ].join('. ');

    return SizedBox(
      width: width,
      child: Semantics(
        button: location != null,
        label: semantics,
        hint: l10n.toursOpen,
        excludeSemantics: true,
        child: AppCard(
          padding: EdgeInsets.zero,
          onTap: location == null ? null : open,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Stack(
                children: [
                  ImageWithFallback(
                    url: card.previewUrl,
                    aspectRatio: 2,
                    width: width,
                    fallbackIcon: Icons.threesixty,
                    showFallbackText: false,
                  ),
                  Positioned.fill(
                    child: DecoratedBox(decoration: BoxDecoration(gradient: context.palette.imageScrim)),
                  ),
                  PositionedDirectional(
                    top: AppSpacing.sm,
                    start: AppSpacing.sm,
                    end: AppSpacing.sm,
                    child: Wrap(
                      spacing: AppSpacing.xs,
                      runSpacing: AppSpacing.xs,
                      children: [
                        const Tour360Badge(dense: true),
                        if (card.isDemo) const DemoBadge(dense: true),
                        if (card.isReferenceForSimilarTrim)
                          Pill(label: l10n.toursReferenceBadge, icon: Icons.compare_arrows, tone: AppTone.warning, dense: true),
                      ],
                    ),
                  ),
                  PositionedDirectional(
                    bottom: AppSpacing.sm,
                    end: AppSpacing.sm,
                    child: Container(
                      padding: const EdgeInsets.all(AppSpacing.sm),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.92),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(Icons.threesixty, color: theme.colorScheme.primary),
                    ),
                  ),
                ],
              ),
              Padding(
                padding: const EdgeInsets.all(AppSpacing.md),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      card.displayName,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    if (card.title != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        card.title!,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                      ),
                    ],
                    const SizedBox(height: AppSpacing.sm),
                    TourBindingPills(card: card, dense: true),
                    if (card.seatScenes.isNotEmpty) ...[
                      const SizedBox(height: AppSpacing.sm),
                      Wrap(
                        spacing: AppSpacing.xs,
                        runSpacing: AppSpacing.xs,
                        children: [
                          for (final s in card.seatScenes)
                            Pill(label: TourLabels.seatRef(l10n, s), icon: TourLabels.seatIcon(s.position), dense: true),
                        ],
                      ),
                    ],
                    if (card.isReferenceForSimilarTrim) ...[
                      const SizedBox(height: AppSpacing.sm),
                      ReferenceTrimNotice(card: card, compact: true),
                    ],
                    if (card.isDemo) ...[
                      const SizedBox(height: AppSpacing.sm),
                      DemoTourNotice(card: card, compact: true),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
