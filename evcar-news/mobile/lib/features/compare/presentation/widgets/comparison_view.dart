import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../../core/links/external_links.dart';
import '../../../../shared/widgets/kit.dart';
import '../../domain/comparison_models.dart';
import 'compare_labels.dart';

/// How rows are laid out for the current width, car count and text size.
enum CompareLayout {
  /// One card per row; each car's value on its own line (narrow / big text).
  stacked,

  /// One card per row; cars side by side under the pinned car header.
  columns,

  /// Landscape / wide: a real table (row label + one column per car).
  table,
}

/// Picks the layout: table in landscape or on wide screens when every column
/// keeps a readable width; side-by-side columns when they fit; otherwise
/// stacked (never squeezed text at 200 %).
CompareLayout compareLayoutFor(BuildContext context, int cars) {
  final width = math.min(MediaQuery.sizeOf(context).width, kMaxContentWidth) - 2 * context.pageGutter;
  final scale = context.textScale.clamp(1.0, 2.0);
  final wide = context.isLandscape || MediaQuery.sizeOf(context).width >= 720;
  if (wide && width / (cars + 1.3) >= 104 * math.min(scale, 1.6)) return CompareLayout.table;
  if (width >= cars * 148 * math.min(scale, 1.5)) return CompareLayout.columns;
  return CompareLayout.stacked;
}

/// Flex of the row-label column in the table layout (value columns use 3).
const _labelFlex = 2;
const _valueFlex = 3;

/// The whole comparison as one sliver: pinned car names, notices, summary,
/// metric groups (filtered by [summaryView] / [differencesOnly]) and the
/// disclosure. Used by the Compare tab and the shared-comparison screen.
class ComparisonSliver extends StatelessWidget {
  const ComparisonSliver({
    super.key,
    required this.result,
    required this.summaryView,
    required this.differencesOnly,
    this.onCarTap,
    this.onShowAllRows,
  });

  final ComparisonData result;
  final bool summaryView;
  final bool differencesOnly;

  /// Tap on a car in the pinned header (e.g. car actions).
  final void Function(ComparisonCar car)? onCarTap;

  /// Shown in the "no differences" state to switch the filters off.
  final VoidCallback? onShowAllRows;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final layout = compareLayoutFor(context, result.cars.length);
    final groups = result.visibleGroups(summary: summaryView, differencesOnly: differencesOnly);
    final gutter = context.pageGutter;
    return SliverMainAxisGroup(
      slivers: [
        PinnedHeaderSliver(
          child: _CarsHeader(result: result, layout: layout, onCarTap: onCarTap),
        ),
        SliverPadding(
          padding: EdgeInsets.fromLTRB(gutter, AppSpacing.md, gutter, 0),
          sliver: SliverToBoxAdapter(
            child: ResponsiveCenter(
              maxWidth: kMaxContentWidth,
              padding: EdgeInsets.zero,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _Notices(result: result),
                  _SummaryCard(result: result),
                ],
              ),
            ),
          ),
        ),
        if (groups.isEmpty)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
              child: EmptyState(
                icon: Icons.filter_alt_off_outlined,
                title: l10n.compareNoRowsTitle,
                message: differencesOnly ? l10n.compareNoDifferencesMessage : l10n.compareNoRowsMessage,
                compact: true,
                actions: [
                  if (onShowAllRows != null)
                    StateAction(label: l10n.compareShowAllRows, onPressed: onShowAllRows!, icon: Icons.visibility),
                ],
              ),
            ),
          )
        else
          for (final g in groups)
            SliverPadding(
              padding: EdgeInsets.fromLTRB(gutter, AppSpacing.lg, gutter, 0),
              sliver: SliverToBoxAdapter(
                child: ResponsiveCenter(
                  maxWidth: kMaxContentWidth,
                  padding: EdgeInsets.zero,
                  child: _GroupSection(group: g, result: result, layout: layout),
                ),
              ),
            ),
        SliverPadding(
          padding: EdgeInsets.fromLTRB(gutter, AppSpacing.xl, gutter, AppSpacing.xxl),
          sliver: SliverToBoxAdapter(
            child: ResponsiveCenter(
              maxWidth: kMaxContentWidth,
              padding: EdgeInsets.zero,
              child: _Footer(result: result),
            ),
          ),
        ),
      ],
    );
  }
}

