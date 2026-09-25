import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Article reader (`/news/:slug`, deep link `https://evcar.news/n/<slug>`): comfortable reading, font size, save offline, share, related content.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `news` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class ArticleDetailScreen extends StatelessWidget {
  const ArticleDetailScreen({super.key, required this.slug});

  /// Article slug from the URL.
  final String slug;

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(title: context.l10n.newsArticleTitle, requestedPath: AppRoutes.article(slug));
  }
}
