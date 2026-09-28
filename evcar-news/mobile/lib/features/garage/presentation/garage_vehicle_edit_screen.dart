import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/di/providers.dart';
import '../../../app/router/app_routes.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/app_config/app_config_controller.dart';
import '../../../core/errors/app_errors.dart';
import '../../../shared/widgets/kit.dart';
import '../application/garage_providers.dart';
import '../common/personal_forms.dart';
import '../common/personal_widgets.dart';
import '../data/garage_repository.dart';
import '../domain/user_vehicle.dart';
import 'widgets/variant_picker.dart';

/// Add (`/garage/add`) or edit (`/garage/:id/edit`) a car: trim (brand →
/// model → year → trim), market, nickname, purchase date, odometer.
class GarageVehicleEditScreen extends ConsumerWidget {
  const GarageVehicleEditScreen({super.key, this.vehicleId});

  /// User vehicle id; null when adding.
  final String? vehicleId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final title = vehicleId == null ? l10n.garageAddTitle : l10n.garageEditTitle;
    return PersonalPage(
      title: title,
      returnTo: vehicleId == null ? AppRoutes.garageAdd : AppRoutes.garageVehicleEdit(vehicleId!),
      builder: (context, user) {
        if (vehicleId == null) return _GarageForm(title: title);
        final value = ref.watch(garageVehicleProvider(vehicleId!));
        return value.when(
          skipLoadingOnRefresh: true,
          data: (v) => _GarageForm(title: title, existing: v),
          loading: () => Scaffold(appBar: AppBar(title: Text(title)), body: const StateMessageView(kind: StateKind.loading)),
          error: (e, _) => Scaffold(
            appBar: AppBar(title: Text(title)),
            body: AsyncStateView<void>(
              value: AsyncError(e, StackTrace.empty),
              builder: (_, _) => const SizedBox.shrink(),
              onRetry: () => ref.invalidate(garageVehicleProvider(vehicleId!)),
            ),
          ),
        );
      },
    );
  }
}

class _GarageForm extends ConsumerStatefulWidget {
  const _GarageForm({required this.title, this.existing});

  final String title;
  final UserVehicle? existing;

  @override
  ConsumerState<_GarageForm> createState() => _GarageFormState();
}

class _GarageFormState extends ConsumerState<_GarageForm> {
  final _formKey = GlobalKey<FormState>();
  late final _nickname = TextEditingController(text: widget.existing?.nickname ?? '');
  late final _initialOdo = TextEditingController(text: numberToInput(widget.existing?.initialOdometerKm));
  late final _currentOdo = TextEditingController(text: numberToInput(widget.existing?.currentOdometerKm));
  late final _notes = TextEditingController(text: widget.existing?.notes ?? '');
  late String? _variantId = widget.existing?.variant.id;
  late String? _variantLabel = widget.existing?.variant.name;
  late String? _powertrain = widget.existing?.variant.powertrainType;
  late String? _market = widget.existing?.marketCode;
  late DateTime? _purchaseDate = parseIsoDate(widget.existing?.purchaseDate);
  late bool _primary = widget.existing?.isPrimary ?? false;
  bool _saving = false;
  Map<String, String> _serverErrors = const {};
  String? _variantError;

  @override
  void dispose() {
    for (final c in [_nickname, _initialOdo, _currentOdo, _notes]) {
      c.dispose();
    }
    super.dispose();
  }

  bool get _isNew => widget.existing == null;

