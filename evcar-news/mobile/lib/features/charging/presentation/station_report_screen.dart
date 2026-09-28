import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/router/app_routes.dart';
import '../../../shared/widgets/kit.dart';
import '../../auth/presentation/auth_gate.dart';
import '../application/charging_providers.dart';
import '../data/stations_repository.dart';
import '../domain/station_models.dart';
import 'widgets/form_parts.dart';

/// Report a station problem (`/charging/stations/:id/report`, signed in):
/// not working, wrong location, different connector, price changed, access
/// restricted, other. Reasons and "requires details" come from
/// `/stations/meta`; reports are reviewed by moderators and never change
/// the station's status by themselves.
class StationReportScreen extends ConsumerWidget {
  const StationReportScreen({super.key, required this.stationId});

  /// Station id.
  final String stationId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return AppScaffold(
      title: l10n.chargingReportTitle,
      body: AuthGate(
        returnTo: AppRoutes.stationReport(stationId),
        guestMessage: l10n.chargingReportSignIn,
        builder: (context, _) => _ReportForm(stationId: stationId),
      ),
    );
  }
}

class _ReportForm extends ConsumerStatefulWidget {
  const _ReportForm({required this.stationId});

  final String stationId;

  @override
  ConsumerState<_ReportForm> createState() => _ReportFormState();
}

class _ReportFormState extends ConsumerState<_ReportForm> {
  final _details = TextEditingController();
  final _price = TextEditingController();
  String? _type;
  String? _connectorId;
  String? _seenConnectorType;
  bool _sending = false;
  bool _sent = false;
  String? _error;
  bool _showDetailsError = false;

  @override
  void dispose() {
    _details.dispose();
    _price.dispose();
    super.dispose();
  }

  Future<void> _submit(ReportTypeRef type) async {
    final l10n = context.l10n;
    if (type.requiresDetails && _details.text.trim().isEmpty) {
      setState(() => _showDetailsError = true);
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref.read(stationsRepositoryProvider).report(
        widget.stationId,
        type: type.code,
        connectorId: _connectorId,
        description: _details.text,
        suggestedData: {
          if (type.code == 'price_changed' && _price.text.trim().isNotEmpty) 'priceText': _price.text.trim(),
          if (type.code == 'different_connector' && _seenConnectorType != null) 'connectorTypeCode': _seenConnectorType,
        },
      );
      if (!mounted) return;
      ref.invalidate(stationDetailProvider(widget.stationId));
      setState(() {
        _sending = false;
        _sent = true;
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
    if (_sent) {
      return SubmittedView(title: l10n.chargingReportSentTitle, message: l10n.chargingReportSentMessage);
    }
    final meta = ref.watch(stationMetaProvider);
    final station = ref.watch(stationDetailProvider(widget.stationId)).value?.station;
    return AsyncStateView(
      value: meta,
      onRetry: () => ref.invalidate(stationMetaProvider),
      builder: (context, res) {
        final types = res.data.reportTypes;
        final selected = types.where((t) => t.code == _type).firstOrNull;
        final connectors = station?.allConnectors ?? const <StationConnector>[];
        return ListView(
          padding: EdgeInsetsDirectional.fromSTEB(context.pageGutter, AppSpacing.lg, context.pageGutter, AppSpacing.xxxl),
          children: [
            ResponsiveCenter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (station != null)
                    Text(station.name, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: AppSpacing.xs),
                  Text(l10n.chargingReportIntro),
                  if (_error != null) ...[const SizedBox(height: AppSpacing.lg), FormErrorBanner(message: _error!)],
                  FormLabel(l10n.chargingReportWhat),
                  RadioGroup<String>(
                    groupValue: _type,
                    onChanged: (v) => setState(() {
                      _type = v;
                      _showDetailsError = false;
                    }),
                    child: Column(
                      children: [
                        for (final t in types)
                          RadioListTile<String>(
                            contentPadding: EdgeInsets.zero,
                            value: t.code,
                            title: Text(t.label),
                            subtitle: t.help == null ? null : Text(t.help!),
                          ),
                      ],
                    ),
                  ),
                  if (connectors.isNotEmpty) ...[
                    FormLabel(l10n.chargingReportWhichConnector, optional: true),
                    DropdownButtonFormField<String?>(
                      initialValue: _connectorId,
                      isExpanded: true,
                      items: [
                        DropdownMenuItem(value: null, child: Text(l10n.chargingWholeStation)),
                        for (final c in connectors)
                          DropdownMenuItem(
                            value: c.id,
                            child: Text(
                              [c.typeName, ?c.currentType?.apiValue, ?AppFormatters.of(context).powerKw(c.maxPowerKw)].join(' · '),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                      ],
                      onChanged: (v) => setState(() => _connectorId = v),
                    ),
                  ],
                  if (_type == 'different_connector') ...[
                    FormLabel(l10n.chargingReportSeenConnector, optional: true),
                    DropdownButtonFormField<String?>(
                      initialValue: _seenConnectorType,
                      isExpanded: true,
                      items: [
                        DropdownMenuItem(value: null, child: Text(l10n.chargingNotSure)),
                        for (final c in res.data.connectorTypes) DropdownMenuItem(value: c.code, child: Text(c.name)),
                      ],
                      onChanged: (v) => setState(() => _seenConnectorType = v),
                    ),
                  ],
                  if (_type == 'price_changed') ...[
                    FormLabel(l10n.chargingReportNewPrice, optional: true),
                    TextField(
                      controller: _price,
                      maxLength: 200,
                      decoration: InputDecoration(hintText: l10n.chargingReportNewPriceHint),
                    ),
                  ],
                  FormLabel(l10n.chargingReportDetails, optional: !(selected?.requiresDetails ?? false)),
                  TextField(
                    controller: _details,
                    minLines: 3,
                    maxLines: 6,
                    maxLength: 2000,
                    decoration: InputDecoration(
                      hintText: l10n.chargingReportDetailsHint,
                      errorText: _showDetailsError ? l10n.chargingReportDetailsRequired : null,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(l10n.chargingReportModeration, style: Theme.of(context).textTheme.bodySmall),
                  const SizedBox(height: AppSpacing.lg),
                  PrimaryButton(
                    label: l10n.chargingSend,
                    icon: Icons.send,
                    expand: true,
                    loading: _sending,
                    onPressed: selected == null || _sending ? null : () => _submit(selected),
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
