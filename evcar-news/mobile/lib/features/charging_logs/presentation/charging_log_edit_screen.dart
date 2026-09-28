import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/app_config/app_config_controller.dart';
import '../../../core/errors/app_errors.dart';
import '../../../shared/widgets/kit.dart';
import '../../garage/application/garage_providers.dart';
import '../../garage/common/personal_forms.dart';
import '../../garage/common/personal_widgets.dart';
import '../../garage/domain/user_vehicle.dart';
import '../application/charging_logs_providers.dart';
import '../data/charging_logs_repository.dart';
import '../domain/charging_log.dart';
import 'widgets/log_labels.dart';

/// Add (`/charging-logs/new[?vehicle=]`) or edit (`/charging-logs/:id/edit`)
/// one charging session. Only energy is required; everything else is
/// optional and stays "not entered" (never 0) when left empty.
class ChargingLogEditScreen extends ConsumerWidget {
  const ChargingLogEditScreen({super.key, this.logId});

  /// Log entry id; null when adding.
  final String? logId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final title = logId == null ? l10n.chargingLogsNewTitle : l10n.chargingLogsEditTitle;
    return PersonalPage(
      title: title,
      returnTo: logId == null ? AppRoutes.chargingLogNew : AppRoutes.chargingLogEdit(logId!),
      builder: (context, user) {
        final vehicles = ref.watch(garageVehiclesProvider);
        final log = logId == null ? const AsyncData<ChargingLog?>(null) : ref.watch(chargingLogProvider(logId!));
        final AsyncValue<(List<UserVehicle>, ChargingLog?)> combined = switch ((vehicles, log)) {
          (AsyncData(value: final v), AsyncData(value: final l)) => AsyncData((v, l)),
          (AsyncError(:final error, :final stackTrace), _) || (_, AsyncError(:final error, :final stackTrace)) =>
            AsyncError(error, stackTrace),
          _ => const AsyncLoading(),
        };
        return Scaffold(
          appBar: AppBar(title: Text(title)),
          body: AsyncStateView<(List<UserVehicle>, ChargingLog?)>(
            value: combined,
            onRetry: () {
              ref.invalidate(garageVehiclesProvider);
              if (logId != null) ref.invalidate(chargingLogProvider(logId!));
            },
            isEmpty: (d) => d.$1.isEmpty,
            emptyIcon: Icons.garage_outlined,
            emptyTitle: l10n.chargingLogsNoCarTitle,
            emptyMessage: l10n.chargingLogsNoCarMessage,
            emptyActions: [
              StateAction(
                label: l10n.garageAddTitle,
                icon: Icons.add,
                primary: true,
                onPressed: () => context.push(AppRoutes.garageAdd),
              ),
            ],
            builder: (context, d) => _LogForm(
              vehicles: d.$1,
              existing: d.$2,
              initialVehicle: GoRouterState.of(context).uri.queryParameters['vehicle'],
            ),
          ),
        );
      },
    );
  }
}

class _LogForm extends ConsumerStatefulWidget {
  const _LogForm({required this.vehicles, this.existing, this.initialVehicle});

  final List<UserVehicle> vehicles;
  final ChargingLog? existing;
  final String? initialVehicle;

  @override
  ConsumerState<_LogForm> createState() => _LogFormState();
}

class _LogFormState extends ConsumerState<_LogForm> {
  final _formKey = GlobalKey<FormState>();
  late final ChargingLog? e = widget.existing;
  late final _energy = TextEditingController(text: numberToInput(e?.energyKwh));
  late final _cost = TextEditingController(text: e?.cost?.amount ?? '');
  late final _odometer = TextEditingController(text: numberToInput(e?.odometerKm));
  late final _socStart = TextEditingController(text: numberToInput(e?.socStart));
  late final _socEnd = TextEditingController(text: numberToInput(e?.socEnd));
  late final _duration = TextEditingController(text: numberToInput(e?.durationMinutes));
  late final _power = TextEditingController(text: numberToInput(e?.chargerPowerKw));
  late final _notes = TextEditingController(text: e?.notes ?? '');
  late String _vehicleId = _initialVehicle();
  late DateTime _chargedAt = (e?.chargedAt ?? DateTime.now()).toLocal();
  late String? _currentType = e?.currentType;
  late ChargeLocationType _location = e?.locationType ?? ChargeLocationType.home;
  late String? _currency = e?.cost?.currency;
  bool _saving = false;
  Map<String, String> _errors = const {};

  String _initialVehicle() {
    final ids = widget.vehicles.map((v) => v.id).toSet();
    if (e != null && ids.contains(e!.vehicleId)) return e!.vehicleId;
    if (widget.initialVehicle != null && ids.contains(widget.initialVehicle)) return widget.initialVehicle!;
    return (widget.vehicles.firstWhere((v) => v.isPrimary, orElse: () => widget.vehicles.first)).id;
  }

  @override
  void dispose() {
    for (final c in [_energy, _cost, _odometer, _socStart, _socEnd, _duration, _power, _notes]) {
      c.dispose();
    }
    super.dispose();
  }

