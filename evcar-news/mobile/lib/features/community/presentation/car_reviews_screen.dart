import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Owner reviews of a car (`/cars/:slug/reviews`); no "verified owner" badge without a real verification; report/block.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `community` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class CarReviewsScreen extends StatelessWidget {
  const CarReviewsScreen({super.key, required this.carSlug});

  /// Car (model) slug.
  final String carSlug;

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(
      title: context.l10n.communityCarReviewsTitle,
      requestedPath: AppRoutes.carReviews(carSlug),
    );
  }
}