/// Numbered marker linking the header, the value rows and the summary.
class CarNumberBadge extends StatelessWidget {
  const CarNumberBadge({super.key, required this.number, this.size = 26});

  final int number;
  final double size;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final fmt = AppFormatters.of(context);
    return ExcludeSemantics(
      child: Container(
        constraints: BoxConstraints(minWidth: size, minHeight: size),
        alignment: Alignment.center,
        decoration: BoxDecoration(color: scheme.primary, shape: BoxShape.circle),
        child: Text(
          fmt.number(number)!,
          style: Theme.of(context).textTheme.labelMedium
              ?.copyWith(color: scheme.onPrimary, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Pinned header
// ---------------------------------------------------------------------------

class _CarsHeader extends StatelessWidget {
  const _CarsHeader({required this.result, required this.layout, this.onCarTap});

  final ComparisonData result;
  final CompareLayout layout;
  final void Function(ComparisonCar car)? onCarTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final gutter = context.pageGutter;
    final cars = result.cars;
    final l10n = context.l10n;

    Widget cell(ComparisonCar car, int i, {required bool expand}) {
      final content = _HeaderCarCell(car: car, number: i + 1, expand: expand);
      final tappable = onCarTap == null
          ? content
          : InkWell(borderRadius: BorderRadius.circular(AppRadii.sm), onTap: () => onCarTap!(car), child: content);
      return Semantics(
        header: true,
        label: l10n.compareCarNumbered(i + 1, '${car.title}, ${CompareLabels.carFacts(context, car)}'),
        button: onCarTap != null,
        excludeSemantics: true,
        child: tappable,
      );
    }

    final Widget row = switch (layout) {
      CompareLayout.stacked => SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: EdgeInsets.symmetric(horizontal: gutter),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (var i = 0; i < cars.length; i++) ...[
              if (i > 0) const SizedBox(width: AppSpacing.sm),
              ConstrainedBox(
                constraints: BoxConstraints(maxWidth: math.max(160, MediaQuery.sizeOf(context).width * 0.62)),
                child: cell(cars[i], i, expand: false),
              ),
            ],
          ],
        ),
      ),
      _ => Padding(
        padding: EdgeInsets.symmetric(horizontal: gutter),
        child: ResponsiveCenter(
          maxWidth: kMaxContentWidth,
          padding: EdgeInsets.zero,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (layout == CompareLayout.table)
                Expanded(
                  flex: _labelFlex,
                  child: Padding(
                    padding: const EdgeInsetsDirectional.only(end: AppSpacing.sm, top: 4),
                    child: Text(
                      l10n.compareHeaderSpec,
                      style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                  ),
                ),
              for (var i = 0; i < cars.length; i++)
                Expanded(
                  flex: _valueFlex,
                  child: Padding(
                    padding: const EdgeInsetsDirectional.only(end: AppSpacing.xs),
                    child: cell(cars[i], i, expand: true),
                  ),
                ),
            ],
          ),
        ),
      ),
    };

    return Material(
      color: theme.colorScheme.surface,
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: theme.colorScheme.outlineVariant)),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
          child: row,
        ),
      ),
    );
  }
}

class _HeaderCarCell extends StatelessWidget {
  const _HeaderCarCell({required this.car, required this.number, required this.expand});

  final ComparisonCar car;
  final int number;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final name = Text(
      car.shortName,
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
      style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
    );
    final facts = Text(
      CompareLabels.carFacts(context, car),
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
    );
    return Padding(
      padding: const EdgeInsets.all(4),
      child: Row(
        mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CarNumberBadge(number: number),
          const SizedBox(width: AppSpacing.sm),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                name,
                facts,
                if (car.isDemo) ...[const SizedBox(height: 2), const DemoBadge(dense: true)],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Notices + summary
// ---------------------------------------------------------------------------

class _Notices extends StatelessWidget {
  const _Notices({required this.result});

  final ComparisonData result;

  static IconData _icon(String code) => switch (code) {
    'MIXED_POWERTRAINS' => Icons.merge_type,
    'MIXED_MARKETS' => Icons.public,
    'NOT_OFFERED' => Icons.block,
    'DEMO_DATA' => Icons.science_outlined,
    _ => Icons.info_outline,
  };

  @override
  Widget build(BuildContext context) {
    final warnings = result.warnings;
    final l10n = context.l10n;
    if (warnings.isEmpty && !result.sponsored) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (result.sponsored)
            _NoticeTile(icon: Icons.campaign_outlined, text: l10n.compareSponsoredWarning, tone: AppTone.sponsored),
          for (final w in warnings)
            _NoticeTile(
              icon: _icon(w.code),
              text: w.message,
              tone: w.code == 'DEMO_DATA' ? AppTone.demo : AppTone.info,
            ),
        ],
      ),
    );
  }
}

