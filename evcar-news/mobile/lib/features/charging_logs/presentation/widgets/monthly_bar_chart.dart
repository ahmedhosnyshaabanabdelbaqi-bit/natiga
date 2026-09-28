import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../../../../shared/widgets/kit.dart';

/// One bar: label (e.g. "Aug") + value; `null` value = no data that month
/// (drawn as an empty slot, never as a zero bar).
typedef BarPoint = ({String label, String fullLabel, double? value, String? valueText});

/// Monthly bar chart with an accessible summary and an optional data table
/// (the figures are also readable without the chart: never colour/shape only).
///
/// Time runs in the reading direction: left → right in LTR, right → left in RTL.
class MonthlyBarChart extends StatelessWidget {
  const MonthlyBarChart({super.key, required this.points, required this.semanticsTitle, this.height = 200});

  final List<BarPoint> points;
  final String semanticsTitle;
  final double height;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final rtl = context.isRtl;
    final ordered = rtl ? points.reversed.toList() : points;
    final maxY = ordered.map((p) => p.value ?? 0).fold<double>(0, math.max);
    final top = maxY <= 0 ? 1.0 : maxY * 1.15;
    final summary = [
      semanticsTitle,
      for (final p in points) '${p.fullLabel}: ${p.valueText ?? context.l10n.commonNotAvailable}',
    ].join('. ');
    return Semantics(
      container: true,
      label: summary,
      excludeSemantics: true,
      child: SizedBox(
        height: height * MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 1.6),
        child: Directionality(
          textDirection: TextDirection.ltr,
          child: BarChart(
            duration: AppMotion.of(context, AppMotion.medium),
            BarChartData(
              maxY: top,
              minY: 0,
              alignment: BarChartAlignment.spaceAround,
              borderData: FlBorderData(show: false),
              gridData: FlGridData(
                drawVerticalLine: false,
                horizontalInterval: top / 4,
                getDrawingHorizontalLine: (_) =>
                    FlLine(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5), strokeWidth: 1),
              ),
              titlesData: FlTitlesData(
                leftTitles: const AxisTitles(),
                rightTitles: const AxisTitles(),
                topTitles: const AxisTitles(),
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    reservedSize: 28 * MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 1.6),
                    getTitlesWidget: (value, meta) {
                      final i = value.toInt();
                      if (i < 0 || i >= ordered.length) return const SizedBox.shrink();
                      return SideTitleWidget(
                        meta: meta,
                        child: Directionality(
                          textDirection: rtl ? TextDirection.rtl : TextDirection.ltr,
                          child: Text(ordered[i].label, style: theme.textTheme.labelSmall),
                        ),
                      );
                    },
                  ),
                ),
              ),
              barTouchData: BarTouchData(
                touchTooltipData: BarTouchTooltipData(
                  getTooltipColor: (_) => theme.colorScheme.inverseSurface,
                  fitInsideHorizontally: true,
                  fitInsideVertically: true,
                  maxContentWidth: 180,
                  getTooltipItem: (group, gi, rod, ri) {
                    final p = ordered[group.x];
                    return BarTooltipItem(
                      '${p.fullLabel}\n${p.valueText ?? context.l10n.commonNotAvailable}',
                      theme.textTheme.labelMedium!.copyWith(color: theme.colorScheme.onInverseSurface),
                      textDirection: rtl ? TextDirection.rtl : TextDirection.ltr,
                    );
                  },
                ),
              ),
              barGroups: [
                for (var i = 0; i < ordered.length; i++)
                  BarChartGroupData(
                    x: i,
                    barRods: [
                      BarChartRodData(
                        toY: ordered[i].value ?? 0,
                        width: ordered.length > 8 ? 12 : 20,
                        borderRadius: const BorderRadius.vertical(top: Radius.circular(6)),
                        gradient: ordered[i].value == null
                            ? null
                            // Non-directional: fl_chart paints without a TextDirection.
                            : LinearGradient(
                                colors: context.palette.accentGradient.colors,
                                begin: Alignment.bottomCenter,
                                end: Alignment.topCenter,
                              ),
                        color: ordered[i].value == null ? Colors.transparent : null,
                        backDrawRodData: BackgroundBarChartRodData(
                          show: true,
                          toY: top,
                          color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
                        ),
                      ),
                    ],
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The same figures as a small table (expandable under each chart).
class ChartDataTable extends StatelessWidget {
  const ChartDataTable({super.key, required this.points, required this.title});

  final List<BarPoint> points;
  final String title;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ExpansionTile(
      tilePadding: EdgeInsets.zero,
      childrenPadding: EdgeInsets.zero,
      title: Text(title, style: theme.textTheme.labelLarge),
      children: [
        for (final p in points)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxs),
            child: Row(
              children: [
                Expanded(child: Text(p.fullLabel, style: theme.textTheme.bodySmall)),
                ValueOrNotAvailable(
                  p.valueText,
                  style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
