import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../app/router/app_routes.dart';
import '../../../shared/widgets/kit.dart';
import '../../garage/application/garage_providers.dart';
import '../../garage/common/personal_widgets.dart';
import '../application/charging_logs_providers.dart';
import '../domain/charging_log.dart';
import 'widgets/log_labels.dart';
import 'widgets/monthly_bar_chart.dart';

/// Spending & consumption (`/charging-logs/reports`), computed by the server
/// ONLY from the user's own entries: spend per currency (never converted),
/// energy per month, and per car the distance, consumption and cost per
/// 100 km from odometer differences — or "insufficient data" with the reason.
class ChargingLogReportsScreen extends ConsumerStatefulWidget {
  const ChargingLogReportsScreen({super.key});

  @override
  ConsumerState<ChargingLogReportsScreen> createState() => _ChargingLogReportsScreenState();
}

class _ChargingLogReportsScreenState extends ConsumerState<ChargingLogReportsScreen> {
  ReportQuery _query = const ReportQuery();
  String? _currency;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return PersonalPage(
      title: l10n.chargingLogsReportsTitle,
      returnTo: AppRoutes.chargingLogReports,
      guestMessage: l10n.chargingLogsGuestMessage,
      builder: (context, user) {
        final value = ref.watch(chargingReportProvider(_query));
        final cars = ref.watch(garageVehiclesProvider).value ?? const [];
        return AppScaffold.slivers(
          title: l10n.chargingLogsReportsTitle,
          onRefresh: () => ref.refresh(chargingReportProvider(_query).future),
          slivers: [
            SliverToBoxAdapter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  FilterBar(
                    chips: [
                      for (final p in ReportPeriod.values)
                        AppFilterChip(
                          label: switch (p) {
                            ReportPeriod.last3Months => l10n.chargingLogsPeriod3,
                            ReportPeriod.last6Months => l10n.chargingLogsPeriod6,
                            ReportPeriod.last12Months => l10n.chargingLogsPeriod12,
                            ReportPeriod.allTime => l10n.chargingLogsPeriodAll,
                          },
                          selected: _query.period == p,
                          onSelected: (_) =>
                              setState(() => _query = ReportQuery(period: p, vehicleId: _query.vehicleId)),
                        ),
                    ],
                  ),
                  if (cars.length > 1)
                    FilterBar(
                      chips: [
                        AppFilterChip(
                          label: l10n.chargingLogsAllCars,
                          selected: _query.vehicleId == null,
                          onSelected: (_) => setState(() => _query = ReportQuery(period: _query.period)),
                        ),
                        for (final c in cars)
                          AppFilterChip(
                            label: c.displayName,
                            selected: _query.vehicleId == c.id,
                            onSelected: (_) =>
                                setState(() => _query = ReportQuery(period: _query.period, vehicleId: c.id)),
                          ),
                      ],
                    ),
                ],
              ),
            ),
            SliverAsyncStateView<ChargingReport>(
              value: value,
              onRetry: () => ref.invalidate(chargingReportProvider(_query)),
              isEmpty: (r) => r.isEmpty,
              emptyIcon: Icons.insights_outlined,
              emptyTitle: l10n.chargingLogsReportEmptyTitle,
              emptyMessage: l10n.chargingLogsReportEmptyMessage,
              emptyActions: [
                StateAction(
                  label: l10n.chargingLogsAdd,
                  icon: Icons.add,
                  primary: true,
                  onPressed: () => context.push(AppRoutes.chargingLogNew),
                ),
              ],
              loading: Padding(
                padding: EdgeInsets.all(context.pageGutter),
                child: const Skeleton(
                  child: Column(
                    children: [
                      SkeletonBox(height: 96),
                      SizedBox(height: AppSpacing.lg),
                      SkeletonBox(height: 220),
                      SizedBox(height: AppSpacing.lg),
                      SkeletonBox(height: 220),
                    ],
                  ),
                ),
              ),
              builder: (context, r) => SliverResponsivePadding(
                maxWidth: kMaxReadableWidth,
                sliver: SliverPadding(
                  padding: EdgeInsets.fromLTRB(context.pageGutter, AppSpacing.sm, context.pageGutter, AppSpacing.xxl),
                  sliver: SliverList.list(children: _report(context, r)),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  List<Widget> _report(BuildContext context, ChargingReport r) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final lang = context.languageCode;
    final currencies = r.currencies;
    final currency = currencies.contains(_currency) ? _currency : (currencies.isEmpty ? null : currencies.first);
    String monthShort(ReportMonth m) =>
        m.firstDay == null ? m.month : fmt.shapeDate(DateFormat.MMM(lang).format(m.firstDay!));
    String monthFull(ReportMonth m) =>
        m.firstDay == null ? m.month : fmt.shapeDate(DateFormat.yMMMM(lang).format(m.firstDay!));

    final spendPoints = <BarPoint>[
      for (final m in r.months)
        () {
          final money = m.spend.where((s) => s.currency == currency).firstOrNull;
          return (
            label: monthShort(m),
            fullLabel: monthFull(m),
            value: money?.value,
            valueText: money == null ? null : fmt.money(money.amount, money.currency),
          );
        }(),
    ];
    final energyPoints = <BarPoint>[
      for (final m in r.months)
        (
          label: monthShort(m),
          fullLabel: monthFull(m),
          value: m.sessions == 0 ? null : m.energyKwh,
          valueText: m.sessions == 0 ? null : fmt.energyKwh(m.energyKwh),
        ),
    ];

    return [
      StatTileRow(
        tiles: [
          StatTile(icon: Icons.bolt, label: l10n.chargingLogsTotalEnergy, value: fmt.energyKwh(r.energyKwh)),
          StatTile(icon: Icons.ev_station_outlined, label: l10n.chargingLogsSessions, value: fmt.number(r.sessions)),
          StatTile(
            icon: Icons.payments_outlined,
            label: l10n.chargingLogsTotalSpend,
            value: LogLabels.spend(fmt, r.spend),
          ),
          StatTile(
            icon: Icons.price_change_outlined,
            label: l10n.chargingLogsAvgPerKwh,
            value: LogLabels.spend(fmt, r.averageCostPerKwh),
          ),
        ],
      ),
      if (r.sessionsWithoutCost > 0) ...[
        const SizedBox(height: AppSpacing.md),
        InlineNotice(message: l10n.chargingLogsSessionsWithoutCost(r.sessionsWithoutCost)),
      ],
      if (currencies.length > 1) ...[
        const SizedBox(height: AppSpacing.md),
        InlineNotice(message: l10n.chargingLogsMixedCurrencies, tone: AppTone.warning),
      ],
      const SizedBox(height: AppSpacing.lg),
      SectionCard(
        title: l10n.chargingLogsMonthlySpend,
        icon: Icons.bar_chart,
        subtitle: currency == null ? null : l10n.chargingLogsInCurrency(currency),
        trailing: currencies.length > 1
            ? DropdownButton<String>(
                value: currency,
                underline: const SizedBox.shrink(),
                items: [for (final c in currencies) DropdownMenuItem(value: c, child: Text(c))],
                onChanged: (v) => setState(() => _currency = v),
              )
            : null,
        child: currency == null
            ? InlineNotice(message: l10n.chargingLogsNoSpendData)
            : Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  MonthlyBarChart(points: spendPoints, semanticsTitle: l10n.chargingLogsMonthlySpend),
                  ChartDataTable(points: spendPoints, title: l10n.chargingLogsShowTable),
                ],
              ),
      ),
      const SizedBox(height: AppSpacing.lg),
      SectionCard(
        title: l10n.chargingLogsMonthlyEnergy,
        icon: Icons.bolt,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            MonthlyBarChart(points: energyPoints, semanticsTitle: l10n.chargingLogsMonthlyEnergy),
            ChartDataTable(points: energyPoints, title: l10n.chargingLogsShowTable),
          ],
        ),
      ),
      const SizedBox(height: AppSpacing.lg),
      for (final v in r.vehicles) ...[_VehicleReportCard(v: v), const SizedBox(height: AppSpacing.lg)],
      if (r.byLocationType.isNotEmpty)
        SectionCard(
          title: l10n.chargingLogsByLocation,
          icon: Icons.place_outlined,
          child: Column(
            children: [
              for (final b in r.byLocationType)
                _ShareBar(
                  icon: LogLabels.locationIcon(b.type),
                  label: LogLabels.location(l10n, b.type),
                  valueText: '${fmt.energyKwh(b.energyKwh)} · ${l10n.chargingLogsSessionsCount(b.sessions)}',
                  fraction: r.energyKwh <= 0 ? 0 : b.energyKwh / r.energyKwh,
                ),
            ],
          ),
        ),
      if (r.notes.isNotEmpty) ...[
        const SizedBox(height: AppSpacing.lg),
        SectionCard(
          title: l10n.chargingLogsMethod,
          icon: Icons.functions,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final n in r.notes)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('•  '),
                      Expanded(child: Text(n)),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ],
    ];
  }
}

