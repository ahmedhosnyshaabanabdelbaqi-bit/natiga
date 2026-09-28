import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/l10n/l10n.dart';
import '../domain/article.dart';
import '../domain/news_query.dart';
import 'widgets/news_browser.dart';

/// News list (`/news`, optional `?type=` and `?category=`): latest news,
/// reviews and guides with category chips, filters (sort, type, all markets,
/// language), infinite scroll, pull-to-refresh and the "Saved offline" list.
class NewsListScreen extends StatelessWidget {
  const NewsListScreen({super.key, this.now});

  /// Injectable clock for tests.
  final DateTime? now;

  static NewsQuery _initialQuery(BuildContext context) {
    Map<String, String> params;
    try {
      params = GoRouterState.of(context).uri.queryParameters;
    } on GoError {
      params = const {};
    }
    final type = params['type'];
    final category = params['category']?.trim();
    return NewsQuery(
      type: ArticleTypes.all.contains(type) ? type : null,
      category: (category == null || category.isEmpty) ? null : category,
    );
  }

  @override
  Widget build(BuildContext context) {
    return NewsBrowser(
      title: context.l10n.newsListTitle,
      initialQuery: _initialQuery(context),
      showCategoryChips: true,
      showSavedChip: true,
      now: now,
    );
  }
}
