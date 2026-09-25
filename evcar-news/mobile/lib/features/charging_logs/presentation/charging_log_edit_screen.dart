import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';
import '../../auth/presentation/auth_gate.dart';

/// New (`/charging-logs/new`) or edit (`/charging-logs/:id/edit`) a charging session: date, energy, cost, odometer, location type.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `charging_logs` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class ChargingLogEditScreen extends StatelessWidget {
  const ChargingLogEditScreen({super.key, this.logId});

  /// Log entry id; null for a new entry.
  final String? logId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.chargingLogsNewTitle)),
      body: AuthGate(
        returnTo: logId == null ? AppRoutes.chargingLogNew : AppRoutes.chargingLogEdit(logId!),
        builder: (context, user) => UnderConstructionView(
          requestedPath: logId == null ? AppRoutes.chargingLogNew : AppRoutes.chargingLogEdit(logId!),
        ),
      ),
    );
  }
}
