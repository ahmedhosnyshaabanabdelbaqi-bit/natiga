import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';
import '../../auth/presentation/auth_gate.dart';

/// Add (`/garage/add`) or edit (`/garage/:id/edit`) a car: model → year → trim → market, nickname.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `garage` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class GarageVehicleEditScreen extends StatelessWidget {
  const GarageVehicleEditScreen({super.key, this.vehicleId});

  /// User vehicle id; null when adding.
  final String? vehicleId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.garageAddTitle)),
      body: AuthGate(
        returnTo: vehicleId == null ? AppRoutes.garageAdd : AppRoutes.garageVehicleEdit(vehicleId!),
        builder: (context, user) => UnderConstructionView(
          requestedPath: vehicleId == null ? AppRoutes.garageAdd : AppRoutes.garageVehicleEdit(vehicleId!),
        ),
      ),
    );
  }
}
