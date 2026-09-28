import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../shared/widgets/kit.dart';
import '../../domain/catalog_models.dart';
import 'car_labels.dart';

/// The 360° interior tours of the selected trim — shown prominently. When
/// the trim has no tour, says so plainly ("الجولة غير متاحة لهذه الفئة")
/// and offers the regular photo gallery instead.
class ToursSection extends StatelessWidget {
  const ToursSection({
    super.key,
    required this.carSlug,
    required this.tours,
    required this.images,
    required this.toursEnabled,
    this.unavailableLabel,
  });

  final String carSlug;

  /// Tours of the selected trim (exact first, then reference tours).
  final List<TourSummary> tours;
  final List<CatalogImage> images;

  /// `interiorTours` feature flag — the viewer route exists only when on.
  final bool toursEnabled;
  final String? unavailableLabel;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    if (tours.isEmpty || !toursEnabled) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _UnavailableTourCard(message: tours.isEmpty ? l10n.carsTourUnavailable : l10n.carsToursDisabled),
          const SizedBox(height: AppSpacing.lg),
          GalleryStrip(carSlug: carSlug, images: images),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < tours.length; i++) ...[
          if (i > 0) const SizedBox(height: AppSpacing.cardGap),
          TourHeroCard(carSlug: carSlug, tour: tours[i]),
        ],
        if (images.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.lg),
          GalleryStrip(carSlug: carSlug, images: images),
        ],
      ],
    );
  }
}

/// Big "جولة داخلية 360°" card that opens the viewer.
class TourHeroCard extends StatelessWidget {
  const TourHeroCard({super.key, required this.carSlug, required this.tour, this.compact = false});

  final String carSlug;
  final TourSummary tour;

  /// Smaller variant for the overview tab.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final palette = context.palette;
    void open() => context.push(AppRoutes.tour(carSlug, tour.id));
    final swatch = _parseHex(tour.interiorColorHex);
    final semantics = [
      l10n.carsTourTitle,
      if (tour.interiorColorName != null) l10n.carsTourInterior(tour.interiorColorName!),
      if (tour.seatScenes.isNotEmpty)
        l10n.carsTourSeats(tour.seatScenes.map((s) => CarLabels.seatPosition(l10n, s)).join('، ')),
      if (tour.isReferenceForSimilarTrim) l10n.carsTourReference(tour.referenceVariantName ?? l10n.commonNotAvailable),
      if (tour.isDemo) l10n.commonDemoLabel,
    ].join('. ');

