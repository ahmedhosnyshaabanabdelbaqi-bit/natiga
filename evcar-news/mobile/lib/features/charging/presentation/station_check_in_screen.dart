import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/router/app_routes.dart';
import '../../../shared/widgets/kit.dart';
import '../../auth/presentation/auth_gate.dart';
import '../application/charging_providers.dart';
import '../data/stations_repository.dart';
import '../domain/station_models.dart';
import 'widgets/form_parts.dart';

/// Community check-in (`/charging/stations/:id/check-in`, signed in): how a
/// charge went. Shown on the station page as dated community data, never as
/// live availability.
class StationCheckInScreen extends ConsumerWidget {
  const StationCheckInScreen({super.key, required this.stationId});

  /// Station id.
  final String stationId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return AppScaffold(
      title: l10n.chargingCheckInTitle,
      body: AuthGate(
        returnTo: AppRoutes.stationCheckIn(stationId),
        guestMessage: l10n.chargingCheckInSignIn,
        builder: (context, _) => _CheckInForm(stationId: stationId),
      ),
    );
  }
}

class _CheckInForm extends ConsumerStatefulWidget {
  const _CheckInForm({required this.stationId});

  final String stationId;

  @override
  ConsumerState<_CheckInForm> createState() => _CheckInFormState();
}

class _CheckInFormState extends ConsumerState<_CheckInForm> {
  final _power = TextEditingController();
  final _wait = TextEditingController();
  final _comment = TextEditingController();
  String? _outcome;
  String? _connectorId;
  String? _variantId;
  bool _sending = false;
  String? _sentStatus;
  String? _error;
  String? _powerError;
  String? _waitError;

  @override
  void dispose() {
    _power.dispose();
    _wait.dispose();
    _comment.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final l10n = context.l10n;
    final power = _power.text.trim().isEmpty ? null : double.tryParse(_power.text.trim().replaceAll(',', '.'));
    final wait = _wait.text.trim().isEmpty ? null : int.tryParse(_wait.text.trim());
    setState(() {
      _powerError = _power.text.trim().isNotEmpty && (power == null || power <= 0 || power > 1000)
          ? l10n.chargingInvalidPower
          : null;
      _waitError = _wait.text.trim().isNotEmpty && (wait == null || wait < 0 || wait > 1440) ? l10n.chargingInvalidWait : null;
    });
    if (_powerError != null || _waitError != null || _outcome == null) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final status = await ref.read(stationsRepositoryProvider).checkIn(
        widget.stationId,
        outcome: _outcome!,
        connectorId: _connectorId,
        variantId: _variantId,
        observedPowerKw: power,
        waitMinutes: wait,
        comment: _comment.text,
      );
      if (!mounted) return;
      ref.invalidate(stationDetailProvider(widget.stationId));
      setState(() {
        _sending = false;
        _sentStatus = status ?? 'approved';
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
    if (_sentStatus != null) {
      return SubmittedView(
        title: l10n.chargingCheckInSentTitle,
        message: _sentStatus == 'pending' ? l10n.chargingCheckInPending : l10n.chargingCheckInSentMessage,
      );
    }
    final meta = ref.watch(stationMetaProvider);
    final station = ref.watch(stationDetailProvider(widget.stationId)).value?.station;
    final cars = ref.watch(myChargingCarsProvider).value ?? const <GarageCar>[];
    final fmt = AppFormatters.of(context);
    return AsyncStateView(
      value: meta,
      onRetry: () => ref.invalidate(stationMetaProvider),
      builder: (context, res) {
        final outcomes = res.data.checkinOutcomes;
        final connectors = station?.allConnectors ?? const <StationConnector>[];
        return ListView(
          padding: EdgeInsetsDirectional.fromSTEB(context.pageGutter, AppSpacing.lg, context.pageGutter, AppSpacing.xxxl),
          children: [
            ResponsiveCenter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (station != null)
                    Text(station.name, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: AppSpacing.xs),
                  Text(l10n.chargingCheckInIntro),
                  if (_error != null) ...[const SizedBox(height: AppSpacing.lg), FormErrorBanner(message: _error!)],
                  FormLabel(l10n.chargingCheckInHowWasIt),
                  RadioGroup<String>(
                    groupValue: _outcome,
                    onChanged: (v) => setState(() => _outcome = v),
                    child: Column(
                      children: [
                        for (final o in outcomes)
                          RadioListTile<String>(contentPadding: EdgeInsets.zero, value: o.code, title: Text(o.label)),
                      ],
                    ),
                  ),
                  if (connectors.isNotEmpty) ...[
                    FormLabel(l10n.chargingCheckInConnector, optional: true),
                    DropdownButtonFormField<String?>(
                      initialValue: _connectorId,
                      isExpanded: true,
                      items: [
                        DropdownMenuItem(value: null, child: Text(l10n.chargingNotSure)),
                        for (final c in connectors)
                          DropdownMenuItem(
                            value: c.id,
                            child: Text(
                              [c.typeName, ?c.currentType?.apiValue, ?fmt.powerKw(c.maxPowerKw)].join(' · '),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                      ],
                      onChanged: (v) => setState(() => _connectorId = v),
                    ),
                  ],
                  if (cars.isNotEmpty) ...[
                    FormLabel(l10n.chargingCheckInCar, optional: true),
                    DropdownButtonFormField<String?>(
                      initialValue: _variantId,
                      isExpanded: true,
                      items: [
                        DropdownMenuItem(value: null, child: Text(l10n.chargingCheckInNoCar)),
                        for (final c in cars.where((c) => c.variantId != null))
                          DropdownMenuItem(value: c.variantId, child: Text(c.displayName, overflow: TextOverflow.ellipsis)),
                      ],
                      onChanged: (v) => setState(() => _variantId = v),
                    ),
                  ],
                  FormLabel(l10n.chargingCheckInPower, optional: true),
                  TextField(
                    controller: _power,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                    decoration: InputDecoration(suffixText: fmt.unitLabel(Unit.kW), errorText: _powerError),
                  ),
                  FormLabel(l10n.chargingCheckInWait, optional: true),
                  TextField(
                    controller: _wait,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: InputDecoration(suffixText: l10n.chargingMinutesUnit, errorText: _waitError),
                  ),
                  FormLabel(l10n.chargingCheckInComment, optional: true),
                  TextField(controller: _comment, minLines: 2, maxLines: 5, maxLength: 2000),
                  Text(l10n.chargingCheckInPublicNote, style: theme.textTheme.bodySmall),
                  const SizedBox(height: AppSpacing.lg),
                  PrimaryButton(
                    label: l10n.chargingSend,
                    icon: Icons.send,
                    expand: true,
                    loading: _sending,
                    onPressed: _outcome == null || _sending ? null : _submit,
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}
