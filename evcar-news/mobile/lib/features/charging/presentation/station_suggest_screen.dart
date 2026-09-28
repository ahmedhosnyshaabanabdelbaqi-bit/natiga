import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/di/providers.dart';
import '../../../app/router/app_routes.dart';
import '../../../core/app_config/app_config_controller.dart';
import '../../../shared/widgets/kit.dart';
import '../../auth/presentation/auth_gate.dart';
import '../application/charging_providers.dart';
import '../data/location_service.dart';
import '../data/stations_repository.dart';
import '../domain/station_models.dart';
import '../domain/station_query.dart';
import 'widgets/charging_labels.dart';
import 'widgets/form_parts.dart';
import 'widgets/location_prompts.dart';
import 'widgets/map_point_picker.dart';

/// Suggest a missing station (`/charging/suggest`, signed in). Suggestions
/// are reviewed before anything appears on the map; possible duplicates
/// within 150 m are listed after sending.
class StationSuggestScreen extends ConsumerWidget {
  const StationSuggestScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return AppScaffold(
      title: l10n.chargingSuggestTitle,
      body: AuthGate(
        returnTo: AppRoutes.chargingSuggest,
        guestMessage: l10n.chargingSuggestSignIn,
        builder: (context, _) => const _SuggestForm(),
      ),
    );
  }
}

class _ConnectorDraft {
  String? typeCode;
  CurrentType? current;
  final power = TextEditingController();
  final quantity = TextEditingController(text: '1');

  void dispose() {
    power.dispose();
    quantity.dispose();
  }
}

class _SuggestForm extends ConsumerStatefulWidget {
  const _SuggestForm();

  @override
  ConsumerState<_SuggestForm> createState() => _SuggestFormState();
}

