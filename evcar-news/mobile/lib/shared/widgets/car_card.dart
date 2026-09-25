import 'package:flutter/material.dart';

import '../../app/theme/app_tokens.dart';
import '../../core/l10n/l10n.dart';
import 'app_card.dart';
import 'badges.dart';
import 'image_with_fallback.dart';
import 'price_tag.dart';

/// One key figure on a [CarCard] (max. three are shown).
@immutable
class CarCardStat {
  const CarCardStat({required this.icon, required this.label, required this.value, this.qualifier});

  final IconData icon;

  /// Short label ("Range").
  final String label;

  /// Formatted value; null = not available (never 0).
  final String? value;

  /// Measurement condition ("WLTP", "10–80%").
  final String? qualifier;
}

/// Layouts of [CarCard].
enum CarCardLayout {
  /// Image on top — carousels and grids.
  vertical,

  /// Thumbnail at the start — search results and long lists.
  horizontal,
}

/// Car / trim card for the catalog, home carousels, search, garage and
/// comparisons.
///
/// Shows the powertrain class clearly (a hybrid never looks like a full EV),
/// up to three key stats with "Not available" for missing values, the price
/// with its type (converted prices are labelled), a prominent 360° badge
/// when an interior tour exists, and demo/sponsored labels.
///
/// ```dart
/// CarCard(
///   brandName: m.brand.name,
///   title: m.name,
///   subtitle: '${v.name} · ${v.year}',
///   imageUrl: m.cover?.url,
///   powertrain: Powertrain.fromApi(v.powertrainType),
///   hasTour: v.hasInteriorTour,
///   stats: [
///     CarCardStat(icon: Icons.route_outlined, label: l10n.carsRange, value: fmt.distanceKm(v.rangeKm), qualifier: v.rangeCycle),
///     CarCardStat(icon: Icons.battery_charging_full, label: l10n.carsBattery, value: fmt.energyKwh(v.usableKwh)),
///     CarCardStat(icon: Icons.bolt, label: l10n.carsDcPeak, value: fmt.powerKw(v.dcPeakKw)),
///   ],
///   price: fmt.money(v.price?.amount, v.price?.currency),
///   priceType: PriceType.fromApi(v.price?.priceType),
///   onTap: () => context.push(AppRoutes.car(m.slug)),
///   trailingAction: FavoriteButton(item: …),
///   footer: CompareToggleButton(selection: …),
/// )
/// ```
class CarCard extends StatelessWidget {
  const CarCard({
    super.key,
    required this.title,
    this.brandName,
    this.subtitle,
    this.imageUrl,
    this.imageAlt,
    this.imageCredit,
    this.powertrain,
    this.stats = const [],
    this.price,
    this.priceType,
    this.priceConverted = false,
    this.showPrice = true,
    this.hasTour = false,
    this.isDemo = false,
    this.isSponsored = false,
    this.sponsorName,
    this.selected = false,
    this.onTap,
    this.trailingAction,
    this.footer,
    this.layout = CarCardLayout.vertical,
  });

  final String title;
  final String? brandName;

  /// Trim, model year, market ("Extended · 2025 · EG").
  final String? subtitle;
  final String? imageUrl;
  final String? imageAlt;
  final String? imageCredit;
  final Powertrain? powertrain;
  final List<CarCardStat> stats;
  final String? price;
  final PriceType? priceType;
  final bool priceConverted;
  final bool showPrice;
  final bool hasTour;
  final bool isDemo;
  final bool isSponsored;
  final String? sponsorName;

  /// Chosen (e.g. in the compare picker): outlined in primary + reported to
  /// screen readers; the caller also shows a check/text cue.
  final bool selected;
  final VoidCallback? onTap;

  /// Icon button in the top-end corner (e.g. `FavoriteButton`).
  final Widget? trailingAction;

  /// Under the content (e.g. `CompareToggleButton`); stays accessible.
  final Widget? footer;
  final CarCardLayout layout;

