import 'package:flutter/material.dart';

import '../../../../shared/widgets/kit.dart';
import '../../../garage/common/personal_forms.dart';
import '../../../garage/common/personal_widgets.dart';
import '../../domain/calc_result.dart';

/// Renders a calculator result: headline figures, cost breakdown, then the
/// formula, every step, every assumption with where it came from, warnings,
/// confidence and the disclaimer (REQUIREMENTS §13: document every formula,
/// unit and assumption).
class CalcResultPanel extends StatelessWidget {
  const CalcResultPanel({super.key, required this.view});

  final CalcResultView view;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final fmt = AppFormatters.of(context);
    final priceDate = view.string('priceDate');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppCard(
          padding: EdgeInsets.zero,
          clip: true,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                decoration: BoxDecoration(gradient: context.palette.brandGradient),
                padding: const EdgeInsets.all(AppSpacing.lg),
                child: _Headline(view: view),
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
                        ConfidencePill(confidence: view.confidence),
                        Pill(
                          icon: view.computedOnDevice ? Icons.phone_android : Icons.cloud_done_outlined,
                          label: view.computedOnDevice ? l10n.calculatorsOnDevice : l10n.calculatorsOnServer,
                          dense: true,
                          outlined: true,
                        ),
                        if (view.vehicleName != null)
                          Pill(icon: Icons.directions_car_outlined, label: view.vehicleName!, dense: true, outlined: true),
                        if (view.result.containsKey('priceDate'))
                          Pill(
                            icon: Icons.event_outlined,
                            label: priceDate == null
                                ? l10n.calculatorsPriceDateMissing
                                : l10n.calculatorsPricesAsOf(fmt.date(parseIsoDate(priceDate)) ?? priceDate),
                            tone: priceDate == null ? AppTone.warning : AppTone.neutral,
                            dense: true,
                          ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.md),
                    ..._details(context),
                  ],
                ),
              ),
            ],
          ),
        ),
        if (view.warnings.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.md),
          for (final w in view.warnings)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: InlineNotice(message: w.message, tone: AppTone.warning),
            ),
        ],
        const SizedBox(height: AppSpacing.md),
        SectionCard(
          title: l10n.calculatorsHowCalculated,
          icon: Icons.functions,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(view.formula, style: theme.textTheme.bodyMedium),
              const SizedBox(height: AppSpacing.md),
              for (final s in view.steps) _StepRow(step: s),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        SectionCard(
          title: l10n.calculatorsAssumptions,
          icon: Icons.fact_check_outlined,
          subtitle: l10n.calculatorsAssumptionsHint,
          child: Column(children: [for (final a in view.assumptions) _AssumptionRow(a: a)]),
        ),
        const SizedBox(height: AppSpacing.md),
        Text(
          view.disclaimer,
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
      ],
    );
  }

  String? _money(AppFormatters fmt, String path) {
    final m = view.money(path);
    return m == null ? null : fmt.money(m.amount, m.currency);
  }

  /// Unit rates (per kWh, per km) keep up to 4 decimals (review 3).
  String? _rate(AppFormatters fmt, String path) {
    final m = view.money(path);
    return m == null ? null : fmt.rate(m.amount, m.currency);
  }

  List<Widget> _details(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    Widget row(String label, String? value) => InfoRow(label: label, value: value);
    Widget notIncluded(String label, String path) =>
        InfoRow(label: label, value: _money(fmt, path) ?? l10n.calculatorsNotIncluded);
    switch (view.calculator) {
      case 'charge-cost':
        return [
          row(l10n.calculatorsEnergyAdded, fmt.energyKwh(view.number('energyAddedKwh'))),
          row(l10n.calculatorsGridEnergy, fmt.energyKwh(view.number('gridEnergyKwh'))),
          row(l10n.calculatorsLosses, fmt.energyKwh(view.number('lossesKwh'))),
          const Divider(height: AppSpacing.xl),
          notIncluded(l10n.calculatorsCostEnergy, 'cost.energy'),
          notIncluded(l10n.calculatorsCostTime, 'cost.time'),
          notIncluded(l10n.calculatorsCostSession, 'cost.sessionFee'),
          notIncluded(l10n.calculatorsCostParking, 'cost.parking'),
          notIncluded(l10n.calculatorsCostIdle, 'cost.idle'),
          row(l10n.calculatorsCostPerKwhAdded, _rate(fmt, 'costPerKwhAdded')),
        ];
      case 'charge-time':
        return [
          row(l10n.calculatorsEnergyAdded, fmt.energyKwh(view.number('energyAddedKwh'))),
          row(l10n.calculatorsGridEnergy, fmt.energyKwh(view.number('gridEnergyKwh'))),
          row(l10n.calculatorsPower, fmt.powerKw(view.number('powerKw'))),
          row(l10n.calculatorsLimitingFactor, _limiting(l10n, view.string('limitingFactor'))),
        ];
      case 'cost-per-100km':
        return [
          row(l10n.calculatorsGridConsumption, fmt.consumptionKwhPer100Km(view.number('gridKwhPer100km'))),
          row(l10n.calculatorsPricePerKwh, _rate(fmt, 'pricePerKwh')),
          row(l10n.calculatorsCostPerKm, _rate(fmt, 'costPerKm')),
        ];
      case 'monthly-cost':
        return [
          row(l10n.calculatorsKmPerMonth, fmt.distanceKm(view.number('kmPerMonth'))),
          row(l10n.calculatorsKwhPerMonth, fmt.energyKwh(view.number('gridKwhPerMonth'))),
          row(l10n.calculatorsEnergyPerMonth, _money(fmt, 'energyCostPerMonth')),
          notIncluded(l10n.calculatorsFixedFees, 'fixedMonthlyFees'),
          row(l10n.calculatorsPerYear, _money(fmt, 'totalPerYear')),
          row(l10n.calculatorsCostPer100, _money(fmt, 'costPer100km')),
        ];
      case 'vs-fuel':
        return [
          row(l10n.calculatorsEvPer100, _money(fmt, 'evCostPer100km')),
          row(l10n.calculatorsFuelPer100, _money(fmt, 'fuelCostPer100km')),
          row(l10n.calculatorsSavingPercent, fmt.percent(view.number('savingPercent'), maxDecimals: 1)),
          if (view.raw('monthly') != null) ...[
            const Divider(height: AppSpacing.xl),
            row(l10n.calculatorsKmPerMonth, fmt.distanceKm(view.number('monthly.km'))),
            row(l10n.calculatorsEvPerMonth, _money(fmt, 'monthly.ev')),
            row(l10n.calculatorsFuelPerMonth, _money(fmt, 'monthly.fuel')),
            row(l10n.calculatorsDifferencePerMonth, _money(fmt, 'monthly.difference')),
            row(l10n.calculatorsDifferencePerYear, _money(fmt, 'yearlyDifference')),
          ],
        ];
      case 'tco':
        final hasFuel = view.raw('fuelCar') != null;
        Widget both(String label, String key) => _TcoRow(
          label: label,
          ev: key == 'perKm' ? _rate(fmt, 'ev.$key') : _money(fmt, 'ev.$key'),
          fuel: hasFuel ? (key == 'perKm' ? _rate(fmt, 'fuelCar.$key') : _money(fmt, 'fuelCar.$key')) : null,
          showFuel: hasFuel,
          notIncluded: l10n.calculatorsNotIncluded,
        );
        return [
          row(l10n.calculatorsTotalKm, fmt.distanceKm(view.number('totalKm'))),
          const Divider(height: AppSpacing.xl),
          if (hasFuel) _TcoHeader(ev: l10n.calculatorsEv, fuel: l10n.calculatorsFuelCar),
          both(l10n.calculatorsPurchase, 'purchase'),
          both(l10n.calculatorsIncentives, 'incentives'),
          both(l10n.calculatorsResidual, 'residualValue'),
          both(l10n.calculatorsEnergyCost, 'energy'),
          both(l10n.calculatorsInsurance, 'insurance'),
          both(l10n.calculatorsMaintenance, 'maintenance'),
          both(l10n.calculatorsFees, 'fees'),
          both(l10n.calculatorsOneOff, 'oneOff'),
          both(l10n.calculatorsNonEnergy, 'nonEnergy'),
          both(l10n.calculatorsTotal, 'total'),
          both(l10n.calculatorsPerKm, 'perKm'),
          both(l10n.calculatorsPerMonth, 'perMonth'),
        ];
    }
    return const [];
  }

  static String? _limiting(AppLocalizations l10n, String? f) => switch (f) {
    'vehicle' => l10n.calculatorsLimitVehicle,
    'station' => l10n.calculatorsLimitStation,
    'supply' => l10n.calculatorsLimitSupply,
    'curve' => l10n.calculatorsLimitCurve,
    _ => null,
  };
}

