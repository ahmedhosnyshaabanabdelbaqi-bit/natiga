import 'package:flutter/material.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/l10n/l10n.dart';
import '../../../shared/widgets/under_construction_view.dart';

/// News list (`/news`): latest news, reviews and guides with category filters.
///
/// NOT IMPLEMENTED YET — honest placeholder owned by the `news` feature.
/// Replace this file (keep the class name and constructor, or update
/// lib/app/router/app_router.dart in the same change).
class NewsListScreen extends StatelessWidget {
  const NewsListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return UnderConstructionScreen(title: context.l10n.newsListTitle, requestedPath: AppRoutes.news);
  }
}
