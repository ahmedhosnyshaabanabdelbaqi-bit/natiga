import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Shared comparison (`/compare/s/:shareId`, deep link `https://evcar.news/compare/<shareId>`).
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `compare` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class SharedComparisonScreen extends StatelessWidget {
  const SharedComparisonScreen({super.key, required this.shareId});

  /// Share id from the link.
  final String shareId;

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(
      title: context.l10n.compareSharedTitle,
      requestedPath: AppRoutes.sharedComparison(shareId),
    );
  }
}
