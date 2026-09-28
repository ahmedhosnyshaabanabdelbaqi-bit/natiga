import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../shared/widgets/kit.dart';
import '../domain/recommendation_models.dart';
import 'widgets/recommendation_results.dart';

/// Recommendation wizard (`/recommendations`): budget → usage → needs →
/// priorities, then an explained ranking (weights, reasons, missing data) or
/// an honest "no decisive recommendation" (REQUIREMENTS §7).
class RecommendationsScreen extends ConsumerStatefulWidget {
  const RecommendationsScreen({super.key});

  @override
  ConsumerState<RecommendationsScreen> createState() => _RecommendationsScreenState();
}

class _RecommendationsScreenState extends ConsumerState<RecommendationsScreen> {
  static const _steps = 4;
  int _step = 0;

  final _budget = TextEditingController();
  double _dailyKm = 40;
  int _longTrips = 1;
  bool? _homeCharging;
  int _seats = 5;
  final Set<String> _bodyTypes = {};
  final Set<String> _powertrains = {...RecommendationInput.defaultPowertrains};
  bool _customWeights = false;
  final Map<RecFactor, double> _weights = {
    RecFactor.price: 3,
    RecFactor.range: 3,
    RecFactor.dcCharging: 1,
    RecFactor.acCharging: 1,
    RecFactor.efficiency: 1,
    RecFactor.space: 1,
    RecFactor.performance: 0.5,
  };

  /// The submitted answers (results are shown while non-null).
  RecommendationInput? _submitted;
  String? _budgetError;

  @override
  void dispose() {
    _budget.dispose();
    super.dispose();
  }

  double? get _budgetValue {
    final raw = _budget.text
        .replaceAll(RegExp(r'[,\s٬]'), '')
        .replaceAllMapped(RegExp('[٠-٩]'), (m) => '${m[0]!.codeUnitAt(0) - 0x0660}');
    final v = double.tryParse(raw);
    return v == null || v <= 0 ? null : v;
  }

  bool _validate(int step) {
    final l10n = context.l10n;
    switch (step) {
      case 0:
        final ok = _budgetValue != null;
        setState(() => _budgetError = ok ? null : l10n.compareRecBudgetError);
        return ok;
      case 1:
        if (_homeCharging == null) {
          showAppSnackBar(context, l10n.compareRecHomeChargingRequired, tone: AppTone.warning);
          return false;
        }
        return true;
      case 2:
        if (_powertrains.isEmpty) {
          showAppSnackBar(context, l10n.compareRecPowertrainRequired, tone: AppTone.warning);
          return false;
        }
        return true;
      case 3:
        if (_customWeights && !_weights.values.any((w) => w > 0)) {
          showAppSnackBar(context, l10n.compareRecWeightsAllZero, tone: AppTone.warning);
          return false;
        }
        return true;
    }
    return true;
  }

  void _next() {
    if (!_validate(_step)) return;
    if (_step < _steps - 1) {
      setState(() => _step++);
    } else {
      _submit();
    }
  }