class _Headline extends StatelessWidget {
  const _Headline({required this.view});

  final CalcResultView view;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final theme = Theme.of(context);
    String? money(String p) {
      final m = view.money(p);
      return m == null ? null : fmt.money(m.amount, m.currency);
    }

    final (String label, String? value, String? sub) = switch (view.calculator) {
      'charge-cost' => (l10n.calculatorsTotalCost, money('cost.total'), fmt.energyKwh(view.number('gridEnergyKwh'))),
      'charge-time' => view.number('minutes') != null
          ? (l10n.calculatorsDuration, fmt.durationMinutes(view.number('minutes')), null)
          : (
              l10n.calculatorsDurationRange,
              view.number('minutesRange.low') == null
                  ? null
                  : '${fmt.durationMinutes(view.number('minutesRange.low'))} – ${fmt.durationMinutes(view.number('minutesRange.high'))}',
              l10n.calculatorsRoughEstimate,
            ),
      'cost-per-100km' => (l10n.calculatorsCostPer100, money('costPer100km'), null),
      'monthly-cost' => (l10n.calculatorsPerMonthTotal, money('totalPerMonth'), money('totalPerYear') == null ? null : l10n.calculatorsPerYearValue(money('totalPerYear')!)),
      'vs-fuel' => (l10n.calculatorsDifferencePer100, money('differencePer100km'), l10n.calculatorsDifferenceHint),
      'tco' => (
          l10n.calculatorsEvTotal,
          money('ev.total'),
          view.raw('difference') == null ? null : l10n.calculatorsTcoDifference(money('difference') ?? ''),
        ),
      _ => (l10n.calculatorsResult, null, null),
    };
    final onBrand = Colors.white;
    return Semantics(
      container: true,
      liveRegion: true,
      label: '$label: ${value ?? l10n.commonNotAvailable}${sub == null ? '' : ', $sub'}',
      excludeSemantics: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: theme.textTheme.labelLarge?.copyWith(color: onBrand.withValues(alpha: 0.9))),
          const SizedBox(height: AppSpacing.xs),
          Text(
            value ?? l10n.commonNotAvailable,
            style: theme.textTheme.headlineMedium?.copyWith(color: onBrand, fontWeight: FontWeight.w800),
          ),
          if (sub != null) ...[
            const SizedBox(height: AppSpacing.xxs),
            Text(sub, style: theme.textTheme.bodyMedium?.copyWith(color: onBrand.withValues(alpha: 0.9))),
          ],
        ],
      ),
    );
  }
}

