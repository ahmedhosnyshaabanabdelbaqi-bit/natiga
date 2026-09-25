import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Station filters (`/charging/filters`): connector types, AC/DC and power, operator, open now, compatible with my car.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `charging` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class ChargingFiltersScreen extends StatelessWidget {
  const ChargingFiltersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(title: context.l10n.chargingFiltersTitle, requestedPath: AppRoutes.chargingFilters);
  }
}