  String _semantics(AppLocalizations l10n) {
    final visibleStats = stats.take(3);
    return [
      if (brandName != null) '$brandName $title' else title,
      ?subtitle,
      if (powertrain != null) PowertrainPill.labelFor(l10n, powertrain!),
      for (final s in visibleStats)
        '${s.label}: ${s.value ?? l10n.commonNotAvailable}${s.value != null && s.qualifier != null ? ' ${s.qualifier}' : ''}',
      if (showPrice) price ?? l10n.commonPriceNotAvailable,
      if (showPrice && price != null && priceConverted) l10n.commonPriceConverted,
      if (hasTour) l10n.commonTour360Available,
      if (isSponsored) sponsorName == null ? l10n.commonSponsoredLabel : l10n.commonSponsoredBy(sponsorName!),
      if (isDemo) l10n.commonDemoLabel,
    ].join('. ');
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final content = layout == CarCardLayout.vertical ? _vertical(context) : _horizontal(context);
    final card = AppCard(
      padding: EdgeInsets.zero,
      onTap: onTap,
      selected: selected,
      semanticLabel: _semantics(l10n),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          ExcludeSemantics(child: content),
          if (footer != null)
            Padding(padding: const EdgeInsets.fromLTRB(AppSpacing.md, 0, AppSpacing.md, AppSpacing.md), child: footer),
        ],
      ),
    );
    if (trailingAction == null) return card;
    return Stack(
      children: [
        card,
        PositionedDirectional(
          top: AppSpacing.xs,
          end: AppSpacing.xs,
          child: DecoratedBox(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Theme.of(context).colorScheme.surface.withValues(alpha: 0.9),
            ),
            child: trailingAction,
          ),
        ),
      ],
    );
  }

  List<Widget> _labels({bool includeTour = false}) => [
    if (includeTour && hasTour) const Tour360Badge(dense: true),
    if (isSponsored) SponsoredLabel(sponsorName: sponsorName, dense: true),
    if (isDemo) const DemoBadge(dense: true),
  ];

  Widget _vertical(BuildContext context) {
    final theme = Theme.of(context);
    final overlay = <Widget>[if (hasTour) const Tour360Badge(dense: true), if (isDemo) const DemoBadge(dense: true)];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        ImageWithFallback(
          url: imageUrl,
          semanticLabel: imageAlt,
          credit: imageCredit,
          aspectRatio: 16 / 10,
          fallbackIcon: Icons.directions_car_outlined,
          showFallbackText: false,
          overlay: overlay.isEmpty
              ? null
              : PositionedDirectional(
                  top: AppSpacing.sm,
                  start: AppSpacing.sm,
                  child: Wrap(direction: Axis.vertical, spacing: 4, children: overlay),
                ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.md, AppSpacing.md, AppSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              ..._titleBlock(context),
              if (powertrain != null || isSponsored) ...[
                const SizedBox(height: AppSpacing.sm),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    if (powertrain != null) PowertrainPill(powertrain: powertrain!, dense: true),
                    if (isSponsored) SponsoredLabel(sponsorName: sponsorName, dense: true),
                  ],
                ),
              ],
              if (stats.isNotEmpty) ...[const SizedBox(height: AppSpacing.md), _StatsStrip(stats: stats)],
              if (showPrice) ...[
                const SizedBox(height: AppSpacing.md),
                Divider(height: 1, color: theme.colorScheme.outlineVariant.withValues(alpha: 0.6)),
                const SizedBox(height: AppSpacing.sm),
                PriceTag(price: price, type: priceType, isConverted: priceConverted, compact: true),
              ],
            ],
          ),
        ),
      ],
    );
  }

  List<Widget> _titleBlock(BuildContext context) {
    final theme = Theme.of(context);
    return [
      if (brandName != null)
        Text(
          brandName!,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.primary, fontWeight: FontWeight.w700),
        ),
      Padding(
        padding: EdgeInsetsDirectional.only(end: trailingAction != null && layout == CarCardLayout.horizontal ? 40 : 0),
        child: Text(
          title,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        ),
      ),
      if (subtitle != null)
        Text(
          subtitle!,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
    ];
  }

  Widget _horizontal(BuildContext context) {
    final labels = _labels(includeTour: true);
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ImageWithFallback(
            url: imageUrl,
            semanticLabel: imageAlt,
            width: 120,
            height: 84,
            borderRadius: AppRadii.image,
            fallbackIcon: Icons.directions_car_outlined,
            showFallbackText: false,
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                ..._titleBlock(context),
                if (powertrain != null || labels.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.xs),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: [
                      if (powertrain != null) PowertrainPill(powertrain: powertrain!, dense: true),
                      ...labels,
                    ],
                  ),
                ],
                if (stats.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.sm),
                  _StatsStrip(stats: stats, dense: true),
                ],
                if (showPrice) ...[
                  const SizedBox(height: AppSpacing.sm),
                  PriceTag(price: price, type: priceType, isConverted: priceConverted, compact: true),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Up to three compact stats that wrap instead of overflowing.
class _StatsStrip extends StatelessWidget {
  const _StatsStrip({required this.stats, this.dense = false});

  final List<CarCardStat> stats;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = context.l10n;
    return Wrap(
      spacing: dense ? AppSpacing.md : AppSpacing.lg,
      runSpacing: AppSpacing.sm,
      children: [
        for (final s in stats.take(3))
          Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Icon(s.icon, size: 16, color: theme.colorScheme.primary),
              ),
              const SizedBox(width: 4),
              Flexible(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      s.value ?? l10n.commonNotAvailable,
                      style: theme.textTheme.labelLarge?.copyWith(
                        fontWeight: s.value == null ? FontWeight.w400 : FontWeight.w700,
                        fontStyle: s.value == null ? FontStyle.italic : null,
                        color: s.value == null ? theme.colorScheme.onSurfaceVariant : theme.colorScheme.onSurface,
                      ),
                    ),
                    Text(
                      s.value != null && s.qualifier != null ? '${s.label} · ${s.qualifier}' : s.label,
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
      ],
    );
  }
}
