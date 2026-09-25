import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';
import '../../auth/presentation/auth_gate.dart';

/// One car of the garage (`/garage/:id`): trim, market, compatible connectors, linked charging log and reminders.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `garage` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class GarageVehicleScreen extends StatelessWidget {
  const GarageVehicleScreen({super.key, required this.vehicleId});

  /// User vehicle id.
  final String vehicleId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.garageVehicleTitle)),
      body: AuthGate(
        returnTo: AppRoutes.garageVehicle(vehicleId),
        builder: (context, user) => UnderConstructionView(requestedPath: AppRoutes.garageVehicle(vehicleId)),
      ),
    );
  }
}
