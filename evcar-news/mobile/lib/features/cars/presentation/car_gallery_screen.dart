import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Licensed photo gallery of a car (`/cars/:slug/gallery`) with zoom (photo_view) and credits.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `cars` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class CarGalleryScreen extends StatelessWidget {
  const CarGalleryScreen({super.key, required this.slug});

  /// Car (model) slug.
  final String slug;

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(title: context.l10n.carsGalleryTitle, requestedPath: AppRoutes.carGallery(slug));
  }
}
