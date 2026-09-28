import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/app_config/app_config_controller.dart';
import '../../../core/errors/app_errors.dart';
import '../../../shared/widgets/kit.dart';
import '../../auth/domain/auth_state.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../charging/data/location_service.dart';
import '../../charging/domain/city_presets.dart';
import '../../charging/domain/station_query.dart';
import '../../charging/presentation/widgets/map_point_picker.dart';
import '../../garage/application/garage_providers.dart';
import '../../garage/common/personal_forms.dart';
import '../../garage/common/personal_widgets.dart';
import '../../garage/domain/user_vehicle.dart';
import '../../garage/presentation/widgets/variant_picker.dart';
import '../data/trips_repository.dart';
import '../domain/trip_models.dart';
import 'trip_plan_view.dart';

/// Saved trip plans of the signed-in user.
final savedTripsProvider = FutureProvider.autoDispose<List<SavedTrip>>((ref) async {
  final userId = ref.watch(personalUserIdProvider);
  if (userId == null) return const [];
  return ref.watch(tripsRepositoryProvider).saved();
});

/// Trip planner (`/trips`). Only reachable when `/app-config` announces
/// `tripPlanner` (a routing provider is configured on the server); the plan
/// comes from the server over real road distances and is refused — never
/// invented — when the data is not enough.
class TripPlannerScreen extends ConsumerStatefulWidget {
  const TripPlannerScreen({super.key});

  @override
  ConsumerState<TripPlannerScreen> createState() => _TripPlannerScreenState();
}

class _TripPlannerScreenState extends ConsumerState<TripPlannerScreen> {
  final _formKey = GlobalKey<FormState>();
  final _resultKey = GlobalKey();
  final _soc = TextEditingController();
  final _minSoc = TextEditingController();
  final _consumption = TextEditingController();
  final _margin = TextEditingController();
  final _chargeTo = TextEditingController();
  final _price = TextEditingController();
  final _title = TextEditingController();
  TripPoint? _origin;
  TripPoint? _destination;
  String? _userVehicleId;
  PickedVariant? _variant;
  DateTime? _departure;
  bool _save = false;
  bool _busy = false;
  TripPlan? _plan;
  ApiException? _refusal;
  Map<String, String> _errors = const {};

