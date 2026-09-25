import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Choose a city or point manually (`/charging/location`) — the alternative when location permission is denied (REQUIREMENTS §19).
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `charging` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class ChargingLocationScreen extends StatelessWidget {
  const ChargingLocationScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(
      title: context.l10n.chargingLocationTitle,
      requestedPath: AppRoutes.chargingLocation,
    );
  }
}
