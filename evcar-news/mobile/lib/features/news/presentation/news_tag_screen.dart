import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Articles with one tag (`/news/tag/:slug`).
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `news` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class NewsTagScreen extends StatelessWidget {
  const NewsTagScreen({super.key, required this.slug});

  /// Tag slug.
  final String slug;

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(title: context.l10n.newsTagTitle, requestedPath: AppRoutes.newsTag(slug));
  }
}
