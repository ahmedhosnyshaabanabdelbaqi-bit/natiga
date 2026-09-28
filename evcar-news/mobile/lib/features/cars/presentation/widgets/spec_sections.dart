import 'package:flutter/material.dart';

import '../../../../shared/widgets/kit.dart';
import '../../domain/catalog_models.dart';
import '../../domain/variant_sheet.dart';
import 'car_labels.dart';

/// Key figures of a trim (range with its cycle, battery, charging, power).
/// Tapping a figure that has a source opens the source details.
class KeyFactsGrid extends StatelessWidget {
  const KeyFactsGrid({super.key, required this.sheet});

  final VariantSheet sheet;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final k = sheet.keyFacts;
    final range = _preferredRange(
      sheet.keyFacts.electricRanges.isNotEmpty
          ? sheet.keyFacts.electricRanges
          : sheet.ranges.where((r) => r.rangeType == 'electric').toList(),
    );

    StatTile tile(IconData icon, String label, DataPoint? p, String? value, {String? qualifier}) => StatTile(
      icon: icon,
      label: label,
      value: value,
      qualifier: value == null ? null : qualifier,
      onTap: p?.provenance.source == null ? null : () => showSourceSheet(context, p!.provenance.source!, p.provenance),
    );

    return StatTileRow(
      minTileWidth: 150,
      tiles: [
        StatTile(
          icon: Icons.route_outlined,
          label: l10n.carsStatElectricRange,
          value: fmt.distanceKm(range?.valueKm),
          qualifier: range == null
              ? null
              : l10n.carsMeasuredCycle(CarLabels.cycle(l10n, range.cycle, note: range.cycleNote)),
          onTap: range?.provenance.source == null
              ? null
              : () => showSourceSheet(context, range!.provenance.source!, range.provenance),
        ),
        tile(
          Icons.battery_charging_full,
          l10n.carsStatUsableBattery,
          k.usableBatteryKwh,
          CarLabels.specValue(context, k.usableBatteryKwh, fallbackUnit: 'kWh'),
        ),
        if (sheet.isPlugIn) ...[
          tile(
            Icons.bolt,
            l10n.carsStatDcPeak,
            k.dcPeakKw,
            CarLabels.specValue(context, k.dcPeakKw, fallbackUnit: 'kW'),
          ),
          tile(
            Icons.power_outlined,
            l10n.carsStatAcMax,
            k.acMaxKw,
            CarLabels.specValue(context, k.acMaxKw, fallbackUnit: 'kW'),
          ),
        ],
        tile(
          Icons.speed,
          l10n.carsStatPower,
          k.powerKw,
          CarLabels.specValue(context, k.powerKw, fallbackUnit: 'kW'),
          qualifier: k.powerHp == null ? null : CarLabels.specValue(context, k.powerHp, fallbackUnit: 'hp'),
        ),
        tile(
          Icons.timer_outlined,
          l10n.carsStatAccel,
          k.accel0100S,
          CarLabels.specValue(context, k.accel0100S, fallbackUnit: 's'),
        ),
      ],
    );
  }

  static RangeEntry? _preferredRange(List<RangeEntry> ranges) {
    if (ranges.isEmpty) return null;
    const order = ['WLTP', 'EPA', 'CLTC', 'NEDC', 'OTHER'];
    final sorted = [...ranges]
      ..sort((a, b) {
        final ia = order.indexOf(a.cycle.toUpperCase());
        final ib = order.indexOf(b.cycle.toUpperCase());
        return (ia < 0 ? 99 : ia).compareTo(ib < 0 ? 99 : ib);
      });
    return sorted.first;
  }
}

/// Every published range, each with its test cycle (never converted or
/// merged). Electric and total range are separate rows.
class RangesCard extends StatelessWidget {
  const RangesCard({super.key, required this.sheet});