class _NoticeTile extends StatelessWidget {
  const _NoticeTile({required this.icon, required this.text, required this.tone});

  final IconData icon;
  final String text;
  final AppTone tone;

  @override
  Widget build(BuildContext context) {
    final colors = context.palette.tone(tone);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(color: colors.container, borderRadius: BorderRadius.circular(AppRadii.md)),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 20, color: colors.onContainer),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(text, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: colors.onContainer)),
            ),
          ],
        ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.result});

  final ComparisonData result;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final theme = Theme.of(context);
    final s = result.summary;
    final wins = {for (final w in s.winsByCar) w.carKey: w.wins};
    String n(int? v) => v == null ? l10n.commonNotAvailable : fmt.number(v)!;
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.insights_outlined, color: theme.colorScheme.primary),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(
                    l10n.compareSummaryTitle,
                    style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          for (var i = 0; i < result.cars.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: MergeSemantics(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    CarNumberBadge(number: i + 1, size: 22),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Text(
                        result.cars[i].shortName,
                        style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Flexible(
                      child: Text(
                        wins.containsKey(result.cars[i].key)
                            ? l10n.compareRowsWon(wins[result.cars[i].key]!, fmt.number(wins[result.cars[i].key]!)!)
                            : l10n.compareRowsWonUnknown,
                        textAlign: TextAlign.end,
                        style: theme.textTheme.bodyMedium,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          const Divider(height: AppSpacing.xl),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              Pill(
                icon: Icons.emoji_events_outlined,
                label: l10n.compareDecidedRows(n(s.decidedMetrics), n(s.metricsTotal)),
                tone: AppTone.success,
                dense: true,
              ),
              if ((s.notComparableMetrics ?? 0) > 0)
                Pill(
                  icon: Icons.sync_problem_outlined,
                  label: l10n.compareNotComparableRows(n(s.notComparableMetrics)),
                  tone: AppTone.warning,
                  dense: true,
                ),
              if ((s.missingDataMetrics ?? 0) > 0)
                Pill(icon: Icons.help_outline, label: l10n.compareMissingRows(n(s.missingDataMetrics)), dense: true),
            ],
          ),
          if (s.note != null) ...[
            const SizedBox(height: AppSpacing.md),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline, size: 18, color: theme.colorScheme.onSurfaceVariant),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    s.note!,
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Groups and rows
// ---------------------------------------------------------------------------

class _GroupSection extends StatelessWidget {
  const _GroupSection({required this.group, required this.result, required this.layout});

  final MetricGroup group;
  final ComparisonData result;
  final CompareLayout layout;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final header = Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Row(
        children: [
          Icon(CompareLabels.groupIcon(group.key), color: theme.colorScheme.primary, size: 22),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Semantics(
              header: true,
              child: Text(group.label, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      ),
    );
    if (layout == CompareLayout.table) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          header,
          AppCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                for (var i = 0; i < group.metrics.length; i++) ...[
                  if (i > 0) const Divider(height: 1),
                  _TableRow(metric: group.metrics[i], result: result),
                ],
              ],
            ),
          ),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        header,
        for (final m in group.metrics)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: _MetricCard(metric: m, result: result, columns: layout == CompareLayout.columns),
          ),
      ],
    );
  }
}

/// Label, "better" direction and the comparability / outcome of a row.
class _MetricHead extends StatelessWidget {
  const _MetricHead({required this.metric, this.dense = false});

