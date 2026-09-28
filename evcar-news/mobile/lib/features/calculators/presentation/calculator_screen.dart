import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../app/router/app_routes.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/app_config/app_config_controller.dart';
import '../../../core/errors/app_errors.dart';
import '../../../shared/widgets/kit.dart';
import '../../auth/domain/auth_state.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../garage/application/garage_providers.dart';
import '../../garage/common/personal_forms.dart';
import '../../garage/common/personal_widgets.dart';
import '../../garage/domain/user_vehicle.dart';
import '../../garage/presentation/widgets/variant_picker.dart';
import '../application/calculator_runner.dart';
import '../data/calculators_repository.dart';
import '../domain/calc_result.dart';
import 'calculators_screen.dart';
import 'widgets/calc_result_view.dart';

/// One field of a calculator form (dotted request key).
class _F {
  const _F(this.key, this.label, {this.unit, this.helper, this.refUnit, this.decimal = true});

  final String key;
  final String label;
  final String? unit;
  final String? helper;

  /// `per_kwh` / `per_liter` when a reference price may fill it.
  final String? refUnit;
  final bool decimal;
}

/// Which car fills missing values from the catalog (server-side).
sealed class _CarChoice {
  const _CarChoice(this.label);

  final String label;
}

class _GarageCar extends _CarChoice {
  const _GarageCar(this.id, super.label);

  final String id;
}

class _CatalogTrim extends _CarChoice {
  const _CatalogTrim(this.id, super.label);

  final String id;
}

/// One calculator (`/calculators/:kind`, see [CalculatorKinds]). Computes on
/// the phone with the same formulas as the server (works offline); when a
/// car is chosen the server fills missing values from the catalog.
class CalculatorScreen extends ConsumerStatefulWidget {
  const CalculatorScreen({super.key, required this.kind});

  final String kind;

  @override
  ConsumerState<CalculatorScreen> createState() => _CalculatorScreenState();
}

class _CalculatorScreenState extends ConsumerState<CalculatorScreen> {
  final _controllers = <String, TextEditingController>{};
  final _resultKey = GlobalKey();

  // Mode switches.
  bool _energyDirect = false; // charge-cost: energy entered instead of battery + SoC
  String _energyBasis = 'battery';
  String _currentType = 'AC';
  String? _phases; // null | '1' | '3'
  String _consumptionBasis = 'grid';
  bool _perDay = false;
  bool _withFuelCar = true;

  String? _currency;
  DateTime? _priceDate;
  final _refs = <String, ReferencePrice>{};
  _CarChoice? _car;

  bool _busy = false;
  CalcResultView? _result;
  Map<String, String> _errors = const {};

  String? get _apiKind => calculatorApiKinds[widget.kind];

  TextEditingController _c(String key) => _controllers.putIfAbsent(key, TextEditingController.new);

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  // ---------------------------------------------------------------------------------------
  // Form definition
  // ---------------------------------------------------------------------------------------

  bool get _hasPrices => _apiKind != 'charge-time';