  final VariantSheet sheet;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final rows = <Widget>[
      for (final r in sheet.ranges)
        SpecRow(
          icon: r.rangeType == 'total' ? Icons.local_gas_station_outlined : Icons.bolt,
          label: CarLabels.rangeType(l10n, r.rangeType),
          value: fmt.distanceKm(r.valueKm),
          qualifier: CarLabels.cycle(l10n, r.cycle, note: r.cycleNote),
          note: [
            if (r.wheelSizeInch != null) l10n.carsWheelSize(CarLabels.numberWithUnit(context, r.wheelSizeInch, 'in')!),
            if (r.conditions != null && r.conditions!.trim().isNotEmpty) r.conditions!,
          ].join(' · '),
          reliability: reliabilityOf(r.provenance),
          source: specSourceOf(context, r.provenance),
        ),
      for (final c in sheet.consumption)
        SpecRow(
          icon: c.kind == 'fuel' ? Icons.local_gas_station_outlined : Icons.electric_meter_outlined,
          label: c.kind == 'fuel' ? l10n.carsConsumptionFuel : l10n.carsConsumptionElectric,
          value: CarLabels.numberWithUnit(context, c.value, c.unit),
          qualifier: [
            CarLabels.cycle(l10n, c.cycle, note: c.cycleNote),
            if (c.mode != null) _mode(l10n, c.mode!),
          ].join(' · '),
          note: c.conditions,
          reliability: reliabilityOf(c.provenance),
          source: specSourceOf(context, c.provenance),
        ),
    ];
    if (sheet.ranges.where((r) => r.rangeType == 'electric').isEmpty && sheet.powertrainType.toUpperCase() != 'HEV') {
      rows.insert(0, SpecRow(icon: Icons.bolt, label: l10n.commonRangeElectric, value: null));
    }
    return SpecGroup(
      title: l10n.carsRangeAndConsumption,
      icon: Icons.route_outlined,
      rows: rows,
      footer: Text(
        l10n.carsRangeCycleExplainer,
        style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
      ),
    );
  }

  static String _mode(AppLocalizations l10n, String mode) => switch (mode) {
    'combined' => l10n.carsModeCombined,
    'city' => l10n.carsModeCity,
    'highway' => l10n.carsModeHighway,
    _ => mode,
  };
}

/// All spec groups of the sheet. Portrait: collapsible cards of [SpecRow]s.
/// Landscape / wide screens: a compact table (spec · value · reliability ·
/// source) that is easier to scan.
class SpecGroupsView extends StatefulWidget {
  const SpecGroupsView({super.key, required this.groups, this.forceTable});

  final List<SpecGroupData> groups;

  /// Overrides the orientation-based choice (tests).
  final bool? forceTable;

  @override
  State<SpecGroupsView> createState() => _SpecGroupsViewState();
}

class _SpecGroupsViewState extends State<SpecGroupsView> {
  bool _onlyAvailable = false;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final table = widget.forceTable ?? (context.isLandscape || context.screenSize.width >= 720);
    final groups = [
      for (final g in widget.groups)
        if (!_onlyAvailable || g.availableCount > 0) g,
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          value: _onlyAvailable,
          onChanged: (v) => setState(() => _onlyAvailable = v),
          title: Text(l10n.carsSpecsOnlyAvailable),
          subtitle: Text(l10n.carsSpecsOnlyAvailableHint),
        ),
        const SizedBox(height: AppSpacing.sm),
        for (var i = 0; i < groups.length; i++) ...[
          if (i > 0) const SizedBox(height: AppSpacing.cardGap),
          if (table)
            _SpecTableCard(group: groups[i], onlyAvailable: _onlyAvailable)
          else
            SpecGroup(
              key: ValueKey('spec-group-${groups[i].key}'),
              title: groups[i].label,
              icon: CarLabels.groupIcon(groups[i].key),
              collapsible: true,
              initiallyExpanded: i < 3,
              rows: [
                for (final item in groups[i].items)
                  if (!_onlyAvailable || item.point != null) _row(context, item),
              ],
            ),
        ],
      ],
    );
  }

  Widget _row(BuildContext context, SpecItem item) {
    final p = item.point;
    return SpecRow(
      label: item.label,
      value: CarLabels.specValue(context, p, fallbackUnit: item.unit),
      note: [
        if (p != null && p.derived) context.l10n.carsDerivedValue,
        if (p != null && p.marketCode != null) context.l10n.carsMarketSpecific(p.marketCode!),
        if (item.description != null) item.description!,
      ].join(' · '),
      reliability: p == null ? null : reliabilityOf(p.provenance),
      source: p == null ? null : specSourceOf(context, p.provenance),
    );
  }
}