  final Metric metric;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final m = metric;
    final pills = <Widget>[
      if (m.outcome == Outcome.tie)
        Pill(icon: Icons.drag_handle, label: l10n.compareOutcomeTie, tone: AppTone.info, dense: true)
      else if (m.comparability != Comparability.comparable)
        Pill(
          icon: CompareLabels.comparabilityIcon(m.comparability),
          label: CompareLabels.comparability(l10n, m.comparability),
          tone: CompareLabels.comparabilityTone(m.comparability),
          dense: true,
        ),
      if (m.betterDirection != BetterDirection.none || m.comparability == Comparability.comparable)
        Semantics(
          label: CompareLabels.direction(l10n, m.betterDirection),
          excludeSemantics: true,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(CompareLabels.directionIcon(m.betterDirection), size: 14, color: theme.colorScheme.onSurfaceVariant),
              const SizedBox(width: 2),
              Flexible(
                child: Text(
                  CompareLabels.direction(l10n, m.betterDirection),
                  style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
              ),
            ],
          ),
        ),
    ];
    final basis = CompareLabels.condition(context, m.basis);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                m.label,
                style: (dense ? theme.textTheme.titleSmall : theme.textTheme.titleMedium)?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            if (m.description != null)
              IconButton(
                tooltip: l10n.compareAboutRow(m.label),
                visualDensity: VisualDensity.compact,
                icon: const Icon(Icons.info_outline, size: 20),
                onPressed: () => showAppBottomSheet<void>(
                  context: context,
                  title: m.label,
                  builder: (_) => Padding(
                    padding: const EdgeInsets.all(AppSpacing.lg),
                    child: Text(m.description!, style: theme.textTheme.bodyLarge),
                  ),
                ),
              ),
          ],
        ),
        if (basis.isNotEmpty)
          Text(
            l10n.compareComparedOn(basis.join(' · ')),
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        if (pills.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xs),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.xs,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: pills,
          ),
        ],
      ],
    );
  }
}

class _NoteLine extends StatelessWidget {
  const _NoteLine({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_outline, size: 16, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(width: AppSpacing.xs),
          Expanded(
            child: Text(text, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          ),
        ],
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.metric, required this.result, required this.columns});

  final Metric metric;
  final ComparisonData result;
  final bool columns;

  @override
  Widget build(BuildContext context) {
    final winners = metric.markedWinners;
    final cars = result.cars;
    Widget valueFor(int i, {required bool showCarName}) => ValueCell(
      metric: metric,
      car: cars[i],
      number: i + 1,
      value: metric.valueFor(cars[i].key),
      isWinner: winners.contains(cars[i].key),
      showCarName: showCarName,
      notAvailableLabel: result.notAvailableLabel,
    );
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _MetricHead(metric: metric),
          const SizedBox(height: AppSpacing.sm),
          if (columns)
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (var i = 0; i < cars.length; i++)
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsetsDirectional.only(end: AppSpacing.sm),
                      child: valueFor(i, showCarName: false),
                    ),
                  ),
              ],
            )
          else
            for (var i = 0; i < cars.length; i++) ...[
              if (i > 0) const Divider(height: AppSpacing.md),
              valueFor(i, showCarName: true),
            ],
          if (metric.comparabilityNote != null && metric.outcome != Outcome.winner)
            _NoteLine(text: metric.comparabilityNote!),
        ],
      ),
    );
  }
}

class _TableRow extends StatelessWidget {
  const _TableRow({required this.metric, required this.result});

  final Metric metric;
  final ComparisonData result;

