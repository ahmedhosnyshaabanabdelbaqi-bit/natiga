import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Suggest a missing station (`/charging/suggest`); suggestions are reviewed before publication.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `charging` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class StationSuggestScreen extends StatelessWidget {
  const StationSuggestScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(title: context.l10n.chargingSuggestTitle, requestedPath: AppRoutes.chargingSuggest);
  }
}