class _SpecTableCard extends StatelessWidget {
  const _SpecTableCard({required this.group, required this.onlyAvailable});

  final SpecGroupData group;
  final bool onlyAvailable;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = context.l10n;
    final items = [
      for (final i in group.items)
        if (!onlyAvailable || i.point != null) i,
    ];
    final headStyle = theme.textTheme.labelMedium?.copyWith(
      color: theme.colorScheme.onSurfaceVariant,
      fontWeight: FontWeight.w700,
    );
    Widget cell(Widget child) => Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm, horizontal: AppSpacing.sm),
      child: child,
    );
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(CarLabels.groupIcon(group.key), color: theme.colorScheme.primary),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(group.label, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Table(
            columnWidths: const {
              0: FlexColumnWidth(3),
              1: FlexColumnWidth(3),
              2: FlexColumnWidth(2),
              3: FlexColumnWidth(3),
            },
            defaultVerticalAlignment: TableCellVerticalAlignment.middle,
            border: TableBorder(
              horizontalInside: BorderSide(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.6)),
            ),
            children: [
              TableRow(
                children: [
                  cell(Text(l10n.carsTableSpec, style: headStyle)),
                  cell(Text(l10n.carsTableValue, style: headStyle)),
                  cell(Text(l10n.carsTableReliability, style: headStyle)),
                  cell(Text(l10n.carsTableSource, style: headStyle)),
                ],
              ),
              for (final item in items)
                TableRow(
                  children: [
                    cell(Text(item.label, style: theme.textTheme.bodyMedium)),
                    cell(
                      Semantics(
                        label:
                            '${item.label}: ${CarLabels.specValue(context, item.point, fallbackUnit: item.unit) ?? l10n.commonNotAvailable}',
                        excludeSemantics: true,
                        child: ValueOrNotAvailable(
                          CarLabels.specValue(context, item.point, fallbackUnit: item.unit),
                          style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                        ),
                      ),
                    ),
                    cell(
                      item.point == null || reliabilityOf(item.point!.provenance) == null
                          ? const SizedBox.shrink()
                          : Align(
                              alignment: AlignmentDirectional.centerStart,
                              child: ReliabilityBadge(reliability: reliabilityOf(item.point!.provenance)!, dense: true),
                            ),
                    ),
                    cell(
                      item.point == null
                          ? const SizedBox.shrink()
                          : Builder(
                              builder: (context) {
                                final src = specSourceOf(context, item.point!.provenance);
                                if (src == null) return const SizedBox.shrink();
                                return SourceBadge(
                                  sourceName: src.name,
                                  verifiedAt: src.verifiedAt,
                                  onTap: src.onTap,
                                  dense: true,
                                );
                              },
                            ),
                    ),
                  ],
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Explicit "what you are looking at" line: year · trim · powertrain · market.
class SelectionSummary extends StatelessWidget {
  const SelectionSummary({super.key, required this.sheet});

  final VariantSheet sheet;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final market = sheet.market;
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.xs,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Pill(
          label: CarLabels.year(AppFormatters.of(context), sheet.modelYear),
          icon: Icons.event_outlined,
          tone: AppTone.brand,
        ),
        if (Powertrain.fromApi(sheet.powertrainType) != null)
          PowertrainPill(powertrain: Powertrain.fromApi(sheet.powertrainType)!),
        Pill(label: market.name, icon: Icons.public, tone: AppTone.info),
        Pill(
          label: CarLabels.availability(l10n, market.offered ? market.availability : 'not_listed'),
          icon: CarLabels.availabilityIcon(market.offered ? market.availability : 'not_listed'),
          tone: CarLabels.availabilityTone(market.offered ? market.availability : 'not_listed'),
        ),
        if (sheet.driveType != null) Pill(label: CarLabels.driveType(l10n, sheet.driveType!)),
        if (sheet.seats != null) Pill(label: l10n.carsSeats(sheet.seats!), icon: Icons.event_seat_outlined),
        if (sheet.isDemo) const DemoBadge(),
        if (market.localName != null && market.localName!.trim().isNotEmpty)
          Text(
            l10n.carsLocalName(market.localName!),
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
      ],
    );
  }
}