  @override
  Widget build(BuildContext context) {
    final winners = metric.markedWinners;
    final cars = result.cars;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: _labelFlex,
            child: Padding(
              padding: const EdgeInsetsDirectional.only(end: AppSpacing.sm),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _MetricHead(metric: metric, dense: true),
                  if (metric.comparabilityNote != null && metric.outcome != Outcome.winner)
                    _NoteLine(text: metric.comparabilityNote!),
                ],
              ),
            ),
          ),
          for (var i = 0; i < cars.length; i++)
            Expanded(
              flex: _valueFlex,
              child: Padding(
                padding: const EdgeInsetsDirectional.only(end: AppSpacing.xs),
                child: ValueCell(
                  metric: metric,
                  car: cars[i],
                  number: i + 1,
                  value: metric.valueFor(cars[i].key),
                  isWinner: winners.contains(cars[i].key),
                  showCarName: false,
                  notAvailableLabel: result.notAvailableLabel,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// One car's value in a row: value + unit, measuring basis (cycle / SoC
/// window / charger), published original, reliability, winner marker (icon
/// + text, only when the API named a winner). Missing → "Not available".
class ValueCell extends StatelessWidget {
  const ValueCell({
    super.key,
    required this.metric,
    required this.car,
    required this.number,
    required this.value,
    required this.isWinner,
    required this.showCarName,
    this.notAvailableLabel,
  });

  final Metric metric;
  final ComparisonCar car;
  final int number;
  final MetricValue? value;
  final bool isWinner;
  final bool showCarName;
  final String? notAvailableLabel;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final v = value;
    final text = v == null ? null : CompareLabels.value(context, metric, v);
    final notApplicable = v?.status == ValueStatus.notApplicable;
    final conditions = v != null && v.isPresent ? CompareLabels.condition(context, v.condition) : const <String>[];
    final original = v != null && v.isPresent ? CompareLabels.original(context, v) : null;
    final reliability = v != null && v.isPresent ? CompareLabels.reliability(v.reliability) : null;
    final notAvailable = notAvailableLabel ?? l10n.commonNotAvailable;

    final valueStyle = theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700);
    final mutedStyle = theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final small = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);

    final Widget main;
    if (text != null) {
      main = Text(text, style: valueStyle);
    } else if (notApplicable) {
      main = Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.do_not_disturb_on_outlined, size: 16, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(width: 4),
          Flexible(child: Text(l10n.compareNotApplicable, style: mutedStyle)),
        ],
      );
    } else {
      main = Text(notAvailable, style: mutedStyle?.copyWith(fontStyle: FontStyle.italic));
    }

    final details = <Widget>[
      if (conditions.isNotEmpty) Text(conditions.join(' · '), style: small),
      if (original != null) Text(original, style: small),
      if (v != null && v.isPresent && v.derived) Text(l10n.compareDerived, style: small),
      if (v?.note != null) Text(v!.note!, style: small),
      if (v != null && v.alternatives.isNotEmpty)
        Text(l10n.compareAlternativesCount(v.alternatives.length), style: small),
    ];

    final semantics = [
      if (showCarName) l10n.compareCarNumbered(number, car.shortName),
      text ?? (notApplicable ? l10n.compareNotApplicable : notAvailable),
      ...conditions,
      ?original,
      if (reliability != null) l10n.commonReliabilityLabel(ReliabilityBadge.labelFor(l10n, reliability)),
      if (isWinner) l10n.compareBestInRow,
    ].join(', ');

    final body = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (showCarName)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CarNumberBadge(number: number, size: 20),
                const SizedBox(width: AppSpacing.xs),
                Expanded(
                  child: Text(
                    car.shortName,
                    style: theme.textTheme.labelLarge,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
        main,
        ...details,
        if (isWinner || reliability != null) ...[
          const SizedBox(height: 4),
          Wrap(
            spacing: AppSpacing.xs,
            runSpacing: 4,
            children: [
              if (isWinner)
                Pill(icon: Icons.emoji_events_outlined, label: l10n.compareBest, tone: AppTone.success, dense: true),
              if (reliability != null) ReliabilityBadge(reliability: reliability, dense: true),
            ],
          ),
        ],
      ],
    );

    final tappable = v != null && v.isPresent;
    return Semantics(
      label: semantics,
      button: tappable,
      hint: tappable ? l10n.compareValueDetailsHint : null,
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadii.sm),
        onTap: tappable ? () => showValueDetails(context, metric: metric, car: car, value: v) : null,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: kMinTouchTarget),
          child: Padding(padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 2), child: body),
        ),
      ),
    );
  }
}