  @override
  void dispose() {
    for (final c in [_soc, _minSoc, _consumption, _margin, _chargeTo, _price, _title]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<TripPoint?> _choosePoint(String title) async {
    final l10n = context.l10n;
    final lang = context.languageCode;
    final market = ref.read(effectiveMarketProvider).code;
    final mapUsable = ref.read(appConfigProvider).map.isUsable;
    final choice = await showAppBottomSheet<Object>(
      context: context,
      title: title,
      builder: (context) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(Icons.my_location),
            title: Text(l10n.tripsMyLocation),
            subtitle: Text(l10n.tripsMyLocationHint),
            onTap: () => Navigator.of(context).pop('me'),
          ),
          if (mapUsable)
            ListTile(
              leading: const Icon(Icons.map_outlined),
              title: Text(l10n.tripsPickOnMap),
              onTap: () => Navigator.of(context).pop('map'),
            ),
          const Divider(),
          for (final c in cityPresets.where((c) => c.marketCode == market))
            ListTile(
              leading: const Icon(Icons.location_city_outlined),
              title: Text(c.name(lang)),
              onTap: () => Navigator.of(context).pop(c),
            ),
        ],
      ),
    );
    if (!mounted || choice == null) return null;
    if (choice is CityPreset) return TripPoint(lat: choice.lat, lng: choice.lng, label: choice.name(lang));
    if (choice == 'map') {
      final start = _origin ?? _destination;
      final initial = start == null
          ? (cityPresets.where((c) => c.marketCode == market).firstOrNull?.point ?? cityPresets.first.point)
          : GeoPoint(start.lat, start.lng);
      final p = await pickPointOnMap(context, initial: initial, title: title, confirmLabel: l10n.tripsUsePoint);
      if (p == null || !mounted) return null;
      return TripPoint(lat: p.lat, lng: p.lng, label: l10n.tripsPointOnMap(p.lat.toStringAsFixed(4), p.lng.toStringAsFixed(4)));
    }
    // My location: while-in-use permission, asked only now.
    final service = ref.read(locationServiceProvider);
    var access = await service.check();
    if (access == LocationAccess.denied) access = await service.request();
    if (!mounted) return null;
    if (access != LocationAccess.granted) {
      showAppSnackBar(context, l10n.tripsLocationDenied, tone: AppTone.warning, icon: Icons.location_off_outlined);
      return null;
    }
    final pos = await service.currentPosition();
    if (!mounted) return null;
    if (pos == null) {
      showAppSnackBar(context, l10n.tripsLocationFailed, tone: AppTone.warning);
      return null;
    }
    return TripPoint(lat: pos.lat, lng: pos.lng, label: l10n.tripsMyLocation);
  }

  Future<void> _chooseCar(List<UserVehicle> garage) async {
    final l10n = context.l10n;
    final choice = await showAppBottomSheet<Object>(
      context: context,
      title: l10n.tripsCar,
      builder: (context) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final v in garage)
            ListTile(
              leading: const Icon(Icons.garage_outlined),
              title: Text(v.displayName),
              subtitle: Text(v.variant.name),
              onTap: () => Navigator.of(context).pop(v),
            ),
          ListTile(
            leading: const Icon(Icons.search),
            title: Text(l10n.calculatorsPickTrim),
            trailing: const ForwardChevron(),
            onTap: () => Navigator.of(context).pop('catalog'),
          ),
        ],
      ),
    );
    if (!mounted || choice == null) return;
    if (choice is UserVehicle) {
      setState(() {
        _userVehicleId = choice.id;
        _variant = null;
      });
    } else {
      final picked = await pickVariant(context, market: ref.read(effectiveMarketProvider).code);
      if (picked != null && mounted) {
        setState(() {
          _variant = picked;
          _userVehicleId = null;
        });
      }
    }
  }

  FormFieldValidator<String> _pct({required bool required, num min = 0, num max = 100}) => (raw) {
    final l10n = context.l10n;
    num? v;
    try {
      v = parseNumberInput(raw ?? '');
    } on FormatException {
      return l10n.garageErrorNumber;
    }
    if (v == null) return required ? l10n.chargingLogsErrorRequired : null;
    if (v < min || v > max) return l10n.remindersErrorRange(min.toInt(), max.toInt());
    return null;
  };

  Future<void> _submit() async {
    final l10n = context.l10n;
    final errors = <String, String>{};
    if (_origin == null) errors['origin'] = l10n.tripsErrorOrigin;
    if (_destination == null) errors['destination'] = l10n.tripsErrorDestination;
    if (_userVehicleId == null && _variant == null) errors['vehicle'] = l10n.tripsErrorCar;
    final valid = _formKey.currentState?.validate() ?? false;
    final soc = parseNumberInput(_soc.text);
    final minSoc = parseNumberInput(_minSoc.text);
    if (valid && soc != null && minSoc != null && minSoc >= soc) errors['minArrivalSocPercent'] = l10n.tripsErrorMinSoc;
    setState(() {
      _errors = errors;
      _refusal = null;
    });
    if (!valid || errors.isNotEmpty) return;
    final market = ref.read(effectiveMarketProvider);
    final price = parseNumberInput(_price.text);
    final request = TripPlanRequest(
      origin: _origin!,
      destination: _destination!,
      userVehicleId: _userVehicleId,
      variantId: _variant?.variantId,
      currentSocPercent: soc!,
      minArrivalSocPercent: minSoc!,
      departureAt: _departure,
      save: _save,
      title: _title.text,
      assumptions: {
        'consumptionKwhPer100km': ?parseNumberInput(_consumption.text),
        'consumptionMarginPercent': ?parseNumberInput(_margin.text),
        'chargeToSocPercent': ?parseNumberInput(_chargeTo.text),
        if (price != null) ...{'electricityPricePerKwh': price, 'currency': market.currency},
      },
    );
    setState(() => _busy = true);
    try {
      final plan = await ref.read(tripsRepositoryProvider).plan(request);
      if (!mounted) return;
      setState(() => _plan = plan);
      if (_save) ref.invalidate(savedTripsProvider);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final ctx = _resultKey.currentContext;
        if (ctx != null) Scrollable.ensureVisible(ctx, duration: AppMotion.of(context));
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _plan = null;
        if (e.code.startsWith('TRIP_') || e.kind == ApiErrorKind.notConfigured || e.code == 'ROUTE_NOT_FOUND') {
          _refusal = e;
        } else {
          _errors = fieldErrorsOf(e);
          showAppSnackBar(context, errorMessage(l10n, e), tone: AppTone.danger);
        }
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _refusalText(AppLocalizations l10n, ApiException e) {
    if (e.kind == ApiErrorKind.notConfigured) return l10n.tripsNotConfigured;
    final details = e.details is Map ? e.details! as Map : const {};
    return switch (e.code) {
      'TRIP_VEHICLE_DATA_MISSING' => l10n.tripsVehicleDataMissing(
        ((details['missing'] as List?) ?? const []).map((m) => _missingLabel(l10n, '$m')).join('، '),
      ),
      'TRIP_NO_REACHABLE_STATION' => switch (details['reason']) {
        'too_many_stops' => l10n.tripsTooManyStops,
        'charge_time_unknown' => l10n.tripsChargeTimeUnknown,
        _ => l10n.tripsNoReachableStation,
      },
      'ROUTE_NOT_FOUND' => l10n.tripsRouteNotFound,
      _ => e.message ?? l10n.commonErrorGeneric,
    };
  }

  String _missingLabel(AppLocalizations l10n, String key) => switch (key) {
    'batteryUsableKwh' => l10n.calculatorsFieldUsable,
    'consumptionKwhPer100km' => l10n.calculatorsFieldConsumption,
    'inlets' => l10n.tripsMissingInlets,
    _ => key,
  };

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final theme = Theme.of(context);
    final signedIn = ref.watch(authControllerProvider) is AuthSignedIn;
    final garage = ref.watch(garageVehiclesProvider).value ?? const <UserVehicle>[];
    final garageCar = garage.where((v) => v.id == _userVehicleId).firstOrNull;
    final carLabel = garageCar?.displayName ?? (_variant == null ? null : '${_variant!.title} · ${_variant!.trimName}');

    Widget pointTile(String label, TripPoint? p, String? error, VoidCallback onTap, IconData icon) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppCard(
          onTap: onTap,
          semanticLabel: '$label: ${p?.label ?? l10n.tripsChoose}',
          child: Row(
            children: [
              Icon(icon, color: theme.colorScheme.primary),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label, style: theme.textTheme.labelMedium),
                    Text(p?.label ?? l10n.tripsChoose, style: theme.textTheme.titleSmall),
                  ],
                ),
              ),
              const ForwardChevron(),
            ],
          ),
        ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.xs),
            child: Text(error, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error)),
          ),
      ],
    );

    return AppScaffold(
      title: l10n.tripsTitle,
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
                  InlineNotice(message: l10n.tripsIntro, icon: Icons.info_outline),
                  const SizedBox(height: AppSpacing.lg),
                  pointTile(l10n.tripsFrom, _origin, _errors['origin'], () async {
                    final p = await _choosePoint(l10n.tripsFrom);
                    if (p != null) setState(() => _origin = p);
                  }, Icons.trip_origin),
                  const SizedBox(height: AppSpacing.sm),
                  pointTile(l10n.tripsTo, _destination, _errors['destination'], () async {
                    final p = await _choosePoint(l10n.tripsTo);
                    if (p != null) setState(() => _destination = p);
                  }, Icons.place_outlined),
                  const SizedBox(height: AppSpacing.sm),
                  pointTile(l10n.tripsCar, carLabel == null ? null : TripPoint(lat: 0, lng: 0, label: carLabel), _errors['vehicle'], () => _chooseCar(garage), Icons.directions_car_outlined),
                  const SizedBox(height: AppSpacing.lg),
                  SectionCard(
                    title: l10n.tripsBatterySection,
                    icon: Icons.battery_charging_full,
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: NumberField(
                            controller: _soc,
                            label: l10n.tripsCurrentSoc,
                            unit: '%',
                            validator: _pct(required: true, min: 1),
                            errorText: _errors['currentSocPercent'],
                          ),
                        ),
                        const SizedBox(width: AppSpacing.md),
                        Expanded(
                          child: NumberField(
                            controller: _minSoc,
                            label: l10n.tripsMinArrivalSoc,
                            unit: '%',
                            validator: _pct(required: true, max: 60),
                            errorText: _errors['minArrivalSocPercent'],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  SectionCard(
                    title: l10n.tripsDepartureSection,
                    icon: Icons.schedule,
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(_departure == null ? l10n.tripsLeaveNow : fmt.dateTime(_departure)!),
                      trailing: const Icon(Icons.edit_calendar_outlined),
                      onTap: () async {
                        final now = DateTime.now();
                        final d = await showDatePicker(
                          context: context,
                          initialDate: _departure ?? now,
                          firstDate: now.subtract(const Duration(days: 1)),
                          lastDate: now.add(const Duration(days: 60)),
                        );
                        if (d == null || !context.mounted) return;
                        final t = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(_departure ?? now));
                        if (t == null) return;
                        setState(() => _departure = DateTime(d.year, d.month, d.day, t.hour, t.minute));
                      },
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Card(
                    margin: EdgeInsets.zero,
                    child: ExpansionTile(
                      leading: const Icon(Icons.tune),
                      title: Text(l10n.tripsAssumptionsEdit),
                      subtitle: Text(l10n.tripsAssumptionsEditHint),
                      childrenPadding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.lg),
                      children: [
                        NumberField(
                          controller: _consumption,
                          label: l10n.calculatorsFieldConsumption,
                          unit: fmt.unitLabel(Unit.kWhPer100Km),
                          helper: l10n.tripsConsumptionHint,
                        ),
                        const SizedBox(height: AppSpacing.md),
                        NumberField(controller: _margin, label: l10n.tripsMargin, unit: '%', helper: l10n.tripsMarginHint),
                        const SizedBox(height: AppSpacing.md),
                        NumberField(controller: _chargeTo, label: l10n.tripsChargeTo, unit: '%', helper: l10n.tripsChargeToHint),
                        const SizedBox(height: AppSpacing.md),
                        NumberField(
                          controller: _price,
                          label: l10n.tripsPrice,
                          unit: '${ref.watch(effectiveMarketProvider).currency}/${fmt.unitLabel(Unit.kWh)}',
                          helper: l10n.tripsPriceHint,
                        ),
                      ],
                    ),
                  ),
                  if (signedIn) ...[
                    const SizedBox(height: AppSpacing.md),
                    SwitchListTile.adaptive(
                      contentPadding: EdgeInsets.zero,
                      title: Text(l10n.tripsSave),
                      subtitle: Text(l10n.tripsSaveHint),
                      value: _save,
                      onChanged: (v) => setState(() => _save = v),
                    ),
                    if (_save)
                      TextField(controller: _title, maxLength: 120, decoration: InputDecoration(labelText: l10n.tripsSaveTitle)),
                  ],
                  const SizedBox(height: AppSpacing.lg),
                  PrimaryButton(
                    label: l10n.tripsPlan,
                    icon: Icons.route,
                    expand: true,
                    loading: _busy,
                    onPressed: _busy ? null : _submit,
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  if (_refusal case final r?)
                    InlineNotice(
                      tone: r.kind == ApiErrorKind.notConfigured ? AppTone.info : AppTone.warning,
                      icon: Icons.do_not_disturb_on_outlined,
                      message: _refusalText(l10n, r),
                    ),
                  if (_plan case final p?) KeyedSubtree(key: _resultKey, child: TripPlanView(plan: p)),
                  if (signedIn) ...[const SizedBox(height: AppSpacing.xl), const _SavedTrips()],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SavedTrips extends ConsumerWidget {
  const _SavedTrips();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final value = ref.watch(savedTripsProvider);
    return SectionCard(
      title: l10n.tripsSaved,
      icon: Icons.bookmarks_outlined,
      child: AsyncStateView<List<SavedTrip>>(
        value: value,
        compact: true,
        onRetry: () => ref.invalidate(savedTripsProvider),
        isEmpty: (t) => t.isEmpty,
        emptyIcon: Icons.bookmark_border,
        emptyTitle: l10n.tripsSavedEmpty,
        builder: (context, trips) => Column(
          children: [
            for (final t in trips)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(t.title ?? [t.originLabel, t.destinationLabel].whereType<String>().join(' → ')),
                subtitle: Text(
                  [
                    fmt.dateTime(t.plannedDepartureAt ?? t.createdAt),
                    fmt.distanceKm(t.distanceKm),
                  ].whereType<String>().join(' · '),
                ),
                onTap: () => _open(context, ref, t),
                trailing: IconButton(
                  tooltip: l10n.tripsDeleteSaved,
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () async {
                    try {
                      await ref.read(tripsRepositoryProvider).deleteSaved(t.id);
                      ref.invalidate(savedTripsProvider);
                    } on Object catch (e) {
                      if (context.mounted) showAppSnackBar(context, errorMessage(l10n, e), tone: AppTone.danger);
                    }
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _open(BuildContext context, WidgetRef ref, SavedTrip t) async {
    final l10n = context.l10n;
    try {
      final res = await ref.read(tripsRepositoryProvider).savedPlan(t.id);
      if (!context.mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => Scaffold(
            appBar: AppBar(title: Text(t.title ?? l10n.tripsSaved)),
            body: ListView(
              padding: EdgeInsets.all(context.pageGutter),
              children: [TripPlanView(plan: res.plan, staleNotice: res.staleNotice ?? l10n.tripsSavedStale)],
            ),
          ),
        ),
      );
    } on Object catch (e) {
      if (context.mounted) showAppSnackBar(context, errorMessage(l10n, e), tone: AppTone.danger);
    }
  }
}