class _TcoHeader extends StatelessWidget {
  const _TcoHeader({required this.ev, required this.fuel});

  final String ev;
  final String fuel;

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.labelLarge;
    return ExcludeSemantics(
      child: Row(
        children: [
          const Expanded(flex: 3, child: SizedBox.shrink()),
          Expanded(flex: 3, child: Text(ev, style: style, textAlign: TextAlign.end)),
          Expanded(flex: 3, child: Text(fuel, style: style, textAlign: TextAlign.end)),
        ],
      ),
    );
  }
}

class _TcoRow extends StatelessWidget {
  const _TcoRow({required this.label, required this.ev, required this.fuel, required this.showFuel, required this.notIncluded});

  final String label;
  final String? ev;
  final String? fuel;
  final bool showFuel;
  final String notIncluded;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (!showFuel) return InfoRow(label: label, value: ev ?? notIncluded);
    final large = MediaQuery.textScalerOf(context).scale(1) > 1.3;
    final children = [
      Text(label, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
      Text(ev ?? notIncluded, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
      Text(fuel ?? notIncluded, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
    ];
    return Semantics(
      container: true,
      label: '$label: ${ev ?? notIncluded} / ${fuel ?? notIncluded}',
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
        child: large
            ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: children)
            : Row(
                children: [
                  Expanded(flex: 3, child: children[0]),
                  Expanded(flex: 3, child: Align(alignment: AlignmentDirectional.centerEnd, child: children[1])),
                  Expanded(flex: 3, child: Align(alignment: AlignmentDirectional.centerEnd, child: children[2])),
                ],
              ),
      ),
    );
  }
}