  UserVehicle get _vehicle => widget.vehicles.firstWhere((v) => v.id == _vehicleId);

  String _defaultCurrency() {
    final market = ref.read(appConfigProvider).marketByCode(_vehicle.marketCode);
    return (market?.currency.isNotEmpty ?? false) ? market!.currency : '';
  }

  Future<void> _pickDateTime() async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: _chargedAt.isAfter(now) ? now : _chargedAt,
      firstDate: DateTime(2000),
      lastDate: now,
    );
    if (d == null || !mounted) return;
    final t = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(_chargedAt));
    if (!mounted) return;
    var picked = DateTime(d.year, d.month, d.day, t?.hour ?? _chargedAt.hour, t?.minute ?? _chargedAt.minute);
    if (picked.isAfter(now)) picked = now;
    setState(() => _chargedAt = picked);
  }

  /// Validator factory for optional numbers with a range.
  FormFieldValidator<String> _num({bool required = false, num? min, num? max, bool positive = false}) => (raw) {
    final l10n = context.l10n;
    num? v;
    try {
      v = parseNumberInput(raw ?? '');
    } on FormatException {
      return l10n.garageErrorNumber;
    }
    if (v == null) return required ? l10n.chargingLogsErrorRequired : null;
    if (positive && v <= 0) return l10n.chargingLogsErrorPositive;
    if (min != null && v < min) return l10n.garageErrorNegative;
    if (max != null && v > max) return l10n.chargingLogsErrorMax(AppFormatters.of(context).number(max)!);
    return null;
  };

  Future<void> _save() async {
    final l10n = context.l10n;
    setState(() => _errors = const {});
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final socStart = parseNumberInput(_socStart.text);
    final socEnd = parseNumberInput(_socEnd.text);
    if (socStart != null && socEnd != null && socEnd <= socStart) {
      setState(() => _errors = {'socEnd': l10n.chargingLogsErrorSoc});
      return;
    }
    final cost = parseNumberInput(_cost.text);
    final draft = ChargingLogDraft(
      userVehicleId: _vehicleId,
      chargedAt: _chargedAt,
      energyKwh: parseNumberInput(_energy.text)!,
      cost: cost,
      currency: cost == null ? null : (_currency ?? _defaultCurrency()),
      odometerKm: parseNumberInput(_odometer.text),
      socStart: socStart,
      socEnd: socEnd,
      durationMinutes: parseNumberInput(_duration.text),
      chargerPowerKw: parseNumberInput(_power.text),
      currentType: _currentType,
      locationType: _location,
      notes: _notes.text,
    );
    setState(() => _saving = true);
    final repo = ref.read(chargingLogsRepositoryProvider);
    try {
      if (e == null) {
        await repo.create(draft);
      } else {
        await repo.update(e!.id, draft);
      }
      _invalidate();
      if (!mounted) return;
      showAppSnackBar(context, e == null ? l10n.chargingLogsAdded : l10n.chargingLogsSaved, tone: AppTone.success);
      context.pop();
    } on ApiException catch (err) {
      if (!mounted) return;
      setState(() => _errors = fieldErrorsOf(err));
      showAppSnackBar(context, errorMessage(l10n, err), tone: AppTone.danger);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _invalidate() {
    ref.invalidate(chargingLogsProvider);
    ref.invalidate(chargingReportProvider);
    ref.invalidate(garageVehiclesProvider);
    ref.invalidate(garageVehicleProvider(_vehicleId));
    if (e != null) ref.invalidate(chargingLogProvider(e!.id));
  }

  Future<void> _delete() async {
    final l10n = context.l10n;
    final ok = await showConfirmSheet(
      context: context,
      title: l10n.chargingLogsDeleteConfirm,
      message: l10n.chargingLogsDeleteMessage,
      confirmLabel: l10n.chargingLogsDelete,
      destructive: true,
      icon: Icons.delete_outline,
    );
    if (!ok || !mounted) return;
    try {
      await ref.read(chargingLogsRepositoryProvider).delete(e!.id);
      _invalidate();
      if (!mounted) return;
      showAppSnackBar(context, l10n.chargingLogsDeleted, tone: AppTone.success);
      context.pop();
    } on Object catch (err) {
      if (mounted) showAppSnackBar(context, errorMessage(l10n, err), tone: AppTone.danger);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final currencies = {
      for (final m in ref.watch(appConfigProvider).enabledMarkets)
        if (m.currency.isNotEmpty) m.currency,
      ?_currency,
    }.toList();
    final currency = _currency ?? _defaultCurrency();
    return Form(
      key: _formKey,
      child: ListView(
        padding: EdgeInsets.fromLTRB(context.pageGutter, AppSpacing.md, context.pageGutter, AppSpacing.xxl),
        children: [
          ResponsiveCenter(
            padding: EdgeInsets.zero,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SectionCard(
                  title: l10n.chargingLogsSessionSection,
                  icon: Icons.bolt,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      DropdownButtonFormField<String>(
                        initialValue: _vehicleId,
                        isExpanded: true,
                        decoration: InputDecoration(labelText: l10n.chargingLogsCar, errorText: _errors['userVehicleId']),
                        items: [
                          for (final v in widget.vehicles) DropdownMenuItem(value: v.id, child: Text(v.displayName)),
                        ],
                        onChanged: (v) => setState(() => _vehicleId = v ?? _vehicleId),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      InkWell(
                        onTap: _pickDateTime,
                        borderRadius: AppRadii.control,
                        child: InputDecorator(
                          decoration: InputDecoration(
                            labelText: l10n.chargingLogsDate,
                            errorText: _errors['chargedAt'],
                            suffixIcon: const Icon(Icons.event_outlined),
                          ),
                          child: Text(fmt.dateTime(_chargedAt) ?? ''),
                        ),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      NumberField(
                        fieldKey: const Key('log-energy'),
                        controller: _energy,
                        label: l10n.chargingLogsEnergy,
                        unit: fmt.unitLabel(Unit.kWh),
                        helper: l10n.chargingLogsEnergyHint,
                        validator: _num(required: true, positive: true, max: 1000),
                        errorText: _errors['energyKwh'],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      Text(l10n.chargingLogsLocation, style: Theme.of(context).textTheme.labelLarge),
                      const SizedBox(height: AppSpacing.xs),
                      ChoicePills<ChargeLocationType>(
                        options: {for (final t in ChargeLocationType.values) t: LogLabels.location(l10n, t)},
                        selected: _location,
                        onSelected: (v) => setState(() => _location = v),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                SectionCard(
                  title: l10n.chargingLogsCostSection,
                  icon: Icons.payments_outlined,
                  subtitle: l10n.chargingLogsCostHint,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        flex: 3,
                        child: NumberField(
                          fieldKey: const Key('log-cost'),
                          controller: _cost,
                          label: l10n.chargingLogsCost,
                          validator: _num(min: 0),
                          errorText: _errors['cost'],
                        ),
                      ),
                      const SizedBox(width: AppSpacing.md),
                      Expanded(
                        flex: 2,
                        child: DropdownButtonFormField<String>(
                          initialValue: currencies.contains(currency) ? currency : null,
                          isExpanded: true,
                          decoration: InputDecoration(labelText: l10n.chargingLogsCurrency, errorText: _errors['currency']),
                          items: [for (final c in currencies) DropdownMenuItem(value: c, child: Text(c))],
                          onChanged: (v) => setState(() => _currency = v),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                SectionCard(
                  title: l10n.chargingLogsMoreSection,
                  icon: Icons.tune,
                  subtitle: l10n.chargingLogsMoreHint,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      NumberField(
                        controller: _odometer,
                        label: l10n.chargingLogsOdometer,
                        unit: fmt.unitLabel(Unit.km),
                        helper: l10n.chargingLogsOdometerHint,
                        allowDecimal: false,
                        validator: _num(min: 0),
                        errorText: _errors['odometerKm'],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: NumberField(
                              controller: _socStart,
                              label: l10n.chargingLogsSocStart,
                              unit: '%',
                              validator: _num(min: 0, max: 100),
                              errorText: _errors['socStart'],
                            ),
                          ),
                          const SizedBox(width: AppSpacing.md),
                          Expanded(
                            child: NumberField(
                              controller: _socEnd,
                              label: l10n.chargingLogsSocEnd,
                              unit: '%',
                              validator: _num(min: 0, max: 100),
                              errorText: _errors['socEnd'],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: NumberField(
                              controller: _duration,
                              label: l10n.chargingLogsDuration,
                              unit: fmt.unitLabel(Unit.minutes),
                              validator: _num(positive: true),
                              errorText: _errors['durationMinutes'],
                            ),
                          ),
                          const SizedBox(width: AppSpacing.md),
                          Expanded(
                            child: NumberField(
                              controller: _power,
                              label: l10n.chargingLogsPower,
                              unit: fmt.unitLabel(Unit.kW),
                              validator: _num(positive: true),
                              errorText: _errors['chargerPowerKw'],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      Text(l10n.chargingLogsCurrentType, style: Theme.of(context).textTheme.labelLarge),
                      const SizedBox(height: AppSpacing.xs),
                      ChoicePills<String>(
                        options: {'': l10n.chargingLogsCurrentUnknown, 'AC': 'AC', 'DC': 'DC'},
                        selected: _currentType ?? '',
                        onSelected: (v) => setState(() => _currentType = v.isEmpty ? null : v),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      TextFormField(
                        controller: _notes,
                        maxLength: 2000,
                        minLines: 2,
                        maxLines: 5,
                        decoration: InputDecoration(labelText: l10n.chargingLogsNotes, errorText: _errors['notes']),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.xl),
                PrimaryButton(
                  label: l10n.commonSave,
                  icon: Icons.check,
                  expand: true,
                  loading: _saving,
                  onPressed: _saving ? null : _save,
                ),
                if (e != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  SecondaryButton(label: l10n.chargingLogsDelete, icon: Icons.delete_outline, expand: true, onPressed: _delete),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
