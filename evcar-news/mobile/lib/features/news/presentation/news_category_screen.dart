import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Articles of one category (`/news/category/:slug`), newest first, with pull-to-refresh and pagination.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `news` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class NewsCategoryScreen extends StatelessWidget {
  const NewsCategoryScreen({super.key, required this.slug});

  /// Category slug.
  final String slug;

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(title: context.l10n.newsCategoryTitle, requestedPath: AppRoutes.newsCategory(slug));
  }
}
