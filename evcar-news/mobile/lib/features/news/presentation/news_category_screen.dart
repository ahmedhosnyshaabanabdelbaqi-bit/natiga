import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/widgets/kit.dart';
import '../application/news_providers.dart';
import '../domain/news_query.dart';
import 'widgets/news_browser.dart';

/// Articles of one category (`/news/category/:slug`, sub-categories
/// included), newest first, with filters, pull-to-refresh and pagination.
/// The title and description come from `GET /categories/:slug`; an unknown
/// category simply shows the empty state of its (empty) feed.
class NewsCategoryScreen extends ConsumerWidget {
  const NewsCategoryScreen({super.key, required this.slug, this.now});

  /// Category slug.
  final String slug;

  /// Injectable clock for tests.
  final DateTime? now;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final category = ref.watch(newsCategoryProvider(slug)).value?.data;
    final description = category?.description;
    return NewsBrowser(
      title: category?.name ?? l10n.newsCategoryTitle,
      initialQuery: NewsQuery(category: slug),
      header: (description == null && category?.isDemo != true)
          ? null
          : Padding(
              padding: EdgeInsetsDirectional.fromSTEB(
                context.pageGutter,
                AppSpacing.xs,
                context.pageGutter,
                AppSpacing.sm,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (category?.isDemo ?? false)
                    const Padding(
                      padding: EdgeInsets.only(bottom: AppSpacing.sm),
                      child: DemoBadge(),
                    ),
                  if (description != null)
                    Text(
                      description,
                      style: Theme.of(context).textTheme.bodyMedium
                          ?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
                    ),
                ],
              ),
            ),
      now: now,
    );
  }
}