  Future<void> _pickVariant() async {
    final market = _market ?? ref.read(effectiveMarketProvider).code;
    final picked = await pickVariant(context, market: market);
    if (picked == null || !mounted) return;
    setState(() {
      _variantId = picked.variantId;
      _variantLabel = [picked.title, picked.trimName].join(' · ');
      _powertrain = picked.powertrainType;
      _variantError = null;
    });
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: _purchaseDate ?? now,
      firstDate: DateTime(1990),
      lastDate: now,
    );
    if (d != null) setState(() => _purchaseDate = d);
  }

  String? _odoValidator(String? v) {
    try {
      final n = parseNumberInput(v ?? '');
      if (n != null && n < 0) return context.l10n.garageErrorNegative;
    } on FormatException {
      return context.l10n.garageErrorNumber;
    }
    return null;
  }

  Future<void> _save() async {
    final l10n = context.l10n;
    setState(() {
      _serverErrors = const {};
      _variantError = _variantId == null ? l10n.garageErrorPickCar : null;
    });
    if (!(_formKey.currentState?.validate() ?? false) || _variantId == null) return;
    final initial = parseNumberInput(_initialOdo.text);
    final current = parseNumberInput(_currentOdo.text);
    if (initial != null && current != null && current < initial) {
      setState(() => _serverErrors = {'currentOdometerKm': l10n.garageErrorCurrentBelowInitial});
      return;
    }
    final draft = UserVehicleDraft(
      variantId: _variantId,
      marketCode: _market ?? ref.read(effectiveMarketProvider).code,
      nickname: _nickname.text,
      purchaseDate: _purchaseDate == null ? null : isoDate(_purchaseDate!),
      initialOdometerKm: initial,
      currentOdometerKm: current,
      isPrimary: _isNew ? (_primary ? true : null) : _primary,
      notes: _notes.text,
    );
    setState(() => _saving = true);
    final repo = ref.read(garageRepositoryProvider);
    try {
      final saved = _isNew
          ? await repo.create(draft)
          : await repo.update(widget.existing!.id, _patchOf(draft));
      ref.invalidate(garageVehiclesProvider);
      ref.invalidate(garageVehicleProvider(saved.id));
      if (!mounted) return;
      showAppSnackBar(context, _isNew ? l10n.garageAdded : l10n.garageSaved, tone: AppTone.success);
      if (_isNew) {
        context.pushReplacement(AppRoutes.garageVehicle(saved.id));
      } else {
        context.pop();
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _serverErrors = fieldErrorsOf(e));
      final msg = e.code == 'GARAGE_LIMIT_REACHED' ? l10n.garageLimitReached(garageMaxVehicles) : errorMessage(l10n, e);
      showAppSnackBar(context, msg, tone: AppTone.danger);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// PATCH body: trim / market only when they changed.
  Map<String, Object?> _patchOf(UserVehicleDraft draft) {
    final patch = draft.toPatchJson();
    if (draft.variantId == widget.existing!.variant.id) patch.remove('variantId');
    if (draft.marketCode == widget.existing!.marketCode) patch.remove('marketCode');
    return patch;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final fmt = AppFormatters.of(context);
    final config = ref.watch(appConfigProvider);
    final markets = config.enabledMarkets;
    final market = _market ?? ref.watch(effectiveMarketProvider).code;
    final lang = context.languageCode;
    final powertrain = Powertrain.fromApi(_powertrain);
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: Form(
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
                    title: l10n.garageCarSection,
                    icon: Icons.directions_car_outlined,
                    subtitle: l10n.garageCarSectionHint,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        AppCard(
                          selected: _variantId != null,
                          onTap: _pickVariant,
                          semanticLabel: _variantLabel ?? l10n.garageChooseCar,
                          child: Row(
                            children: [
                              Icon(Icons.search, color: theme.colorScheme.primary),
                              const SizedBox(width: AppSpacing.md),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(_variantLabel ?? l10n.garageChooseCar, style: theme.textTheme.titleMedium),
                                    if (_variantId != null)
                                      Text(l10n.garageChangeCar, style: theme.textTheme.bodySmall),
                                  ],
                                ),
                              ),
                              if (powertrain != null) PowertrainPill(powertrain: powertrain, dense: true),
                              const ForwardChevron(),
                            ],
                          ),
                        ),
                        if (_variantError ?? _serverErrors['variantId'] case final err?) ...[
                          const SizedBox(height: AppSpacing.xs),
                          Text(err, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error)),
                        ],
                        const SizedBox(height: AppSpacing.lg),
                        DropdownButtonFormField<String>(
                          initialValue: markets.any((m) => m.code == market) ? market : null,
                          isExpanded: true,
                          decoration: InputDecoration(
                            labelText: l10n.garageMarket,
                            helperText: l10n.garageMarketHint,
                            helperMaxLines: 3,
                            errorText: _serverErrors['marketCode'],
                          ),
                          items: [
                            for (final m in markets)
                              DropdownMenuItem(value: m.code, child: Text('${m.nameFor(lang)} (${m.currency})')),
                          ],
                          onChanged: (v) => setState(() => _market = v),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  SectionCard(
                    title: l10n.garageDetailsSection,
                    icon: Icons.tune,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        TextFormField(
                          controller: _nickname,
                          maxLength: 100,
                          textInputAction: TextInputAction.next,
                          decoration: InputDecoration(
                            labelText: l10n.garageNickname,
                            helperText: l10n.garageNicknameHint,
                            errorText: _serverErrors['nickname'],
                          ),
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        InkWell(
                          onTap: _pickDate,
                          borderRadius: AppRadii.control,
                          child: InputDecorator(
                            decoration: InputDecoration(
                              labelText: l10n.garagePurchaseDate,
                              errorText: _serverErrors['purchaseDate'],
                              suffixIcon: _purchaseDate == null
                                  ? const Icon(Icons.calendar_today_outlined)
                                  : IconButton(
                                      tooltip: l10n.garageClear,
                                      icon: const Icon(Icons.clear),
                                      onPressed: () => setState(() => _purchaseDate = null),
                                    ),
                            ),
                            child: Text(fmt.date(_purchaseDate) ?? l10n.garageOptional),
                          ),
                        ),
                        const SizedBox(height: AppSpacing.lg),
                        NumberField(
                          controller: _initialOdo,
                          label: l10n.garageInitialOdometer,
                          unit: fmt.unitLabel(Unit.km),
                          helper: l10n.garageInitialOdometerHint,
                          allowDecimal: false,
                          validator: _odoValidator,
                          errorText: _serverErrors['initialOdometerKm'],
                        ),
                        const SizedBox(height: AppSpacing.md),
                        NumberField(
                          controller: _currentOdo,
                          label: l10n.garageCurrentOdometer,
                          unit: fmt.unitLabel(Unit.km),
                          helper: l10n.garageCurrentOdometerHint,
                          allowDecimal: false,
                          validator: _odoValidator,
                          errorText: _serverErrors['currentOdometerKm'],
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        SwitchListTile.adaptive(
                          contentPadding: EdgeInsets.zero,
                          value: _primary,
                          title: Text(l10n.garagePrimarySwitch),
                          subtitle: Text(l10n.garagePrimarySwitchHint),
                          onChanged: (v) => setState(() => _primary = v),
                        ),
                        TextFormField(
                          controller: _notes,
                          maxLength: 2000,
                          minLines: 2,
                          maxLines: 5,
                          decoration: InputDecoration(labelText: l10n.garageNotes, errorText: _serverErrors['notes']),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  PrimaryButton(
                    label: _isNew ? l10n.garageAddButton : l10n.commonSave,
                    icon: Icons.check,
                    expand: true,
                    loading: _saving,
                    onPressed: _saving ? null : _save,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
