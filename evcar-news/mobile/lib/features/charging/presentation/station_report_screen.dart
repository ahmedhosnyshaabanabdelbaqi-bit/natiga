import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Report a station problem (`/charging/stations/:id/report`): not working, wrong location, different connector, price changed, access restricted; reviewed by moderators.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `charging` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class StationReportScreen extends StatelessWidget {
  const StationReportScreen({super.key, required this.stationId});

  /// Station id.
  final String stationId;

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(
      title: context.l10n.chargingReportTitle,
      requestedPath: AppRoutes.stationReport(stationId),
    );
  }
}