  List<(String title, IconData icon, List<_F> fields)> _sections(AppLocalizations l10n, AppFormatters fmt) {
    final kwh = fmt.unitLabel(Unit.kWh);
    final kw = fmt.unitLabel(Unit.kW);
    final km = fmt.unitLabel(Unit.km);
    final min = fmt.unitLabel(Unit.minutes);
    final cur = _currency ?? '';
    final battery = [
      _F('batteryUsableKwh', l10n.calculatorsFieldUsable, unit: kwh, helper: _car != null ? l10n.calculatorsFromCarHint : null),
      _F('fromSocPercent', l10n.calculatorsFieldFromSoc, unit: '%'),
      _F('toSocPercent', l10n.calculatorsFieldToSoc, unit: '%'),
    ];
    final efficiency = _F('efficiency', l10n.calculatorsFieldEfficiency, helper: l10n.calculatorsEfficiencyHint);
    final consumption = [
      _F(
        'consumptionKwhPer100km',
        l10n.calculatorsFieldConsumption,
        unit: fmt.unitLabel(Unit.kWhPer100Km),
        helper: _car != null ? l10n.calculatorsFromCarHint : l10n.calculatorsConsumptionHint,
      ),
      if (_consumptionBasis == 'battery') efficiency,
    ];
    final electricityPrices = [
      _F('electricityPricePerKwh', l10n.calculatorsFieldElectricityPrice, unit: '$cur/$kwh', refUnit: 'per_kwh'),
      _F('publicPricePerKwh', l10n.calculatorsFieldPublicPrice, unit: '$cur/$kwh', refUnit: 'per_kwh'),
      _F('publicSharePercent', l10n.calculatorsFieldPublicShare, unit: '%'),
    ];
    final distance = _perDay
        ? _F('kmPerDay', l10n.calculatorsFieldKmPerDay, unit: km)
        : _F('kmPerMonth', l10n.calculatorsFieldKmPerMonth, unit: km);
    List<_F> costs(String prefix) => [
      _F('$prefix.purchasePrice', l10n.calculatorsFieldPurchase, unit: cur),
      _F('$prefix.incentives', l10n.calculatorsFieldIncentives, unit: cur),
      _F('$prefix.residualValue', l10n.calculatorsFieldResidual, unit: cur),
      _F('$prefix.insurancePerYear', l10n.calculatorsFieldInsurance, unit: cur),
      _F('$prefix.maintenancePerYear', l10n.calculatorsFieldMaintenance, unit: cur),
      _F('$prefix.feesPerYear', l10n.calculatorsFieldFees, unit: cur),
      _F('$prefix.oneOffCosts', l10n.calculatorsFieldOneOff, unit: cur, helper: l10n.calculatorsOneOffHint),
    ];

    switch (widget.kind) {
      case CalculatorKinds.homeCharging:
      case CalculatorKinds.publicCharging:
        final public = widget.kind == CalculatorKinds.publicCharging;
        return [
          (
            l10n.calculatorsSectionEnergy,
            Icons.battery_charging_full,
            [
              if (_energyDirect) _F('energyKwh', l10n.calculatorsFieldEnergy, unit: kwh) else ...battery,
              if (!(_energyDirect && _energyBasis == 'grid')) efficiency,
            ],
          ),
          (
            l10n.calculatorsSectionTariff,
            Icons.payments_outlined,
            [
              _F(
                'tariff.energyPerKwh',
                public ? l10n.calculatorsFieldPublicEnergyPrice : l10n.calculatorsFieldHomePrice,
                unit: '$cur/$kwh',
                refUnit: 'per_kwh',
              ),
              if (public) ...[
                _F('tariff.timePerMinute', l10n.calculatorsFieldTimePrice, unit: '$cur/$min'),
                _F('tariff.sessionFee', l10n.calculatorsFieldSessionFee, unit: cur),
                _F('tariff.parkingPerHour', l10n.calculatorsFieldParkingPerHour, unit: cur),
                _F('tariff.parkingFlat', l10n.calculatorsFieldParkingFlat, unit: cur),
                _F('tariff.idlePerMinute', l10n.calculatorsFieldIdlePrice, unit: '$cur/$min'),
                _F('tariff.idleGraceMinutes', l10n.calculatorsFieldIdleGrace, unit: min),
              ],
            ],
          ),
          if (public)
            (
              l10n.calculatorsSectionDurations,
              Icons.timer_outlined,
              [
                _F('chargingMinutes', l10n.calculatorsFieldChargingMinutes, unit: min),
                _F('parkingMinutes', l10n.calculatorsFieldParkingMinutes, unit: min),
                _F('idleMinutes', l10n.calculatorsFieldIdleMinutes, unit: min),
              ],
            ),
        ];
      case CalculatorKinds.chargingTime:
        return [
          (l10n.calculatorsSectionEnergy, Icons.battery_charging_full, [...battery, efficiency]),
          (
            l10n.calculatorsSectionPower,
            Icons.electric_bolt,
            _currentType == 'AC'
                ? [
                    _F('vehicleAcMaxKw', l10n.calculatorsFieldAcLimit, unit: kw, helper: l10n.calculatorsAcLimitHint),
                    _F('stationPowerKw', l10n.calculatorsFieldStationPower, unit: kw),
                    if (_phases != null) ...[
                      _F('supplyAmps', l10n.calculatorsFieldAmps, unit: 'A'),
                      _F('supplyVoltsPerPhase', l10n.calculatorsFieldVolts, unit: 'V', helper: l10n.calculatorsVoltsHint),
                    ],
                  ]
                : [
                    _F('vehicleDcPeakKw', l10n.calculatorsFieldDcPeak, unit: kw),
                    _F('stationPowerKw', l10n.calculatorsFieldStationPower, unit: kw),
                  ],
          ),
        ];
      case CalculatorKinds.costPer100Km:
        return [
          (l10n.calculatorsSectionConsumption, Icons.speed, consumption),
          (l10n.calculatorsSectionTariff, Icons.payments_outlined, electricityPrices),
        ];
      case CalculatorKinds.monthlyCost:
        return [
          (l10n.calculatorsSectionConsumption, Icons.speed, consumption),
          (l10n.calculatorsSectionDriving, Icons.route_outlined, [distance]),
          (
            l10n.calculatorsSectionTariff,
            Icons.payments_outlined,
            [...electricityPrices, _F('fixedMonthlyFees', l10n.calculatorsFieldFixedFees, unit: cur)],
          ),
        ];
      case CalculatorKinds.vsPetrol:
        return [
          (l10n.calculatorsSectionConsumption, Icons.speed, consumption),
          (l10n.calculatorsSectionTariff, Icons.payments_outlined, electricityPrices),
          (
            l10n.calculatorsSectionFuel,
            Icons.local_gas_station_outlined,
            [
              _F('fuelConsumptionLPer100km', l10n.calculatorsFieldFuelConsumption, unit: 'L/100 km'),
              _F('fuelPricePerLiter', l10n.calculatorsFieldFuelPrice, unit: '$cur/L', refUnit: 'per_liter'),
            ],
          ),
          (l10n.calculatorsSectionDrivingOptional, Icons.route_outlined, [distance]),
        ];
      case CalculatorKinds.totalCostOfOwnership:
        return [
          (
            l10n.calculatorsSectionOwnership,
            Icons.event_repeat_outlined,
            [
              _F('years', l10n.calculatorsFieldYears, decimal: false),
              _F('kmPerYear', l10n.calculatorsFieldKmPerYear, unit: km, decimal: false),
            ],
          ),
          (l10n.calculatorsSectionConsumption, Icons.speed, consumption),
          (l10n.calculatorsSectionTariff, Icons.payments_outlined, electricityPrices),
          (l10n.calculatorsSectionEvCosts, Icons.electric_car_outlined, costs('ev')),
          if (_withFuelCar)
            (
              l10n.calculatorsSectionFuelCar,
              Icons.local_gas_station_outlined,
              [
                ...costs('fuelCar'),
                _F('fuelCar.fuelConsumptionLPer100km', l10n.calculatorsFieldFuelConsumption, unit: 'L/100 km'),
                _F('fuelCar.fuelPricePerLiter', l10n.calculatorsFieldFuelPrice, unit: '$cur/L', refUnit: 'per_liter'),
              ],
            ),
        ];
    }
    return const [];
  }

