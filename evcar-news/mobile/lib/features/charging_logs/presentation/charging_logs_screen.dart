import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';
import '../../auth/presentation/auth_gate.dart';

/// Charging log (`/charging-logs`): user-entered sessions and spending/consumption reports. Requires an account.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `charging_logs` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class ChargingLogsScreen extends StatelessWidget {
  const ChargingLogsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.chargingLogsTitle)),
      body: AuthGate(
        returnTo: AppRoutes.chargingLogs,
        builder: (context, user) => const UnderConstructionView(requestedPath: AppRoutes.chargingLogs),
      ),
    );
  }
}