    return Semantics(
      button: true,
      label: semantics,
      hint: l10n.carsTourOpen,
      excludeSemantics: true,
      child: Material(
        color: Colors.transparent,
        borderRadius: AppRadii.card,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: open,
          child: Ink(
            decoration: BoxDecoration(gradient: palette.brandGradient, borderRadius: AppRadii.card),
            child: Stack(
              children: [
                if (isLoadableImageUrl(tour.previewUrl))
                  Positioned.fill(
                    child: Opacity(
                      opacity: 0.45,
                      child: ImageWithFallback(url: tour.previewUrl, showFallbackText: false),
                    ),
                  ),
                Positioned.fill(
                  child: DecoratedBox(decoration: BoxDecoration(gradient: palette.imageScrim)),
                ),
                Padding(
                  padding: EdgeInsets.all(compact ? AppSpacing.lg : AppSpacing.xl),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(AppSpacing.sm),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.18),
                              shape: BoxShape.circle,
                              border: Border.all(color: Colors.white.withValues(alpha: 0.5)),
                            ),
                            child: Icon(Icons.threesixty, color: Colors.white, size: compact ? 24 : 32),
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          if (tour.isDemo)
                            const Flexible(
                              child: Align(alignment: AlignmentDirectional.centerEnd, child: DemoBadge(dense: true)),
                            )
                          else
                            const Spacer(),
                        ],
                      ),
                      SizedBox(height: compact ? AppSpacing.md : AppSpacing.xl),
                      Text(
                        l10n.carsTourTitle,
                        style: (compact ? theme.textTheme.titleLarge : theme.textTheme.headlineSmall)?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      if (tour.title != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          tour.title!,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white.withValues(alpha: 0.9)),
                        ),
                      ],
                      const SizedBox(height: AppSpacing.md),
                      Wrap(
                        spacing: AppSpacing.sm,
                        runSpacing: AppSpacing.xs,
                        children: [
                          for (final s in tour.seatScenes)
                            _GlassChip(icon: Icons.event_seat, label: CarLabels.seatPosition(l10n, s)),
                          if (tour.interiorColorName != null)
                            _GlassChip(swatch: swatch, label: l10n.carsTourInterior(tour.interiorColorName!)),
                        ],
                      ),
                      if (tour.isReferenceForSimilarTrim) ...[
                        const SizedBox(height: AppSpacing.md),
                        Container(
                          padding: const EdgeInsets.all(AppSpacing.md),
                          decoration: BoxDecoration(
                            color: palette.tone(AppTone.warning).container,
                            borderRadius: BorderRadius.circular(AppRadii.md),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(Icons.info_outline, color: palette.tone(AppTone.warning).onContainer),
                              const SizedBox(width: AppSpacing.sm),
                              Expanded(
                                child: Text(
                                  [
                                    l10n.carsTourReference(tour.referenceVariantName ?? l10n.commonNotAvailable),
                                    if (tour.differenceNote != null) tour.differenceNote!,
                                  ].join('\n'),
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: palette.tone(AppTone.warning).onContainer,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                      SizedBox(height: compact ? AppSpacing.md : AppSpacing.lg),
                      FilledButton.icon(
                        onPressed: open,
                        style: FilledButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: theme.colorScheme.primary,
                          minimumSize: const Size(0, 48),
                        ),
                        icon: const Icon(Icons.play_arrow_rounded),
                        label: Text(l10n.carsTourOpen),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  static Color? _parseHex(String? hex) {
    if (hex == null) return null;
    final m = RegExp(r'^#?([0-9a-fA-F]{6})$').firstMatch(hex.trim());
    if (m == null) return null;
    return Color(0xFF000000 | int.parse(m.group(1)!, radix: 16));
  }
}

class _GlassChip extends StatelessWidget {
  const _GlassChip({required this.label, this.icon, this.swatch});

  final String label;
  final IconData? icon;
  final Color? swatch;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsetsDirectional.fromSTEB(8, 4, 10, 4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.16),
        borderRadius: AppRadii.pill,
        border: Border.all(color: Colors.white.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (swatch != null)
            Container(
              width: 14,
              height: 14,
              decoration: BoxDecoration(
                color: swatch,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white),
              ),
            )
          else if (icon != null)
            Icon(icon, size: 14, color: Colors.white),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              label,
              style: Theme.of(context).textTheme.labelMedium
                  ?.copyWith(color: Colors.white, fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}

class _UnavailableTourCard extends StatelessWidget {
  const _UnavailableTourCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.xl),
      child: Column(
        children: [
          const AppIllustration(icon: Icons.threesixty, tone: AppTone.neutral, size: 88),
          const SizedBox(height: AppSpacing.md),
          Semantics(
            header: true,
            child: Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            context.l10n.carsTourUnavailableHint,
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}

/// Licensed photos of the car (thumbnails → full gallery with zoom).
class GalleryStrip extends StatelessWidget {
  const GalleryStrip({super.key, required this.carSlug, required this.images});

  final String carSlug;
  final List<CatalogImage> images;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    if (images.isEmpty) {
      return EmptyState(
        compact: true,
        icon: Icons.photo_library_outlined,
        title: l10n.carsGalleryEmptyTitle,
        message: l10n.carsGalleryEmptyMessage,
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(
          title: l10n.carsGalleryTitle,
          icon: Icons.photo_library_outlined,
          padding: const EdgeInsetsDirectional.only(bottom: AppSpacing.sm),
          onSeeAll: () => context.push(AppRoutes.carGallery(carSlug)),
        ),
        SizedBox(
          height: 96 * context.textScale.clamp(1.0, 1.3),
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: images.length.clamp(0, 12),
            separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.sm),
            itemBuilder: (context, i) => Semantics(
              button: true,
              label: images[i].alt ?? l10n.carsGalleryPhoto(i + 1, images.length),
              excludeSemantics: true,
              child: InkWell(
                borderRadius: AppRadii.image,
                onTap: () => context.push(AppRoutes.carGallery(carSlug)),
                child: ImageWithFallback(
                  url: images[i].url,
                  width: 140,
                  height: double.infinity,
                  borderRadius: AppRadii.image,
                  showFallbackText: false,
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