  void _submit({Map<RecFactor, double>? weights}) {
    for (var i = 0; i < _steps; i++) {
      if (!_validate(i)) {
        setState(() => _step = i);
        return;
      }
    }
    setState(() {
      if (weights != null) {
        _customWeights = true;
        _weights
          ..clear()
          ..addAll(weights);
      }
      _submitted = RecommendationInput(
        budget: _budgetValue!,
        dailyKm: _dailyKm,
        longTripsPerMonth: _longTrips,
        homeCharging: _homeCharging!,
        seatsNeeded: _seats,
        bodyTypes: {..._bodyTypes},
        powertrains: {..._powertrains},
        weights: _customWeights ? Map.of(_weights) : null,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final submitted = _submitted;
    if (submitted != null) {
      return RecommendationResultsView(
        input: submitted,
        onEdit: () => setState(() {
          _submitted = null;
          _step = 0;
        }),
        onIgnoreFactor: (weights) => _submit(weights: weights),
      );
    }
    final gutter = context.pageGutter;
    final market = ref.watch(effectiveMarketProvider);
    final stepTitles = [
      l10n.compareRecStepBudget,
      l10n.compareRecStepUsage,
      l10n.compareRecStepNeeds,
      l10n.compareRecStepPriorities,
    ];
    return PopScope(
      canPop: _step == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) setState(() => _step--);
      },
      child: AppScaffold(
        title: l10n.compareRecommendationsTitle,
        bottomBar: SafeArea(
          top: false,
          child: Padding(
            padding: EdgeInsets.fromLTRB(gutter, AppSpacing.sm, gutter, AppSpacing.sm),
            child: Row(
              children: [
                if (_step > 0)
                  Expanded(
                    child: SecondaryButton(
                      label: l10n.compareRecBack,
                      icon: Icons.arrow_back,
                      expand: true,
                      onPressed: () => setState(() => _step--),
                    ),
                  ),
                if (_step > 0) const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: PrimaryButton(
                    label: _step == _steps - 1 ? l10n.compareRecShowResults : l10n.compareRecNext,
                    icon: _step == _steps - 1 ? Icons.auto_awesome : Icons.arrow_forward,
                    expand: true,
                    onPressed: _next,
                  ),
                ),
              ],
            ),
          ),
        ),
        body: ListView(
          padding: EdgeInsets.fromLTRB(gutter, AppSpacing.md, gutter, AppSpacing.xxl),
          children: [
            ResponsiveCenter(
              padding: EdgeInsets.zero,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Semantics(
                    liveRegion: true,
                    child: Text(
                      l10n.compareRecStepOf(_step + 1, _steps, stepTitles[_step]),
                      style: Theme.of(context).textTheme.labelLarge
                          ?.copyWith(color: Theme.of(context).colorScheme.primary),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  LinearProgressIndicator(value: (_step + 1) / _steps, borderRadius: AppRadii.pill),
                  const SizedBox(height: AppSpacing.lg),
                  AnimatedSwitcher(
                    duration: AppMotion.of(context, AppMotion.medium),
                    child: KeyedSubtree(
                      key: ValueKey(_step),
                      child: switch (_step) {
                        0 => _budgetStep(
                          context,
                          market.currency,
                          market.nameFor(ref.watch(effectiveLanguageProvider)),
                        ),
                        1 => _usageStep(context),
                        2 => _needsStep(context),
                        _ => _prioritiesStep(context),
                      },
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _stepHeader(BuildContext context, IconData icon, String title, String message) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.lg),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 32, color: theme.colorScheme.primary),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(
                  header: true,
                  child: Text(title, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(message, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _budgetStep(BuildContext context, String currency, String marketName) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _stepHeader(
          context,
          Icons.account_balance_wallet_outlined,
          l10n.compareRecBudgetTitle,
          l10n.compareRecBudgetMessage,
        ),
        TextField(
          controller: _budget,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9٠-٩.,٬ ]'))],
          textInputAction: TextInputAction.next,
          onSubmitted: (_) => _next(),
          onChanged: (_) {
            if (_budgetError != null) setState(() => _budgetError = null);
          },
          decoration: InputDecoration(
            labelText: l10n.compareRecBudgetLabel(fmt.currencySymbol(currency)),
            suffixText: fmt.currencySymbol(currency),
            errorText: _budgetError,
            helperText: l10n.compareRecBudgetHelper(marketName, currency),
            helperMaxLines: 3,
          ),
        ),
      ],
    );
  }

  Widget _usageStep(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _stepHeader(context, Icons.route_outlined, l10n.compareRecUsageTitle, l10n.compareRecUsageMessage),
        Text(l10n.compareRecDailyKm, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
        Text(fmt.distanceKm(_dailyKm)!, style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
        Slider(
          value: _dailyKm,
          max: 300,
          divisions: 60,
          label: fmt.distanceKm(_dailyKm),
          semanticFormatterCallback: (v) => fmt.distanceKm(v)!,
          onChanged: (v) => setState(() => _dailyKm = v),
        ),
        const SizedBox(height: AppSpacing.md),
        _Stepper(
          label: l10n.compareRecLongTrips,
          hint: l10n.compareRecLongTripsHint,
          value: _longTrips,
          min: 0,
          max: 30,
          onChanged: (v) => setState(() => _longTrips = v),
        ),
        const SizedBox(height: AppSpacing.lg),
        Text(l10n.compareRecHomeCharging, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: AppSpacing.sm),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [
            AppFilterChip(
              label: l10n.compareRecHomeChargingYes,
              icon: Icons.home_outlined,
              selected: _homeCharging == true,
              onSelected: (_) => setState(() => _homeCharging = true),
            ),
            AppFilterChip(
              label: l10n.compareRecHomeChargingNo,
              icon: Icons.ev_station_outlined,
              selected: _homeCharging == false,
              onSelected: (_) => setState(() => _homeCharging = false),
            ),
          ],
        ),
      ],
    );
  }

  Widget _needsStep(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _stepHeader(context, Icons.family_restroom_outlined, l10n.compareRecNeedsTitle, l10n.compareRecNeedsMessage),
        _Stepper(
          label: l10n.compareRecSeats,
          value: _seats,
          min: 1,
          max: 9,
          onChanged: (v) => setState(() => _seats = v),
        ),
        const SizedBox(height: AppSpacing.lg),
        Text(l10n.compareRecBodyTypes, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
        Text(
          _bodyTypes.isEmpty ? l10n.compareRecBodyTypesAny : l10n.compareRecBodyTypesSome(_bodyTypes.length),
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: AppSpacing.sm),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [
            for (final b in RecommendationInput.bodyTypeCodes)
              AppFilterChip(
                label: _bodyLabel(l10n, b),
                selected: _bodyTypes.contains(b),
                onSelected: (v) => setState(() => v ? _bodyTypes.add(b) : _bodyTypes.remove(b)),
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        Text(l10n.compareRecPowertrains, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
        Text(
          l10n.compareRecPowertrainsHint,
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: AppSpacing.sm),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [
            for (final p in RecommendationInput.allPowertrains)
              AppFilterChip(
                label: PowertrainPill.labelFor(l10n, Powertrain.fromApi(p)!),
                selected: _powertrains.contains(p),
                onSelected: (v) => setState(() => v ? _powertrains.add(p) : _powertrains.remove(p)),
              ),
          ],
        ),
      ],
    );
  }

  Widget _prioritiesStep(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _stepHeader(context, Icons.tune, l10n.compareRecPrioritiesTitle, l10n.compareRecPrioritiesMessage),
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          value: !_customWeights,
          onChanged: (v) => setState(() => _customWeights = !v),
          title: Text(l10n.compareRecSuggestedWeights),
          subtitle: Text(l10n.compareRecSuggestedWeightsHint),
        ),
        if (_customWeights)
          for (final f in RecFactor.values) ...[
            const SizedBox(height: AppSpacing.sm),
            Row(
              children: [
                Expanded(
                  child: Text(
                    factorLabel(l10n, f),
                    style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600),
                  ),
                ),
                Text(
                  _weights[f]! == 0 ? l10n.compareRecWeightIgnored : fmt.number(_weights[f], maxDecimals: 1)!,
                  style: theme.textTheme.titleSmall,
                ),
              ],
            ),
            Slider(
              value: _weights[f]!,
              max: 10,
              divisions: 20,
              label: fmt.number(_weights[f], maxDecimals: 1),
              semanticFormatterCallback: (v) =>
                  '${factorLabel(l10n, f)}: ${v == 0 ? l10n.compareRecWeightIgnored : fmt.number(v, maxDecimals: 1)}',
              onChanged: (v) => setState(() => _weights[f] = v),
            ),
          ],
      ],
    );
  }

  static String _bodyLabel(AppLocalizations l10n, String code) => switch (code) {
    'sedan' => l10n.compareBodySedan,
    'hatchback' => l10n.compareBodyHatchback,
    'suv' => l10n.compareBodySuv,
    'crossover' => l10n.compareBodyCrossover,
    'coupe' => l10n.compareBodyCoupe,
    'wagon' => l10n.compareBodyWagon,
    'pickup' => l10n.compareBodyPickup,
    'van' => l10n.compareBodyVan,
    'mpv' => l10n.compareBodyMpv,
    _ => code,
  };
}

/// Localized factor name for the wizard (results use the API's labels).
String factorLabel(AppLocalizations l10n, RecFactor f) => switch (f) {
  RecFactor.price => l10n.compareFactorPrice,
  RecFactor.range => l10n.compareFactorRange,
  RecFactor.dcCharging => l10n.compareFactorDc,
  RecFactor.acCharging => l10n.compareFactorAc,
  RecFactor.efficiency => l10n.compareFactorEfficiency,
  RecFactor.space => l10n.compareFactorSpace,
  RecFactor.performance => l10n.compareFactorPerformance,
};

/// − value + control with 48 dp buttons.
class _Stepper extends StatelessWidget {
  const _Stepper({
    required this.label,
    this.hint,
    required this.value,
    required this.min,
    required this.max,
    required this.onChanged,
  });

  final String label;
  final String? hint;
  final int value;
  final int min;
  final int max;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final fmt = AppFormatters.of(context);
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
              if (hint != null)
                Text(hint!, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            ],
          ),
        ),
        IconButton.outlined(
          tooltip: l10n.compareRecDecrease(label),
          onPressed: value > min ? () => onChanged(value - 1) : null,
          icon: const Icon(Icons.remove),
        ),
        Semantics(
          liveRegion: true,
          label: '$label: ${fmt.number(value)}',
          excludeSemantics: true,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minWidth: 44),
            child: Text(
              fmt.number(value)!,
              textAlign: TextAlign.center,
              style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
            ),
          ),
        ),
        IconButton.outlined(
          tooltip: l10n.compareRecIncrease(label),
          onPressed: value < max ? () => onChanged(value + 1) : null,
          icon: const Icon(Icons.add),
        ),
      ],
    );
  }
}