  // ---------------------------------------------------------------------------------------
  // Input + run
  // ---------------------------------------------------------------------------------------

  Map<String, Object?> _buildInput(AppLocalizations l10n, AppFormatters fmt) {
    final flat = <String, Object?>{};
    for (final (_, _, fields) in _sections(l10n, fmt)) {
      for (final f in fields) {
        if (_refs.containsKey(f.key)) continue; // filled by the reference price
        flat[f.key] = numberOrRaw(_c(f.key).text);
      }
    }
    final input = nestInput(flat);
    switch (_apiKind) {
      case 'charge-cost':
        if (_energyDirect) input['energyBasis'] = _energyBasis;
        input.putIfAbsent('tariff', () => <String, Object?>{});
      case 'charge-time':
        input['currentType'] = _currentType;
        if (_currentType == 'AC' && _phases != null) input['supplyPhases'] = int.parse(_phases!);
      case 'cost-per-100km' || 'monthly-cost' || 'vs-fuel' || 'tco':
        input['consumptionBasis'] = _consumptionBasis;
        if (_apiKind == 'tco') {
          input.putIfAbsent('ev', () => <String, Object?>{});
          if (_withFuelCar) input.putIfAbsent('fuelCar', () => <String, Object?>{});
        }
    }
    if (_hasPrices) {
      final currency = _currency ?? ref.read(effectiveMarketProvider).currency;
      if (currency.isNotEmpty) input['currency'] = currency;
      if (_priceDate != null) input['priceDate'] = isoDate(_priceDate!);
    }
    return input;
  }

