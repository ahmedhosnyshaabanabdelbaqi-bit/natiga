import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../shared/widgets/kit.dart';
import '../application/community_providers.dart';
import '../domain/community_models.dart';
import 'widgets/comments_section.dart';
import 'widgets/community_ui.dart';

/// Comments of an article (`/news/:slug/comments`). Reading is public;
/// writing needs an account (report / block / moderation states included).
///
/// The article is resolved from its slug (`GET /articles/:slug`) for its id
/// and `allowComments`; the thread itself is the reusable [CommentsSection].
class ArticleCommentsScreen extends ConsumerWidget {
  const ArticleCommentsScreen({super.key, required this.articleSlug});

  /// Article slug.
  final String articleSlug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final article = ref.watch(communityArticleProvider(articleSlug));
    return AppScaffold.slivers(
      title: l10n.communityCommentsTitle,
      onRefresh: () async {
        final a = article.value;
        ref.invalidate(communityArticleProvider(articleSlug));
        if (a != null) ref.invalidate(commentsControllerProvider);
      },
      slivers: [
        SliverResponsivePadding(
          maxWidth: kMaxReadableWidth,
          sliver: SliverAsyncStateView<CommunityArticle>(
            value: article,
            onRetry: () => ref.invalidate(communityArticleProvider(articleSlug)),
            loading: const Skeleton(child: SkeletonList(item: ListTileSkeleton(), count: 4)),
            builder: (context, a) => SliverList.list(
              children: [
                const SizedBox(height: AppSpacing.sm),
                _ArticleLink(article: a),
                CommentsSection(
                  targetType: CommunityTargetTypes.article,
                  targetId: a.id,
                  allowComments: a.allowComments,
                  padding: EdgeInsets.zero,
                ),
                const SizedBox(height: AppSpacing.xxxl),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ArticleLink extends StatelessWidget {
  const _ArticleLink({required this.article});

  final CommunityArticle article;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      onTap: () => context.push(AppRoutes.article(article.slug)),
      semanticLabel: l10n.communityOnArticle(article.title),
      child: Row(
        children: [
          Icon(Icons.article_outlined, color: theme.colorScheme.primary),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l10n.communityOnArticleLabel,
                  style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
                Text(article.title, maxLines: 3, overflow: TextOverflow.ellipsis, style: theme.textTheme.titleSmall),
                if (article.isDemo) ...[const SizedBox(height: AppSpacing.xs), const DemoTargetNotice()],
              ],
            ),
          ),
          const Icon(Icons.chevron_right),
        ],
      ),
    );
  }
}
