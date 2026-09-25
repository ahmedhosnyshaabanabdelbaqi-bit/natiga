import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Trip planner (`/trips`): only shown when a routing provider is configured (feature flag); otherwise hidden with a clear message.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `trips` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class TripPlannerScreen extends StatelessWidget {
  const TripPlannerScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(title: context.l10n.tripsTitle, requestedPath: AppRoutes.trips);
  }
}
