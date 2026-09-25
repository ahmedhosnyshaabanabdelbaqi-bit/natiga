import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Car page (`/cars/:slug`, deep link `https://evcar.news/cars/<slug>`): variants, local price with source/type/date, specs with reliability, tabs (reviews, news, owners, 360° tours, rivals).
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `cars` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class CarDetailScreen extends StatelessWidget {
  const CarDetailScreen({super.key, required this.slug});

  /// Car (model or variant) slug from the URL.
  final String slug;

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(title: context.l10n.carsDetailTitle, requestedPath: AppRoutes.car(slug));
  }
}
