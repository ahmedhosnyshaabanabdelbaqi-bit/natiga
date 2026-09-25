import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// All brands (`/brands`) with logos and model counts; brands without models in the selected market are marked, not hidden.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `cars` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class BrandsScreen extends StatelessWidget {
  const BrandsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(title: context.l10n.carsBrandsTitle, requestedPath: AppRoutes.brands);
  }
}
