import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/widgets/kit.dart';
import '../application/news_providers.dart';
import '../domain/news_query.dart';
import 'widgets/news_browser.dart';

/// Articles with one tag (`/news/tag/:slug`).
class NewsTagScreen extends ConsumerWidget {
  const NewsTagScreen({super.key, required this.slug, this.now});

  /// Tag slug.
  final String slug;

  /// Injectable clock for tests.
  final DateTime? now;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final tag = ref.watch(newsTagProvider(slug)).value?.data;
    return NewsBrowser(
      title: tag == null ? l10n.newsTagTitle : l10n.newsTagHeader(tag.name),
      initialQuery: NewsQuery(tag: slug),
      header: (tag?.isDemo ?? false)
          ? Padding(
              padding: EdgeInsetsDirectional.fromSTEB(
                context.pageGutter,
                AppSpacing.xs,
                context.pageGutter,
                AppSpacing.sm,
              ),
              child: const Align(alignment: AlignmentDirectional.centerStart, child: DemoBadge()),
            )
          : null,
      now: now,
    );
  }
}