class _StepRow extends StatelessWidget {
  const _StepRow({required this.step});

  final CalcStepView step;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(step.label, style: theme.textTheme.labelLarge),
          Container(
            margin: const EdgeInsets.only(top: AppSpacing.xxs),
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.xs),
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.6),
              borderRadius: BorderRadius.circular(AppRadii.sm),
            ),
            // Formulas read left-to-right in both languages.
            child: Text(step.expression, textDirection: TextDirection.ltr, style: theme.textTheme.bodySmall),
          ),
        ],
      ),
    );
  }
}

class _AssumptionRow extends StatelessWidget {
  const _AssumptionRow({required this.a});

  final CalcAssumptionView a;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final value = switch (a.value) {
      null => null,
      true => l10n.calculatorsYes,
      false => l10n.calculatorsNo,
      final v => a.unit == null ? '$v' : '$v ${a.unit}',
    };
    final (AppTone tone, IconData icon, String label) = switch (a.origin) {
      'default' => (AppTone.warning, Icons.tune, l10n.calculatorsOriginDefault),
      'catalog' => (AppTone.info, Icons.menu_book_outlined, l10n.calculatorsOriginCatalog),
      'reference_price' => (AppTone.brand, Icons.receipt_outlined, l10n.calculatorsOriginReference),
      _ => (AppTone.neutral, Icons.edit_outlined, l10n.calculatorsOriginUser),
    };
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.xxs,
            crossAxisAlignment: WrapCrossAlignment.center,
            alignment: WrapAlignment.spaceBetween,
            children: [
              Text(a.label, style: theme.textTheme.bodyMedium),
              ValueOrNotAvailable(value, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
              Pill(label: label, icon: icon, tone: tone, dense: true),
            ],
          ),
          if (a.note != null && a.note!.isNotEmpty)
            Text(a.note!, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        ],
      ),
    );
  }
}

/// Confidence as icon + text.
class ConfidencePill extends StatelessWidget {
  const ConfidencePill({super.key, required this.confidence});

  final String confidence;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final (AppTone tone, IconData icon, String label) = switch (confidence) {
      'high' => (AppTone.success, Icons.verified_outlined, l10n.calculatorsConfidenceHigh),
      'medium' => (AppTone.info, Icons.adjust, l10n.calculatorsConfidenceMedium),
      _ => (AppTone.warning, Icons.help_outline, l10n.calculatorsConfidenceLow),
    };
    return Pill(label: label, icon: icon, tone: tone, dense: true);
  }
}
