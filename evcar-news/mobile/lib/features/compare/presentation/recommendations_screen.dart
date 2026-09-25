import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Recommendation wizard (`/recommendations`): usage, budget and home charging, with explained weights and missing data.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `compare` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class RecommendationsScreen extends StatelessWidget {
  const RecommendationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(
      title: context.l10n.compareRecommendationsTitle,
      requestedPath: AppRoutes.recommendations,
    );
  }
}
