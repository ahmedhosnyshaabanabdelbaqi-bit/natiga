import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../shared/widgets/kit.dart';
import '../../domain/catalog_models.dart';
import 'car_labels.dart';

/// Favorite snapshot of a model (type `model`, opens the car page).
FavoriteItem modelFavorite(CarSummary car) => FavoriteItem(
  key: FavoriteKey(FavoriteType.model, car.id),
  title: car.title,
  imageUrl: car.image?.url,
  route: AppRoutes.car(car.slug),
);

/// Catalog card of a model built on the kit's [CarCard]: powertrain,
/// electric range WITH its cycle, usable battery, DC peak, local price with
/// type ("from … " when trims differ), 360° badge, demo label, favorite.
class CarSummaryCard extends StatelessWidget {
  const CarSummaryCard({super.key, required this.car, this.layout = CarCardLayout.vertical, this.showFavorite = true});

  final CarSummary car;
  final CarCardLayout layout;
  final bool showFavorite;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final range = car.headlineRange;
    final from = car.priceFrom;
    final to = car.priceTo;
    final fromText = from == null ? null : fmt.money(from.amount.amount, from.amount.currency);
    final varies = from != null && to != null && from.amount.amount != to.amount.amount;
    final powertrains = car.powertrainTypes.map(Powertrain.fromApi).whereType<Powertrain>().toList();
    final subtitle = [
      if (car.modelYears.isNotEmpty) CarLabels.year(fmt, car.modelYears.first),
      if (car.variantCount != null) l10n.carsTrimCount(car.variantCount!),
      if (car.bodyType != null) CarLabels.bodyType(l10n, car.bodyType!),
      if (powertrains.length > 1) powertrains.map((p) => p.apiValue.toUpperCase()).join(' / '),
    ].join(' · ');

    return CarCard(
      layout: layout,
      brandName: car.brand.name,
      title: car.name,
      subtitle: subtitle.isEmpty ? null : subtitle,
      imageUrl: car.image?.url,
      imageAlt: car.image?.alt ?? car.title,
      imageCredit: car.image?.credit,
      // A single pill only when every trim shares the powertrain, so a model
      // with hybrid trims never looks like a pure EV (subtitle lists them).
      powertrain: powertrains.length == 1 ? powertrains.first : null,
      hasTour: car.hasTour,
      isDemo: car.isDemo,
      stats: [
        CarCardStat(
          icon: Icons.route_outlined,
          label: l10n.carsStatRange,
          value: CarLabels.rangeSpan(fmt, range),
          qualifier: range == null ? null : CarLabels.cycle(l10n, range.cycle),
        ),
        CarCardStat(
          icon: Icons.battery_charging_full,
          label: l10n.carsStatBattery,
          value: CarLabels.kwhSpan(fmt, car.usableBatteryMinKwh, car.usableBatteryMaxKwh),
        ),
        CarCardStat(icon: Icons.bolt, label: l10n.carsStatDcPeak, value: fmt.powerKw(car.maxDcPeakKw)),
      ],
      price: fromText == null ? null : (varies ? l10n.carsPriceFrom(fromText) : fromText),
      priceType: from == null ? null : PriceType.fromApi(from.priceType),
      onTap: () => context.push(AppRoutes.car(car.slug)),
      trailingAction: showFavorite ? FavoriteButton(item: modelFavorite(car)) : null,
    );
  }
}

/// Round brand mark: licensed logo when available, otherwise initials on
/// the brand gradient (never a fetched/unlicensed logo).
class BrandAvatar extends StatelessWidget {
  const BrandAvatar({super.key, required this.name, this.logoUrl, this.size = 56});

  final String name;
  final String? logoUrl;
  final double size;

  static String initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    final first = parts.first.characters.first;
    final second = parts.length > 1 ? parts[1].characters.first : '';
    return (first + second).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final url = logoUrl;
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: url == null ? context.palette.brandGradient : null,
          color: url == null ? null : theme.colorScheme.surface,
          border: Border.all(color: theme.colorScheme.outlineVariant),
        ),
        clipBehavior: Clip.antiAlias,
        alignment: Alignment.center,
        child: url == null
            ? Text(
                initials(name),
                style: theme.textTheme.titleMedium?.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
                textScaler: TextScaler.noScaling,
              )
            : Padding(
                padding: EdgeInsets.all(size * 0.14),
                child: ImageWithFallback(
                  url: url,
                  width: size * 0.72,
                  height: size * 0.72,
                  fit: BoxFit.contain,
                  fallbackIcon: Icons.directions_car_outlined,
                  showFallbackText: false,
                ),
              ),
      ),
    );
  }
}

/// Tappable brand chip for the catalog strip / brands grid.
class BrandTile extends StatelessWidget {
  const BrandTile({super.key, required this.brand, this.onTap, this.width = 84});

  final BrandSummary brand;
  final VoidCallback? onTap;
  final double width;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = context.l10n;
    final count = brand.carCount;
    final label = [
      brand.name,
      if (count != null) (count == 0 ? l10n.carsBrandNoCarsInMarket : l10n.carsModelCount(count)),
      if (brand.isDemo) l10n.commonDemoLabel,
    ].join('. ');
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadii.md),
        child: ConstrainedBox(
          constraints: BoxConstraints(minWidth: width, maxWidth: width * context.textScale.clamp(1.0, 1.6)),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm, horizontal: AppSpacing.xs),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Opacity(
                  opacity: count == 0 ? 0.55 : 1,
                  child: BrandAvatar(name: brand.name, logoUrl: brand.ref.logo?.url),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  brand.name,
                  maxLines: 2,
                  textAlign: TextAlign.center,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w600),
                ),
                if (brand.isDemo) ...[const SizedBox(height: 2), const DemoBadge(dense: true)],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
