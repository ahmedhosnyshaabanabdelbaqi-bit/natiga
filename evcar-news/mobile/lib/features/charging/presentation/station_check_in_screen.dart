import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Community check-in at a station (`/charging/stations/:id/check-in`): dated, shown as community data, never as live availability.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `charging` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class StationCheckInScreen extends StatelessWidget {
  const StationCheckInScreen({super.key, required this.stationId});

  /// Station id.
  final String stationId;

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(
      title: context.l10n.chargingCheckInTitle,
      requestedPath: AppRoutes.stationCheckIn(stationId),
    );
  }
}
