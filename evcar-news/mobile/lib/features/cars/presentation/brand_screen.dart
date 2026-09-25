import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Brand page (`/brands/:slug`).
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `cars` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class BrandScreen extends StatelessWidget {
  const BrandScreen({super.key, required this.slug});

  /// Brand slug.
  final String slug;

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(title: context.l10n.carsBrandTitle, requestedPath: AppRoutes.brand(slug));
  }
}
