import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../../../../shared/widgets/kit.dart';
import '../../domain/variant_sheet.dart';
import 'car_labels.dart';

/// Charging data of a trim: inlets (of the chosen market) with max power,
/// charging times ALWAYS with their SoC window and charger power, and the
/// charging curve chart. Hybrids without a plug get an explicit note.
class ChargingSection extends StatelessWidget {
  const ChargingSection({super.key, required this.sheet});

  final VariantSheet sheet;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    if (!sheet.isPlugIn) {
      return AppCard(
        child: Row(
          children: [
            Icon(Icons.info_outline, color: Theme.of(context).colorScheme.onSurfaceVariant),
            const SizedBox(width: AppSpacing.md),
            Expanded(child: Text(l10n.carsChargingNotPlugIn)),
          ],
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SpecGroup(
          title: l10n.carsChargingInlets,
          icon: Icons.power_outlined,
          rows: [
            if (sheet.inlets.isEmpty)
              SpecRow(
                label: l10n.carsChargingInlets,
                value: null,
                note: sheet.market.offered ? null : l10n.carsInletsNeedMarket(sheet.market.name),
              ),
            for (final i in sheet.inlets)
              SpecRow(
                icon: i.currentType.toUpperCase() == 'DC' ? Icons.bolt : Icons.power_outlined,
                label: '${i.connectorName} · ${CarLabels.currentType(l10n, i.currentType)}',
                value: fmt.powerKw(i.maxPowerKw) == null ? null : l10n.carsMaxPower(fmt.powerKw(i.maxPowerKw)!),
                note: i.notes,
                reliability: reliabilityOf(i.provenance),
                source: specSourceOf(context, i.provenance),
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.cardGap),
        SpecGroup(
          title: l10n.carsChargingTimes,
          icon: Icons.timer_outlined,
          rows: [
            if (sheet.chargingTimes.isEmpty) SpecRow(label: l10n.carsChargingTimes, value: null),
            for (final t in sheet.chargingTimes)
              SpecRow(
                icon: t.currentType.toUpperCase() == 'DC' ? Icons.bolt : Icons.power_outlined,
                label: l10n.carsChargingTimeLabel(
                  CarLabels.currentType(l10n, t.currentType),
                  CarLabels.socWindow(fmt, t.fromSoc, t.toSoc),
                ),
                value: fmt.durationMinutes(t.durationMinutes),
                qualifier: CarLabels.socWindow(fmt, t.fromSoc, t.toSoc),
                note: [
                  if (t.chargerPowerKw != null) l10n.carsOnCharger(fmt.powerKw(t.chargerPowerKw)!),
                  if (t.peakPowerKw != null) l10n.carsPeakPower(fmt.powerKw(t.peakPowerKw)!),
                  if (t.averagePowerKw != null) l10n.carsAveragePower(fmt.powerKw(t.averagePowerKw)!),
                  if (t.onboardChargerLimitKw != null) l10n.carsOnboardLimit(fmt.powerKw(t.onboardChargerLimitKw)!),
                  if (t.conditions != null && t.conditions!.trim().isNotEmpty) t.conditions!,
                ].join(' · '),
                reliability: reliabilityOf(t.provenance),
                source: specSourceOf(context, t.provenance),
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.cardGap),
        if (sheet.chargingCurves.isEmpty)
          SpecGroup(
            title: l10n.carsChargingCurve,
            icon: Icons.show_chart,
            rows: [SpecRow(label: l10n.carsChargingCurve, value: null)],
          )
        else
          for (final c in sheet.chargingCurves) ...[
            ChargingCurveCard(curve: c),
            const SizedBox(height: AppSpacing.cardGap),
          ],
      ],
    );
  }
}

/// Charging curve (power vs. state of charge) drawn with fl_chart, with a
/// text summary for screen readers and an optional data table (so the
/// information never depends on the drawing alone).
class ChargingCurveCard extends StatefulWidget {
  const ChargingCurveCard({super.key, required this.curve});

  final ChargingCurve curve;

  @override
  State<ChargingCurveCard> createState() => _ChargingCurveCardState();
}

class _ChargingCurveCardState extends State<ChargingCurveCard> {
  bool _showTable = false;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final theme = Theme.of(context);
    final c = widget.curve;
    final points = c.points;
    final peak = c.peakPowerKw ?? (points.isEmpty ? null : points.map((p) => p.powerKw).reduce(math.max));
    final conditions = [
      if (c.chargerMaxPowerKw != null) l10n.carsOnCharger(fmt.powerKw(c.chargerMaxPowerKw)!),
      if (c.batteryTempC != null) l10n.carsBatteryTemp(fmt.number(c.batteryTempC, maxDecimals: 0)!),
      if (c.preconditioned == true) l10n.carsPreconditioned,
      if (c.preconditioned == false) l10n.carsNotPreconditioned,
      if (c.conditions != null && c.conditions!.trim().isNotEmpty) c.conditions!,
    ];
    final summary = points.length < 2
        ? l10n.commonNotAvailable
        : l10n.carsCurveSummary(
            CarLabels.currentType(l10n, c.currentType),
            fmt.powerKw(peak)!,
            fmt.percent(points.first.socPercent)!,
            fmt.percent(points.last.socPercent)!,
          );
    final reliability = reliabilityOf(c.provenance);
    final source = specSourceOf(context, c.provenance);

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(Icons.show_chart, color: theme.colorScheme.primary),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(
                    c.label ?? l10n.carsChargingCurve,
                    style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Flexible(
                child: Pill(label: CarLabels.currentType(l10n, c.currentType), tone: AppTone.info, dense: true),
              ),
            ],
          ),
          if (conditions.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              conditions.join(' · '),
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          if (points.length < 2)
            NotAvailableValue(style: theme.textTheme.bodyMedium)
          else
            Semantics(
              label: summary,
              excludeSemantics: true,
              child: AspectRatio(
                aspectRatio: context.isLandscape ? 2.6 : 1.6,
                // Axes read left→right (0 → 100 %) in both languages.
                child: Directionality(
                  textDirection: TextDirection.ltr,
                  child: _CurveChart(points: points, peak: peak?.toDouble() ?? 0),
                ),
              ),
            ),
          const SizedBox(height: AppSpacing.sm),
          Text(summary, style: theme.textTheme.bodyMedium),
          if (points.length >= 2)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton.icon(
                onPressed: () => setState(() => _showTable = !_showTable),
                icon: Icon(_showTable ? Icons.expand_less : Icons.table_rows_outlined),
                label: Text(_showTable ? l10n.carsCurveHideTable : l10n.carsCurveShowTable),
              ),
            ),
          if (_showTable)
            Table(
              border: TableBorder(horizontalInside: BorderSide(color: theme.colorScheme.outlineVariant)),
              children: [
                TableRow(
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(AppSpacing.xs),
                      child: Text(l10n.carsCurveSoc, style: theme.textTheme.labelMedium),
                    ),
                    Padding(
                      padding: const EdgeInsets.all(AppSpacing.xs),
                      child: Text(l10n.carsCurvePower, style: theme.textTheme.labelMedium),
                    ),
                  ],
                ),
                for (final p in points)
                  TableRow(
                    children: [
                      Padding(padding: const EdgeInsets.all(AppSpacing.xs), child: Text(fmt.percent(p.socPercent)!)),
                      Padding(padding: const EdgeInsets.all(AppSpacing.xs), child: Text(fmt.powerKw(p.powerKw)!)),
                    ],
                  ),
              ],
            ),
          if (reliability != null || source != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: 2,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                if (reliability != null) ReliabilityBadge(reliability: reliability, dense: true),
                if (source != null)
                  SourceBadge(sourceName: source.name, verifiedAt: source.verifiedAt, onTap: source.onTap, dense: true),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _CurveChart extends StatelessWidget {
  const _CurveChart({required this.points, required this.peak});

  final List<CurvePoint> points;
  final double peak;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fmt = AppFormatters.of(context);
    final scheme = theme.colorScheme;
    final maxY = peak <= 0 ? 10.0 : (peak * 1.15 / 10).ceil() * 10.0;
    final labelStyle = theme.textTheme.labelSmall?.copyWith(color: scheme.onSurfaceVariant);
    final grid = scheme.outlineVariant.withValues(alpha: 0.5);
    return LayoutBuilder(
      builder: (context, constraints) {
        // Fewer SoC labels on narrow charts so they never collide.
        final xInterval = constraints.maxWidth < 300 ? 50.0 : (constraints.maxWidth < 440 ? 25.0 : 20.0);
        return LineChart(
          duration: AppMotion.of(context, AppMotion.medium),
          LineChartData(
            minX: 0,
            maxX: 100,
            minY: 0,
            maxY: maxY,
            gridData: FlGridData(
              drawVerticalLine: true,
              verticalInterval: xInterval,
              horizontalInterval: maxY / 4,
              getDrawingHorizontalLine: (_) => FlLine(color: grid, strokeWidth: 1),
              getDrawingVerticalLine: (_) => FlLine(color: grid, strokeWidth: 1, dashArray: [4, 4]),
            ),
            borderData: FlBorderData(show: false),
            titlesData: FlTitlesData(
              topTitles: const AxisTitles(),
              rightTitles: const AxisTitles(),
              bottomTitles: AxisTitles(
                sideTitles: SideTitles(
                  showTitles: true,
                  interval: xInterval,
                  reservedSize: 28,
                  getTitlesWidget: (v, meta) => SideTitleWidget(
                    meta: meta,
                    child: Text(fmt.percent(v)!, style: labelStyle, textScaler: TextScaler.noScaling),
                  ),
                ),
              ),
              leftTitles: AxisTitles(
                sideTitles: SideTitles(
                  showTitles: true,
                  interval: maxY / 4,
                  reservedSize: 44,
                  getTitlesWidget: (v, meta) => SideTitleWidget(
                    meta: meta,
                    child: Text(fmt.number(v, maxDecimals: 0)!, style: labelStyle, textScaler: TextScaler.noScaling),
                  ),
                ),
              ),
            ),
            lineTouchData: LineTouchData(
              touchTooltipData: LineTouchTooltipData(
                getTooltipColor: (_) => scheme.inverseSurface,
                getTooltipItems: (spots) => [
                  for (final s in spots)
                    LineTooltipItem(
                      '${fmt.percent(s.x)} · ${fmt.powerKw(s.y)}',
                      TextStyle(color: scheme.onInverseSurface, fontWeight: FontWeight.w600),
                    ),
                ],
              ),
            ),
            lineBarsData: [
              LineChartBarData(
                spots: [for (final p in points) FlSpot(p.socPercent, p.powerKw)],
                isCurved: true,
                preventCurveOverShooting: true,
                barWidth: 3,
                // fl_chart builds the shader without a TextDirection, so the
                // (directional) brand gradient is restated left → right.
                gradient: LinearGradient(colors: context.palette.brandGradient.colors),
                dotData: FlDotData(
                  getDotPainter: (spot, _, _, _) => FlDotCirclePainter(
                    radius: 3.5,
                    color: scheme.surface,
                    strokeWidth: 2.5,
                    strokeColor: scheme.primary,
                  ),
                ),
                belowBarData: BarAreaData(
                  show: true,
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [scheme.primary.withValues(alpha: 0.22), scheme.primary.withValues(alpha: 0.0)],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