/// Sheet with everything known about one value: canonical and published
/// value, measuring basis, reliability, source (tap to open), verification
/// date, derivation, note and alternatives (other cycles / windows).
Future<void> showValueDetails(
  BuildContext context, {
  required Metric metric,
  required ComparisonCar car,
  required MetricValue value,
}) {
  final l10n = context.l10n;
  return showAppBottomSheet<void>(
    context: context,
    title: metric.label,
    builder: (context) {
      final theme = Theme.of(context);
      final fmt = AppFormatters.of(context);
      final conditions = CompareLabels.condition(context, value.condition);
      final original = CompareLabels.original(context, value);
      final reliability = CompareLabels.reliability(value.reliability);
      final source = value.source;
      Widget line(String label, String text) => Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.md),
        child: MergeSemantics(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
              const SizedBox(height: 2),
              Text(text, style: theme.textTheme.bodyLarge),
            ],
          ),
        ),
      );
      return Padding(
        padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            line(l10n.compareDetailsCar, '${car.title} · ${CompareLabels.carFacts(context, car)}'),
            line(l10n.compareDetailsValue, CompareLabels.value(context, metric, value) ?? l10n.commonNotAvailable),
            if (conditions.isNotEmpty) line(l10n.compareDetailsBasis, conditions.join(' · ')),
            if (value.condition?.conditions != null) line(l10n.compareDetailsConditions, value.condition!.conditions!),
            ?(original == null ? null : line(l10n.compareDetailsPublished, original)),
            if (value.derived) line(l10n.compareDetailsDerivation, l10n.compareDerived),
            if (value.note != null) line(l10n.compareDetailsNote, value.note!),
            if (reliability != null)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: ReliabilityBadge(reliability: reliability),
                ),
              ),
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.md),
              child: SourceBadge(sourceName: source?.displayName, verifiedAt: value.verifiedAt),
            ),
            if (source != null && source.documentDate != null)
              line(l10n.compareDetailsDocumentDate, source.documentDate!),
            if (source?.url != null && source!.url!.startsWith('https://'))
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: OutlinedButton.icon(
                  onPressed: () => openExternalUrl(context, source.url!),
                  icon: const Icon(Icons.open_in_new),
                  label: Text(l10n.compareOpenSource),
                ),
              ),
            if (value.alternatives.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.md),
              Semantics(
                header: true,
                child: Text(
                  l10n.compareDetailsAlternatives,
                  style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                l10n.compareAlternativesExplainer,
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
              for (final a in value.alternatives)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.swap_horiz),
                  title: Text(CompareLabels.alternative(context, metric, a) ?? l10n.commonNotAvailable),
                  subtitle: Text(
                    [
                      ...CompareLabels.condition(context, a.condition),
                      if (CompareLabels.reliability(a.reliability) case final r?) ReliabilityBadge.labelFor(l10n, r),
                    ].join(' · '),
                  ),
                ),
            ],
            if (value.verifiedAt != null)
              Text(
                l10n.commonVerifiedOn(fmt.date(value.verifiedAt)!),
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
          ],
        ),
      );
    },
  );
}

// ---------------------------------------------------------------------------
// Footer: legend + disclosure
// ---------------------------------------------------------------------------

class _Footer extends StatelessWidget {
  const _Footer({required this.result});

  final ComparisonData result;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final fmt = AppFormatters.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton.icon(
            onPressed: () => showComparisonLegend(context, result),
            icon: const Icon(Icons.help_outline),
            label: Text(l10n.compareLegendButton),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.verified_outlined, size: 18, color: theme.colorScheme.onSurfaceVariant),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                result.disclosure ?? l10n.compareDisclosureFallback,
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
            ),
          ],
        ),
        if (result.generatedAt != null) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(
            l10n.compareGeneratedAt(fmt.dateTime(result.generatedAt!.toLocal()) ?? ''),
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ],
      ],
    );
  }
}

/// Explains every comparability label and the comparison rules.
Future<void> showComparisonLegend(BuildContext context, ComparisonData? result) {
  final l10n = context.l10n;
  return showAppBottomSheet<void>(
    context: context,
    title: l10n.compareLegendTitle,
    builder: (context) {
      final theme = Theme.of(context);
      final labels = {for (final e in result?.legend ?? const <LegendEntry>[]) e.status: e.label};
      return Padding(
        padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final c in Comparability.values.where((c) => c != Comparability.unknown))
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(CompareLabels.comparabilityIcon(c)),
                title: Text(labels[c] ?? CompareLabels.comparability(l10n, c)),
              ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.emoji_events_outlined),
              title: Text(l10n.compareBest),
              subtitle: Text(l10n.compareLegendBest),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.drag_handle),
              title: Text(l10n.compareOutcomeTie),
            ),
            const SizedBox(height: AppSpacing.md),
            Text(l10n.compareRulesText, style: theme.textTheme.bodyMedium),
          ],
        ),
      );
    },
  );
}
