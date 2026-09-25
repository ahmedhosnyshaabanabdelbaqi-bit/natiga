import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Calculators (`/calculators`): home/public charging cost, charging time, cost per 100 km, monthly cost, fuel comparison, TCO.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `calculators` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class CalculatorsScreen extends StatelessWidget {
  const CalculatorsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(title: context.l10n.calculatorsTitle, requestedPath: AppRoutes.calculators);
  }
}
