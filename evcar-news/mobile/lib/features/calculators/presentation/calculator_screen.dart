import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// One calculator (`/calculators/:kind`, see CalculatorKinds): every formula, unit and assumption visible and editable.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `calculators` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class CalculatorScreen extends StatelessWidget {
  const CalculatorScreen({super.key, required this.kind});

  /// Calculator id (CalculatorKinds).
  final String kind;

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(
      title: context.l10n.calculatorsCalculatorTitle,
      requestedPath: AppRoutes.calculator(kind),
    );
  }
}
