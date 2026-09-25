import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Station page (`/charging/stations/:id`): operational status, open-now and live availability shown separately, tariffs, reports, directions via external navigation apps.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `charging` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class StationDetailScreen extends StatelessWidget {
  const StationDetailScreen({super.key, required this.stationId});

  /// Station id.
  final String stationId;

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(
      title: context.l10n.chargingStationTitle,
      requestedPath: AppRoutes.station(stationId),
    );
  }
}
