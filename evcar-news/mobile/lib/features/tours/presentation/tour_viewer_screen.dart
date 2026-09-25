import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// 360° interior tour viewer (`/cars/:slug/tour/:tourId`): isolated WebView with bundled Pannellum (assets/panorama/viewer.html).
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `tours` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class TourViewerScreen extends StatelessWidget {
  const TourViewerScreen({super.key, required this.carSlug, required this.tourId});

  /// Car slug the tour belongs to.
  final String carSlug;

  /// Tour id.
  final String tourId;

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(
      title: context.l10n.toursViewerTitle,
      requestedPath: AppRoutes.tour(carSlug, tourId),
    );
  }
}
