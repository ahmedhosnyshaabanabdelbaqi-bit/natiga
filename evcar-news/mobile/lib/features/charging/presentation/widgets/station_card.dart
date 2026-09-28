import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../shared/widgets/kit.dart';
import '../../domain/station_models.dart';
import '../../domain/station_status.dart';
import 'charging_labels.dart';

/// Favorite entry of a station (shared by list rows and the detail page).
FavoriteItem stationFavoriteItem({required String id, required String name, String? subtitle}) => FavoriteItem(
  key: FavoriteKey(FavoriteType.station, id),
  title: name,
  subtitle: subtitle,
  route: AppRoutes.station(id),
);

/// One station in the list / the map's bottom card.
///
/// Shows the three statuses separately (operational, open now, live
/// availability) with icon + text, the fastest known power, plugs and
/// charge points (plugs are not "cars at once"), distance and demo label.
class StationCard extends StatelessWidget {
  const StationCard({
    super.key,
    required this.station,
    required this.fetchedAt,
    required this.now,
    this.offlineCopy = false,
    this.connectorName,
    this.selected = false,
    this.onTap,
    this.compact = false,
  });

  final StationListItem station;
  final DateTime fetchedAt;
  final DateTime now;
  final bool offlineCopy;
  final String? Function(String code)? connectorName;
  final bool selected;
  final VoidCallback? onTap;

  /// Fewer lines (map bottom card).
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final theme = Theme.of(context);
    final s = station;
    final avail = listItemAvailability(s.availability, now: now, fetchedAt: fetchedAt, offlineCopy: offlineCopy);
    final op = operationalLook(l10n, s.operationalStatus);
    final open = offlineCopy ? openNowLook(l10n, OpenState.unknown) : openNowLook(l10n, s.openNow);
    final distance = distanceText(fmt, l10n, s.distanceM);
    final power = fmt.powerKw(s.maxPowerKw);
    final currents = s.currentTypes.map(currentLabel).join(' · ');
    final plugs = [for (final c in s.connectorTypes) connectorName?.call(c) ?? c.toUpperCase()];
    final semantic = [
      s.name,
      if (s.isDemo) l10n.commonDemoLabel,
      ?s.operatorName,
      if (distance != null) l10n.chargingDistanceAway(distance),
      '${l10n.chargingStatusOperational}: ${op.label}',
      '${l10n.chargingStatusOpenNow}: ${open.label}',
      '${l10n.chargingStatusLive}: ${availabilityLook(l10n, avail).label}',
      '${l10n.chargingMaxPower}: ${power ?? l10n.commonNotAvailable}',
    ].join('. ');

    return AppCard(
      onTap: onTap ?? () => context.push(AppRoutes.station(s.id)),
      selected: selected,
      semanticLabel: semantic,
      padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.lg, AppSpacing.md, AppSpacing.xs, AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _PowerBadge(maxPowerKw: s.maxPowerKw, dc: s.currentTypes.contains(CurrentType.dc)),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: ExcludeSemantics(
                  child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      s.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    if (s.operatorName != null || distance != null)
                      Padding(
                        padding: const EdgeInsets.only(top: AppSpacing.xxs),
                        child: Text(
                          [?s.operatorName, if (distance != null) l10n.chargingDistanceAway(distance)].join(' · '),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                        ),
                      ),
                  ],
                  ),
                ),
              ),
              FavoriteButton(item: stationFavoriteItem(id: s.id, name: s.name, subtitle: s.operatorName ?? s.city)),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          ExcludeSemantics(
            child: Wrap(
              spacing: AppSpacing.xs,
              runSpacing: AppSpacing.xs,
              children: [
                if (s.isDemo) const DemoBadge(dense: true),
                if (s.operationalStatus != OperationalStatus.operational)
                  StatusPill(look: op, kind: l10n.chargingStatusOperational),
                StatusPill(look: open, kind: l10n.chargingStatusOpenNow),
                StatusPill(look: availabilityLook(l10n, avail), kind: l10n.chargingStatusLive),
                if (s.compatibility != null)
                  Pill(
                    dense: true,
                    icon: s.compatibility!.compatibleConnectors > 0 ? Icons.verified_outlined : Icons.do_not_disturb_alt,
                    tone: s.compatibility!.compatibleConnectors > 0 ? AppTone.brand : AppTone.neutral,
                    label: s.compatibility!.compatibleConnectors > 0
                        ? l10n.chargingCompatibleConnectors(s.compatibility!.compatibleConnectors)
                        : l10n.chargingNotCompatible,
                  ),
              ],
            ),
          ),
          if (!compact) ...[
            const SizedBox(height: AppSpacing.sm),
            ExcludeSemantics(
              child: Text(
                [
                  if (currents.isNotEmpty) currents,
                  if (plugs.isNotEmpty) plugs.join(context.languageCode == 'ar' ? '، ' : ', '),
                  if (s.connectorCount != null) l10n.chargingPlugCount(s.connectorCount!),
                  if (s.pointCount != null) l10n.chargingPointCount(s.pointCount!),
                ].join(' · '),
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Leading badge with the fastest known power ("150 kW", or "—" + label).
class _PowerBadge extends StatelessWidget {
  const _PowerBadge({required this.maxPowerKw, required this.dc});

  final double? maxPowerKw;
  final bool dc;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final palette = context.palette;
    final fmt = AppFormatters.of(context);
    final tone = palette.tone(dc ? AppTone.brand : AppTone.info);
    final n = fmt.number(maxPowerKw, maxDecimals: 0);
    return ExcludeSemantics(
      child: Container(
        constraints: const BoxConstraints(minWidth: 52, minHeight: 52),
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs, vertical: AppSpacing.xs),
        decoration: BoxDecoration(
          color: tone.container,
          borderRadius: const BorderRadius.all(Radius.circular(AppRadii.md)),
          border: Border.all(color: tone.border),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(dc ? Icons.bolt : Icons.power_outlined, size: 18, color: tone.onContainer),
            Text(
              n ?? '—',
              style: theme.textTheme.labelLarge?.copyWith(color: tone.onContainer, fontWeight: FontWeight.w800),
            ),
            if (n != null)
              Text(fmt.unitLabel(Unit.kW), style: theme.textTheme.labelSmall?.copyWith(color: tone.onContainer)),
          ],
        ),
      ),
    );
  }
}

/// Loading placeholder shaped like [StationCard].
class StationCardSkeleton extends StatelessWidget {
  const StationCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) => const SkeletonCard(
    padding: EdgeInsets.all(AppSpacing.lg),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SkeletonBox(width: 52, height: 52),
        SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SkeletonLine(widthFactor: 0.8, fontSize: 16),
              SizedBox(height: AppSpacing.sm),
              SkeletonLine(widthFactor: 0.5),
              SizedBox(height: AppSpacing.md),
              SkeletonLine(widthFactor: 0.9),
            ],
          ),
        ),
      ],
    ),
  );
}
