import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Full spec sheet of one trim (`/variants/:slug`): specs grouped with source/reliability, prices per market with type and date, ranges with cycle, charging curve; can be saved for offline reading.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `cars` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class VariantDetailScreen extends StatelessWidget {
  const VariantDetailScreen({super.key, required this.slug});

  /// Variant (trim) slug.
  final String slug;

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(title: context.l10n.carsVariantTitle, requestedPath: AppRoutes.variant(slug));
  }
}