class _SuggestFormState extends ConsumerState<_SuggestForm> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _operator = TextEditingController();
  final _lat = TextEditingController();
  final _lng = TextEditingController();
  final _city = TextEditingController();
  final _address = TextEditingController();
  final _hours = TextEditingController();
  final _notes = TextEditingController();
  final _connectors = <_ConnectorDraft>[];
  String? _country;
  String? _access;
  bool _sending = false;
  bool _locating = false;
  String? _error;
  SuggestionResult? _result;

  @override
  void dispose() {
    for (final c in [_name, _operator, _lat, _lng, _city, _address, _hours, _notes]) {
      c.dispose();
    }
    for (final c in _connectors) {
      c.dispose();
    }
    super.dispose();
  }

  void _setPoint(GeoPoint p) {
    _lat.text = p.lat.toStringAsFixed(6);
    _lng.text = p.lng.toStringAsFixed(6);
  }

  Future<void> _useLocation() async {
    setState(() => _locating = true);
    final service = ref.read(locationServiceProvider);
    final access = await service.request();
    GeoPoint? pos;
    if (access == LocationAccess.granted) pos = await service.currentPosition();
    if (!mounted) return;
    setState(() => _locating = false);
    if (pos != null) {
      setState(() => _setPoint(pos!));
      return;
    }
    final outcome = switch (access) {
      LocationAccess.denied => LocateOutcome.denied,
      LocationAccess.deniedForever => LocateOutcome.deniedForever,
      LocationAccess.serviceDisabled => LocateOutcome.serviceDisabled,
      _ => LocateOutcome.unavailable,
    };
    await handleLocateOutcome(context, ref, outcome);
  }

  Future<void> _pickOnMap() async {
    final l10n = context.l10n;
    final lat = double.tryParse(_lat.text);
    final lng = double.tryParse(_lng.text);
    final p = await pickPointOnMap(
      context,
      initial: lat != null && lng != null ? GeoPoint(lat, lng) : ref.read(chargingPlaceProvider).point,
      title: l10n.chargingSuggestPickTitle,
      confirmLabel: l10n.chargingSuggestUsePoint,
    );
    if (p != null && mounted) setState(() => _setPoint(p));
  }

  String? _coordError(String? v, double max) {
    final l10n = context.l10n;
    final d = double.tryParse((v ?? '').trim());
    if (d == null) return l10n.chargingSuggestCoordRequired;
    if (d.abs() > max) return l10n.chargingSuggestCoordInvalid;
    return null;
  }

  Future<void> _submit() async {
    final l10n = context.l10n;
    if (!(_form.currentState?.validate() ?? false)) return;
    String? t(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();
    final body = <String, Object?>{
      'name': _name.text.trim(),
      'operatorName': ?t(_operator),
      'latitude': double.parse(_lat.text.trim()),
      'longitude': double.parse(_lng.text.trim()),
      'countryCode': _country ?? ref.read(effectiveMarketProvider).code,
      'city': ?t(_city),
      'addressText': ?t(_address),
      'accessType': ?_access,
      'openingHoursText': ?t(_hours),
      'notes': ?t(_notes),
      if (_connectors.any((c) => c.typeCode != null && c.current != null))
        'connectors': [
          for (final c in _connectors)
            if (c.typeCode != null && c.current != null)
              {
                'connectorTypeCode': c.typeCode,
                'currentType': c.current!.apiValue,
                'maxPowerKw': ?double.tryParse(c.power.text.trim().replaceAll(',', '.')),
                'quantity': ?int.tryParse(c.quantity.text.trim()),
              },
        ],
    };
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final res = await ref.read(stationsRepositoryProvider).suggest(body);
      if (!mounted) return;
      setState(() {
        _sending = false;
        _result = res;
      });
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = submitErrorMessage(l10n, e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final lang = context.languageCode;
    final result = _result;
    if (result != null) {
      final fmt = AppFormatters.of(context);
      return SubmittedView(
        title: l10n.chargingSuggestSentTitle,
        message: l10n.chargingSuggestSentMessage,
        extra: result.possibleDuplicates.isEmpty
            ? null
            : Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(l10n.chargingSuggestMayExist, style: theme.textTheme.titleSmall),
                  const SizedBox(height: AppSpacing.sm),
                  for (final d in result.possibleDuplicates)
                    ListTile(
                      leading: const Icon(Icons.ev_station_outlined),
                      title: Text(d.name),
                      subtitle: Text(distanceText(fmt, l10n, d.distanceM) ?? l10n.commonNotAvailable),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => context.push(AppRoutes.station(d.id)),
                    ),
                ],
              ),
      );
    }
    final config = ref.watch(appConfigProvider);
    final meta = ref.watch(stationMetaProvider).value?.data;
    final market = ref.watch(effectiveMarketProvider);
    _country ??= market.code;

    return Form(
      key: _form,
      child: ListView(
        padding: EdgeInsetsDirectional.fromSTEB(context.pageGutter, AppSpacing.lg, context.pageGutter, AppSpacing.xxxl),
        children: [
          ResponsiveCenter(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(l10n.chargingSuggestIntro),
                if (_error != null) ...[const SizedBox(height: AppSpacing.lg), FormErrorBanner(message: _error!)],
                FormLabel(l10n.chargingSuggestName),
                TextFormField(
                  controller: _name,
                  maxLength: 200,
                  textInputAction: TextInputAction.next,
                  validator: (v) => (v ?? '').trim().length < 2 ? l10n.chargingSuggestNameRequired : null,
                ),
                FormLabel(l10n.chargingSuggestOperator, optional: true),
                TextFormField(controller: _operator, maxLength: 200),
                FormLabel(l10n.chargingSuggestLocation),
                Text(l10n.chargingSuggestLocationHelp, style: theme.textTheme.bodySmall),
                const SizedBox(height: AppSpacing.sm),
                Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.sm,
                  children: [
                    SecondaryButton(
                      label: l10n.chargingSuggestUseMyLocation,
                      icon: Icons.my_location,
                      loading: _locating,
                      onPressed: _locating ? null : _useLocation,
                    ),
                    if (config.map.isUsable)
                      SecondaryButton(label: l10n.chargingSuggestPickTitle, icon: Icons.push_pin_outlined, onPressed: _pickOnMap),
                  ],
                ),
                const SizedBox(height: AppSpacing.sm),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: _lat,
                        decoration: InputDecoration(labelText: l10n.chargingLatitude),
                        keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.\-]'))],
                        validator: (v) => _coordError(v, 90),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: TextFormField(
                        controller: _lng,
                        decoration: InputDecoration(labelText: l10n.chargingLongitude),
                        keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.\-]'))],
                        validator: (v) => _coordError(v, 180),
                      ),
                    ),
                  ],
                ),
                FormLabel(l10n.chargingSuggestCountry),
                DropdownButtonFormField<String>(
                  initialValue: _country,
                  isExpanded: true,
                  items: [
                    for (final m in config.enabledMarkets) DropdownMenuItem(value: m.code, child: Text(m.nameFor(lang))),
                  ],
                  onChanged: (v) => setState(() => _country = v),
                ),
                FormLabel(l10n.chargingSuggestCity, optional: true),
                TextFormField(controller: _city, maxLength: 120),
                FormLabel(l10n.chargingSuggestAddress, optional: true),
                TextFormField(controller: _address, maxLength: 500, maxLines: 2),
                if (meta != null && meta.accessTypes.isNotEmpty) ...[
                  FormLabel(l10n.chargingAccessType, optional: true),
                  DropdownButtonFormField<String?>(
                    initialValue: _access,
                    isExpanded: true,
                    items: [
                      DropdownMenuItem(value: null, child: Text(l10n.chargingNotSure)),
                      for (final a in meta.accessTypes) DropdownMenuItem(value: a.code, child: Text(a.label)),
                    ],
                    onChanged: (v) => setState(() => _access = v),
                  ),
                ],
                FormLabel(l10n.chargingSuggestConnectors, optional: true),
                for (final (i, c) in _connectors.indexed) _connectorRow(context, meta, i, c),
                if (_connectors.length < 20)
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: TextButton.icon(
                      onPressed: meta == null ? null : () => setState(() => _connectors.add(_ConnectorDraft())),
                      icon: const Icon(Icons.add),
                      label: Text(l10n.chargingSuggestAddConnector),
                    ),
                  ),
                FormLabel(l10n.chargingSuggestHours, optional: true),
                TextFormField(
                  controller: _hours,
                  maxLength: 500,
                  decoration: InputDecoration(hintText: l10n.chargingSuggestHoursHint),
                ),
                FormLabel(l10n.chargingSuggestNotes, optional: true),
                TextFormField(controller: _notes, maxLength: 2000, minLines: 2, maxLines: 5),
                Text(l10n.chargingSuggestReviewNote, style: theme.textTheme.bodySmall),
                const SizedBox(height: AppSpacing.lg),
                PrimaryButton(
                  label: l10n.chargingSend,
                  icon: Icons.send,
                  expand: true,
                  loading: _sending,
                  onPressed: _sending ? null : _submit,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _connectorRow(BuildContext context, StationMeta? meta, int i, _ConnectorDraft c) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final ref0 = meta?.connectorTypes.where((t) => t.code == c.typeCode).firstOrNull;
    final currents = [
      if (ref0 == null || ref0.supportsAc) CurrentType.ac,
      if (ref0 == null || ref0.supportsDc) CurrentType.dc,
    ];
    return Card(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(child: Text(l10n.chargingSuggestConnectorN(i + 1), style: Theme.of(context).textTheme.titleSmall)),
                IconButton(
                  tooltip: l10n.chargingRemove,
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () => setState(() => _connectors.removeAt(i).dispose()),
                ),
              ],
            ),
            DropdownButtonFormField<String>(
              initialValue: c.typeCode,
              isExpanded: true,
              decoration: InputDecoration(labelText: l10n.chargingConnectorType),
              items: [
                for (final t in meta?.connectorTypes ?? const <ConnectorTypeRef>[])
                  DropdownMenuItem(value: t.code, child: Text(t.name, overflow: TextOverflow.ellipsis)),
              ],
              onChanged: (v) => setState(() {
                c.typeCode = v;
                final r = meta?.connectorTypes.where((t) => t.code == v).firstOrNull;
                if (r != null && r.supportsAc != r.supportsDc) c.current = r.supportsDc ? CurrentType.dc : CurrentType.ac;
              }),
              validator: (v) => v == null ? l10n.chargingSuggestConnectorTypeRequired : null,
            ),
            const SizedBox(height: AppSpacing.sm),
            ChoicePills<CurrentType?>(
              options: {for (final ct in currents) ct: ct.apiValue},
              selected: c.current,
              onSelected: (v) => setState(() => c.current = v),
            ),
            const SizedBox(height: AppSpacing.sm),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: c.power,
                    decoration: InputDecoration(labelText: l10n.chargingMaxPower, suffixText: fmt.unitLabel(Unit.kW)),
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: TextFormField(
                    controller: c.quantity,
                    decoration: InputDecoration(labelText: l10n.chargingSuggestQuantity),
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