  Future<void> _compute() async {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final lang = context.languageCode;
    final apiKind = _apiKind!;
    final input = _buildInput(l10n, fmt);
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _errors = const {};
    });
    CalcOutcome outcome;
    final car = _car;
    if (car == null) {
      outcome = runCalculatorLocally(apiKind: apiKind, input: input, referencePrices: Map.of(_refs), lang: lang);
    } else {
      try {
        final body = serverCalculatorBody(
          input: input,
          referencePrices: Map.of(_refs),
          variantId: car is _CatalogTrim ? car.id : null,
          userVehicleId: car is _GarageCar ? car.id : null,
        );
        final json = await ref.read(calculatorsRepositoryProvider).compute(apiKind, body);
        outcome = CalcSuccess(CalcResultView.fromJson(json, computedOnDevice: false));
      } on ApiException catch (e) {
        if (e.kind == ApiErrorKind.validation && e.fieldErrors.isNotEmpty) {
          outcome = CalcInvalid(fieldErrorsOf(e));
        } else {
          if (mounted) {
            showAppSnackBar(
              context,
              e.isConnectivityProblem ? l10n.calculatorsCarNeedsNetwork : errorMessage(l10n, e),
              tone: AppTone.danger,
            );
          }
          setState(() => _busy = false);
          return;
        }
      }
    }
    if (!mounted) return;
    setState(() {
      _busy = false;
      switch (outcome) {
        case CalcSuccess(:final view):
          _result = view;
          _errors = const {};
        case CalcInvalid(:final fieldErrors):
          _result = null;
          _errors = fieldErrors;
      }
    });
    if (outcome is CalcSuccess) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final ctx = _resultKey.currentContext;
        if (ctx != null) Scrollable.ensureVisible(ctx, duration: AppMotion.of(context), curve: AppMotion.standard);
      });
    }
  }

  // ---------------------------------------------------------------------------------------
  // Pickers
  // ---------------------------------------------------------------------------------------

  Future<void> _chooseCar() async {
    final l10n = context.l10n;
    final signedIn = ref.read(authControllerProvider) is AuthSignedIn;
    var garage = const <UserVehicle>[];
    if (signedIn) {
      try {
        garage = await ref.read(garageVehiclesProvider.future);
      } on Object {
        garage = const [];
      }
    }
    if (!mounted) return;
    final choice = await showAppBottomSheet<Object>(
      context: context,
      title: l10n.calculatorsChooseCar,
      builder: (context) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
            child: Text(l10n.calculatorsChooseCarHint, style: Theme.of(context).textTheme.bodySmall),
          ),
          for (final v in garage)
            ListTile(
              leading: const Icon(Icons.garage_outlined),
              title: Text(v.displayName),
              subtitle: Text(v.variant.name),
              onTap: () => Navigator.of(context).pop(_GarageCar(v.id, v.displayName)),
            ),
          ListTile(
            leading: const Icon(Icons.search),
            title: Text(l10n.calculatorsPickTrim),
            trailing: const ForwardChevron(),
            onTap: () => Navigator.of(context).pop('catalog'),
          ),
          if (_car != null)
            ListTile(
              leading: const Icon(Icons.clear),
              title: Text(l10n.calculatorsNoCar),
              onTap: () => Navigator.of(context).pop('none'),
            ),
        ],
      ),
    );
    if (!mounted || choice == null) return;
    if (choice == 'none') {
      setState(() => _car = null);
    } else if (choice == 'catalog') {
      final picked = await pickVariant(context, market: ref.read(effectiveMarketProvider).code);
      if (picked != null && mounted) setState(() => _car = _CatalogTrim(picked.variantId, '${picked.title} · ${picked.trimName}'));
    } else if (choice is _GarageCar) {
      setState(() => _car = choice);
    }
  }

  Future<void> _pickReference(_F field) async {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final market = ref.read(effectiveMarketProvider).code;
    final picked = await showAppBottomSheet<ReferencePrice>(
      context: context,
      title: l10n.calculatorsReferencePrices,
      builder: (context) => Consumer(
        builder: (context, ref, _) => AsyncStateView<List<ReferencePrice>>(
          value: ref.watch(referencePricesProvider(market)),
          compact: true,
          onRetry: () => ref.invalidate(referencePricesProvider(market)),
          isEmpty: (items) => items.where((r) => r.unit == field.refUnit).isEmpty,
          emptyIcon: Icons.receipt_long_outlined,
          emptyTitle: l10n.calculatorsNoReferencePrices,
          emptyMessage: l10n.calculatorsNoReferencePricesHint,
          builder: (context, items) => Column(
            children: [
              for (final r in items.where((r) => r.unit == field.refUnit))
                ListTile(
                  title: Text(r.label),
                  subtitle: Text(
                    [
                      l10n.calculatorsEffectiveFrom(fmt.date(parseIsoDate(r.effectiveFrom)) ?? r.effectiveFrom),
                      ?r.sourceTitle,
                    ].join(' · '),
                  ),
                  trailing: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(fmt.rate(r.amount, r.currency) ?? r.amount, style: Theme.of(context).textTheme.titleSmall),
                      if (r.isDemo) const DemoBadge(dense: true),
                      if (r.possiblyOutdated) Text(l10n.calculatorsPossiblyOutdated, style: Theme.of(context).textTheme.labelSmall),
                    ],
                  ),
                  onTap: () => Navigator.of(context).pop(r),
                ),
            ],
          ),
        ),
      ),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _refs[field.key] = picked;
      _currency = picked.currency;
      _c(field.key).text = picked.amount;
    });
  }

  // ---------------------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final info = calculatorInfo(l10n, widget.kind);
    if (_apiKind == null || info == null) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.calculatorsTitle)),
        body: EmptyState(icon: Icons.calculate_outlined, title: l10n.calculatorsUnknown),
      );
    }
    final fmt = AppFormatters.of(context);
    final theme = Theme.of(context);
    final markets = ref.watch(appConfigProvider).enabledMarkets;
    final currencies = {for (final m in markets) if (m.currency.isNotEmpty) m.currency, ?_currency}.toList();
    _currency ??= ref.watch(effectiveMarketProvider).currency.isEmpty ? null : ref.watch(effectiveMarketProvider).currency;
    final unbound = _errors.entries.where((e) => !_isFormField(e.key, l10n, fmt)).toList();

    return Scaffold(
      appBar: AppBar(title: Text(info.title)),
      body: ListView(
        padding: EdgeInsets.fromLTRB(context.pageGutter, AppSpacing.md, context.pageGutter, AppSpacing.xxl),
        children: [
          ResponsiveCenter(
            padding: EdgeInsets.zero,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(info.description, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                const SizedBox(height: AppSpacing.lg),
                _modeCard(l10n),
                const SizedBox(height: AppSpacing.lg),
                for (final (title, icon, fields) in _sections(l10n, fmt)) ...[
                  SectionCard(
                    title: title,
                    icon: icon,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [for (final f in fields) _field(f, l10n)],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                ],
                if (_hasPrices) ...[
                  SectionCard(
                    title: l10n.calculatorsSectionPrices,
                    icon: Icons.event_note_outlined,
                    subtitle: l10n.calculatorsNoDefaultPrices,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        DropdownButtonFormField<String>(
                          initialValue: currencies.contains(_currency) ? _currency : null,
                          isExpanded: true,
                          decoration: InputDecoration(labelText: l10n.calculatorsCurrency, errorText: _errors['currency']),
                          items: [for (final c in currencies) DropdownMenuItem(value: c, child: Text(c))],
                          onChanged: (v) => setState(() {
                            _currency = v;
                            // A reference price in another currency no longer applies.
                            _refs.removeWhere((_, r) => r.currency != v);
                          }),
                        ),
                        const SizedBox(height: AppSpacing.md),
                        InkWell(
                          borderRadius: AppRadii.control,
                          onTap: () async {
                            final now = DateTime.now();
                            final d = await showDatePicker(
                              context: context,
                              initialDate: _priceDate ?? now,
                              firstDate: DateTime(2000),
                              lastDate: now,
                            );
                            if (d != null) setState(() => _priceDate = d);
                          },
                          child: InputDecorator(
                            decoration: InputDecoration(
                              labelText: l10n.calculatorsPriceDate,
                              helperText: _refs.isNotEmpty && _priceDate == null
                                  ? l10n.calculatorsPriceDateFromReference
                                  : l10n.calculatorsPriceDateHint,
                              helperMaxLines: 3,
                              errorText: _errors['priceDate'],
                              suffixIcon: _priceDate == null
                                  ? const Icon(Icons.calendar_today_outlined)
                                  : IconButton(
                                      tooltip: l10n.garageClear,
                                      icon: const Icon(Icons.clear),
                                      onPressed: () => setState(() => _priceDate = null),
                                    ),
                            ),
                            child: Text(fmt.date(_priceDate) ?? l10n.calculatorsPriceDateNotSet),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                ],
                if (unbound.isNotEmpty) ...[
                  for (final e in unbound)
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                      child: InlineNotice(message: e.value, tone: AppTone.danger),
                    ),
                ],
                PrimaryButton(
                  label: l10n.calculatorsCalculate,
                  icon: Icons.calculate,
                  expand: true,
                  loading: _busy,
                  onPressed: _busy ? null : _compute,
                ),
                const SizedBox(height: AppSpacing.xl),
                if (_result case final r?) KeyedSubtree(key: _resultKey, child: CalcResultPanel(view: r)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  bool _isFormField(String key, AppLocalizations l10n, AppFormatters fmt) {
    if (key == 'currency' || key == 'priceDate') return _hasPrices;
    for (final (_, _, fields) in _sections(l10n, fmt)) {
      if (fields.any((f) => f.key == key)) return true;
    }
    return false;
  }

  Widget _field(_F f, AppLocalizations l10n) {
    final ref0 = _refs[f.key];
    final fmt = AppFormatters.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          NumberField(
            fieldKey: Key('calc-${f.key}'),
            controller: _c(f.key),
            label: f.label,
            unit: f.unit,
            allowDecimal: f.decimal,
            enabled: ref0 == null,
            helper: ref0 != null
                ? l10n.calculatorsReferenceUsed(ref0.label, fmt.date(parseIsoDate(ref0.effectiveFrom)) ?? ref0.effectiveFrom)
                : f.helper,
            errorText: _errors[f.key] ?? _errors['referencePriceIds.${referencePriceFieldKeys[f.key]}'],
          ),
          if (f.refUnit != null)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: ref0 == null
                  ? TextButton.icon(
                      icon: const Icon(Icons.receipt_long_outlined, size: 18),
                      label: Text(l10n.calculatorsUseReference),
                      onPressed: () => _pickReference(f),
                    )
                  : TextButton.icon(
                      icon: const Icon(Icons.edit_outlined, size: 18),
                      label: Text(l10n.calculatorsEnterMyOwn),
                      onPressed: () => setState(() {
                        _refs.remove(f.key);
                        _c(f.key).clear();
                      }),
                    ),
            ),
        ],
      ),
    );
  }

  Widget _modeCard(AppLocalizations l10n) {
    final theme = Theme.of(context);
    final carTile = AppCard(
      onTap: _chooseCar,
      semanticLabel: _car?.label ?? l10n.calculatorsChooseCar,
      child: Row(
        children: [
          Icon(Icons.directions_car_outlined, color: theme.colorScheme.primary),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_car?.label ?? l10n.calculatorsNoCarSelected, style: theme.textTheme.titleSmall),
                Text(
                  _car == null ? l10n.calculatorsCarOptional : l10n.calculatorsCarSelectedHint,
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
          const ForwardChevron(),
        ],
      ),
    );
    final modes = <Widget>[
      if (_apiKind == 'charge-cost') ...[
        ChoicePills<bool>(
          options: {false: l10n.calculatorsModeSoc, true: l10n.calculatorsModeEnergy},
          selected: _energyDirect,
          onSelected: (v) => setState(() => _energyDirect = v),
        ),
        if (_energyDirect) ...[
          const SizedBox(height: AppSpacing.sm),
          ChoicePills<String>(
            options: {'battery': l10n.calculatorsBasisBattery, 'grid': l10n.calculatorsBasisGrid},
            selected: _energyBasis,
            onSelected: (v) => setState(() => _energyBasis = v),
          ),
        ],
      ],
      if (_apiKind == 'charge-time') ...[
        ChoicePills<String>(
          options: const {'AC': 'AC', 'DC': 'DC'},
          selected: _currentType,
          onSelected: (v) => setState(() => _currentType = v),
        ),
        if (_currentType == 'AC') ...[
          const SizedBox(height: AppSpacing.sm),
          Text(l10n.calculatorsSupplyLimit, style: theme.textTheme.labelLarge),
          const SizedBox(height: AppSpacing.xs),
          ChoicePills<String>(
            options: {'': l10n.calculatorsSupplyNone, '1': l10n.calculatorsSupplyOne, '3': l10n.calculatorsSupplyThree},
            selected: _phases ?? '',
            onSelected: (v) => setState(() => _phases = v.isEmpty ? null : v),
          ),
        ] else ...[
          const SizedBox(height: AppSpacing.sm),
          InlineNotice(message: l10n.calculatorsDcCurveHint),
        ],
      ],
      if (_apiKind != 'charge-cost' && _apiKind != 'charge-time') ...[
        Text(l10n.calculatorsConsumptionBasis, style: theme.textTheme.labelLarge),
        const SizedBox(height: AppSpacing.xs),
        ChoicePills<String>(
          options: {'grid': l10n.calculatorsBasisGridConsumption, 'battery': l10n.calculatorsBasisBatteryConsumption},
          selected: _consumptionBasis,
          onSelected: (v) => setState(() => _consumptionBasis = v),
        ),
      ],
      if (_apiKind == 'monthly-cost' || _apiKind == 'vs-fuel') ...[
        const SizedBox(height: AppSpacing.sm),
        ChoicePills<bool>(
          options: {false: l10n.calculatorsPerMonthMode, true: l10n.calculatorsPerDayMode},
          selected: _perDay,
          onSelected: (v) => setState(() => _perDay = v),
        ),
      ],
      if (_apiKind == 'tco')
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          title: Text(l10n.calculatorsCompareFuelCar),
          value: _withFuelCar,
          onChanged: (v) => setState(() => _withFuelCar = v),
        ),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        carTile,
        if (modes.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.md),
          AppCard(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: modes)),
        ],
      ],
    );
  }
}