class _VehicleReportCard extends StatelessWidget {
  const _VehicleReportCard({required this.v});

  final ReportVehicle v;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    Widget figure(String label, IconData icon, bool ok, String? value, String? reason, {String? qualifier}) {
      return StatTile(
        icon: icon,
        label: label,
        value: ok ? value : null,
        qualifier: ok ? qualifier : LogLabels.reason(l10n, reason),
        tone: ok ? AppTone.brand : AppTone.neutral,
      );
    }

    final confidence = switch (v.consumptionConfidence) {
      'medium' => l10n.chargingLogsConfidenceMedium,
      'low' => l10n.chargingLogsConfidenceLow,
      _ => null,
    };
    return SectionCard(
      title: v.displayName,
      icon: Icons.directions_car_outlined,
      subtitle: l10n.chargingLogsVehicleSummary(v.sessions, fmt.energyKwh(v.energyKwh)!),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          StatTileRow(
            tiles: [
              figure(
                l10n.chargingLogsDistance,
                Icons.route_outlined,
                v.distance.ok,
                fmt.distanceKm(v.distance.value),
                v.distance.reason,
              ),
              figure(
                l10n.chargingLogsConsumption,
                Icons.speed,
                v.consumption.ok,
                fmt.consumptionKwhPer100Km(v.consumption.value),
                v.consumption.reason,
                qualifier: confidence,
              ),
              figure(
                l10n.chargingLogsCostPer100,
                Icons.payments_outlined,
                v.costPer100km.ok,
                v.costPer100km.value == null
                    ? null
                    : fmt.money(v.costPer100km.value!.amount, v.costPer100km.value!.currency),
                v.costPer100km.reason,
              ),
            ],
          ),
          if (LogLabels.spend(fmt, v.spend) case final spend?) ...[
            const SizedBox(height: AppSpacing.sm),
            InfoRow(label: l10n.chargingLogsTotalSpend, value: spend),
          ],
          if (v.consumption.ok && v.consumptionConfidence == 'low') ...[
            const SizedBox(height: AppSpacing.sm),
            InlineNotice(message: l10n.chargingLogsLowConfidenceHint, tone: AppTone.warning),
          ],
        ],
      ),
    );
  }
}

class _ShareBar extends StatelessWidget {
  const _ShareBar({required this.icon, required this.label, required this.valueText, required this.fraction});

  final IconData icon;
  final String label;
  final String valueText;
  final double fraction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fmt = AppFormatters.of(context);
    return Semantics(
      container: true,
      label: '$label: $valueText, ${fmt.percent(fraction * 100)}',
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(icon, size: 18, color: theme.colorScheme.primary),
                const SizedBox(width: AppSpacing.sm),
                Expanded(child: Text(label, style: theme.textTheme.bodyMedium)),
                Text(fmt.percent(fraction * 100) ?? '', style: theme.textTheme.labelLarge),
              ],
            ),
            const SizedBox(height: AppSpacing.xs),
            LinearProgressIndicator(value: fraction.clamp(0, 1), minHeight: 8, borderRadius: AppRadii.pill),
            const SizedBox(height: AppSpacing.xxs),
            Text(valueText, style: theme.textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}
