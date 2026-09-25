import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';
import '../../auth/presentation/auth_gate.dart';

/// Spending and consumption reports built only from the user's entries (`/charging-logs/reports`, fl_chart).
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `charging_logs` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class ChargingLogReportsScreen extends StatelessWidget {
  const ChargingLogReportsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.chargingLogsReportsTitle)),
      body: AuthGate(
        returnTo: AppRoutes.chargingLogReports,
        builder: (context, user) => const UnderConstructionView(requestedPath: AppRoutes.chargingLogReports),
      ),
    );
  }
}
