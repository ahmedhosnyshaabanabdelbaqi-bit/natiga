import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// Comments of an article (`/news/:slug/comments`); reading is public, writing needs an account; report/block/moderation.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `community` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class ArticleCommentsScreen extends StatelessWidget {
  const ArticleCommentsScreen({super.key, required this.articleSlug});

  /// Article slug.
  final String articleSlug;

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(
      title: context.l10n.communityCommentsTitle,
      requestedPath: AppRoutes.articleComments(articleSlug),
    );
  }
}
