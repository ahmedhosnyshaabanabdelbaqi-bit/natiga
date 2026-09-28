import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/widgets/kit.dart';
import '../../calculators/presentation/widgets/calc_result_view.dart';
import '../../charging/presentation/widgets/directions_sheet.dart';
import '../../garage/common/personal_widgets.dart';
import '../domain/trip_models.dart';

/// A computed trip plan: summary, stops (with alternative, opening at ETA,
/// "now" availability clearly labelled as such), road legs, assumptions,
/// warnings and the disclaimer. Never presents arrival or a free connector
/// as guaranteed.
class TripPlanView extends ConsumerWidget {
  const TripPlanView({super.key, required this.plan, this.staleNotice});

  final TripPlan plan;
  final String? staleNotice;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final theme = Theme.of(context);
    String? range(MinutesRange? r) {
      if (r == null) return null;
      if ((r.high - r.low).abs() < 1) return fmt.durationMinutes(r.low);
      return '${fmt.durationMinutes(r.low)} – ${fmt.durationMinutes(r.high)}';
    }

    final cost = plan.costAmount == null || plan.costCurrency == null
        ? null
        : fmt.money(plan.costAmount, plan.costCurrency);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (staleNotice != null) ...[
          InlineNotice(message: staleNotice!, tone: AppTone.warning),
          const SizedBox(height: AppSpacing.md),
        ],
        AppCard(
          padding: EdgeInsets.zero,
          clip: true,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                decoration: BoxDecoration(gradient: context.palette.brandGradient),
                padding: const EdgeInsets.all(AppSpacing.lg),
                child: Semantics(
                  container: true,
                  liveRegion: true,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        [plan.origin?.label, plan.destination?.label].whereType<String>().join(' → '),
                        style: theme.textTheme.titleMedium?.copyWith(color: Colors.white),
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        range(plan.totalMinutes) ?? l10n.commonNotAvailable,
                        style: theme.textTheme.headlineMedium?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      Text(
                        l10n.tripsStopsSummary(
                          plan.stopCount,
                          fmt.distanceKm(plan.distanceKm) ?? l10n.commonNotAvailable,
                        ),
                        style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white.withValues(alpha: 0.9)),
                      ),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(AppSpacing.lg),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Wrap(
                      spacing: AppSpacing.sm,
                      runSpacing: AppSpacing.sm,
                      children: [
                        ConfidencePill(confidence: plan.confidence),
                        if (plan.vehicleName != null)
                          Pill(
                            icon: Icons.directions_car_outlined,
                            label: plan.vehicleName!,
                            dense: true,
                            outlined: true,
                          ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.md),
                    StatTileRow(
                      tiles: [
                        StatTile(
                          dense: true,
                          icon: Icons.drive_eta_outlined,
                          label: l10n.tripsDriveTime,
                          value: fmt.durationMinutes(plan.driveMinutes),
                        ),
                        StatTile(
                          dense: true,
                          icon: Icons.ev_station_outlined,
                          label: l10n.tripsChargeTime,
                          value: range(plan.chargingMinutes),
                        ),
                        StatTile(
                          dense: true,
                          icon: Icons.bolt,
                          label: l10n.tripsEnergyUsed,
                          value: fmt.energyKwh(plan.energyUsedKwh),
                        ),
                        StatTile(
                          dense: true,
                          icon: Icons.battery_5_bar,
                          label: l10n.tripsArrivalSoc,
                          value: fmt.percent(plan.arrivalSocPercent),
                        ),
                        StatTile(
                          dense: true,
                          icon: Icons.payments_outlined,
                          label: l10n.tripsCost,
                          value: cost,
                          qualifier: cost == null ? l10n.tripsCostNotCalculated : plan.costNote,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        for (final w in plan.warnings) ...[
          const SizedBox(height: AppSpacing.sm),
          InlineNotice(message: w.message, tone: AppTone.warning),
        ],
        const SizedBox(height: AppSpacing.lg),
        if (plan.stops.isEmpty)
          InlineNotice(message: l10n.tripsNoStopsNeeded, tone: AppTone.success, icon: Icons.check_circle_outline)
        else
          for (final s in plan.stops) ...[_StopCard(stop: s), const SizedBox(height: AppSpacing.md)],
        if (plan.legs.isNotEmpty) ...[
          SectionCard(
            title: l10n.tripsLegs,
            icon: Icons.route_outlined,
            child: Column(
              children: [
                for (final leg in plan.legs)
                  InfoRow(
                    label: l10n.tripsLegN(leg.index + 1),
                    value: [
                      fmt.distanceKm(leg.distanceKm),
                      fmt.durationMinutes(leg.durationMinutes),
                      if (leg.departureSocPercent != null && leg.arrivalSocPercent != null)
                        fmt.range('${fmt.percent(leg.departureSocPercent)}', '${fmt.percent(leg.arrivalSocPercent)}'),
                    ].whereType<String>().join(' · '),
                  ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),
        ],
        SectionCard(
          title: l10n.tripsAssumptions,
          icon: Icons.fact_check_outlined,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final a in plan.assumptions)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      InfoRow(
                        label: a.label,
                        value: a.value == null ? null : (a.unit == null ? '${a.value}' : '${a.value} ${a.unit}'),
                        trailing: Padding(
                          padding: const EdgeInsetsDirectional.only(start: AppSpacing.sm),
                          child: Pill(
                            label: switch (a.origin) {
                              'catalog' => l10n.calculatorsOriginCatalog,
                              'default' => l10n.calculatorsOriginDefault,
                              _ => l10n.calculatorsOriginUser,
                            },
                            dense: true,
                            tone: a.origin == 'default' ? AppTone.warning : AppTone.neutral,
                          ),
                        ),
                      ),
                      if (a.note != null && a.note!.isNotEmpty) Text(a.note!, style: theme.textTheme.bodySmall),
                    ],
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        if (plan.disclaimer != null)
          Text(plan.disclaimer!, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        if (plan.routingAttribution != null && plan.routingAttribution!.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xs),
          Text(
            l10n.tripsRoutingBy(plan.routingAttribution!),
            style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
      ],
    );
  }
}

class _StopCard extends ConsumerWidget {
  const _StopCard({required this.stop});

  final TripStop stop;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final theme = Theme.of(context);
    final s = stop.station;
    final chargeTime = stop.chargeMinutes != null
        ? fmt.durationMinutes(stop.chargeMinutes)
        : stop.chargeMinutesRange == null
        ? null
        : '${fmt.durationMinutes(stop.chargeMinutesRange!.low)} – ${fmt.durationMinutes(stop.chargeMinutesRange!.high)}';
    return SectionCard(
      title: l10n.tripsStopN(stop.index + 1, s.name),
      icon: Icons.ev_station,
      subtitle: [s.address, s.city].whereType<String>().join(', '),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              _openPill(l10n, s.openAtEta),
              _availabilityPill(l10n, s),
              if (s.connectorType != null)
                Pill(
                  icon: Icons.power_outlined,
                  label: [
                    s.connectorType!,
                    ?s.currentType,
                    if (s.maxUsablePowerKw != null) fmt.powerKw(s.maxUsablePowerKw)!,
                  ].join(' · '),
                  dense: true,
                  outlined: true,
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          InfoRow(label: l10n.tripsAtKm, value: fmt.distanceKm(stop.positionKm)),
          InfoRow(label: l10n.tripsDetour, value: fmt.distanceKm(stop.detourKm)),
          InfoRow(
            label: l10n.tripsChargeFromTo,
            value: stop.arrivalSocPercent == null || stop.departureSocPercent == null
                ? null
                : fmt.range('${fmt.percent(stop.arrivalSocPercent)}', '${fmt.percent(stop.departureSocPercent)}'),
          ),
          InfoRow(label: l10n.tripsChargeEnergy, value: fmt.energyKwh(stop.chargeKwh)),
          InfoRow(
            label: l10n.tripsStopChargeTime,
            value: chargeTime,
            trailing: stop.chargeMinutes == null && stop.chargeMinutesRange != null
                ? Padding(
                    padding: const EdgeInsetsDirectional.only(start: AppSpacing.sm),
                    child: Pill(label: l10n.tripsRough, dense: true, tone: AppTone.warning),
                  )
                : null,
          ),
          if (stop.etaEarliest != null)
            InfoRow(
              label: l10n.tripsEta,
              value: [
                fmt.dateTime(stop.etaEarliest),
                if (stop.etaLatest != null && stop.etaLatest != stop.etaEarliest) fmt.dateTime(stop.etaLatest),
              ].whereType<String>().join(' – '),
            ),
          if (s.accessRestrictions != null) InfoRow(label: l10n.tripsAccess, value: s.accessRestrictions),
          if (s.openingHoursText != null) InfoRow(label: l10n.tripsHours, value: s.openingHoursText),
          for (final n in stop.notes)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xs),
              child: Text('• $n', style: theme.textTheme.bodySmall),
            ),
          if (stop.alternative case final alt?) ...[
            const Divider(height: AppSpacing.xl),
            Text(l10n.tripsAlternative, style: theme.textTheme.labelLarge),
            const SizedBox(height: AppSpacing.xxs),
            Text(alt.name, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: AppSpacing.xs),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [_openPill(l10n, alt.openAtEta), _availabilityPill(l10n, alt)],
            ),
          ],
          const SizedBox(height: AppSpacing.sm),
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: TextButton.icon(
              icon: const Icon(Icons.directions_outlined),
              label: Text(l10n.tripsDirections),
              onPressed: () => showDirectionsSheet(context, ref, lat: s.lat, lng: s.lng, label: s.name),
            ),
          ),
        ],
      ),
    );
  }

  Widget _openPill(AppLocalizations l10n, String openAtEta) => switch (openAtEta) {
    'open' => Pill(icon: Icons.schedule, label: l10n.tripsOpenAtEta, tone: AppTone.success, dense: true),
    'closed' => Pill(icon: Icons.block, label: l10n.tripsClosedAtEta, tone: AppTone.danger, dense: true),
    _ => Pill(icon: Icons.help_outline, label: l10n.tripsHoursUnknown, tone: AppTone.warning, dense: true),
  };

  Widget _availabilityPill(AppLocalizations l10n, TripStation s) {
    if (s.availabilityFreshness != 'live') {
      return Pill(icon: Icons.help_outline, label: l10n.tripsAvailabilityUnknown, dense: true);
    }
    final (tone, icon, label) = switch (s.availabilityStatus) {
      'available' => (AppTone.success, Icons.check_circle_outline, l10n.tripsAvailableNow),
      'occupied' => (AppTone.warning, Icons.timelapse, l10n.tripsOccupiedNow),
      'out_of_order' => (AppTone.danger, Icons.report_outlined, l10n.tripsOutOfOrderNow),
      _ => (AppTone.neutral, Icons.help_outline, l10n.tripsAvailabilityUnknown),
    };
    return Pill(icon: icon, label: label, tone: tone, dense: true);
  }
}
