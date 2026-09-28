import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../shared/widgets/kit.dart';
import '../../domain/article.dart';
import 'news_labels.dart';

/// Favorite snapshot of an article (works offline in the favorites list).
FavoriteItem articleFavoriteItem(ArticleSummary a) => FavoriteItem(
  key: FavoriteKey(FavoriteType.article, a.id),
  title: a.title,
  subtitle: a.category?.name,
  imageUrl: a.coverImage?.url,
  route: AppRoutes.article(a.slug),
);

/// [NewsCard] bound to an [ArticleSummary]: cover + credit, category, time,
/// sponsored / demo labels, a "shown in `language`" pill for fallback texts,
/// the article type for non-news content, and a favorite toggle.
class ArticleCard extends StatelessWidget {
  const ArticleCard({
    super.key,
    required this.article,
    this.variant = NewsCardVariant.standard,
    this.showFavorite = true,
    this.onTap,
    this.extraBadges = const [],
    this.now,
  });

  final ArticleSummary article;
  final NewsCardVariant variant;
  final bool showFavorite;

  /// Defaults to opening the article.
  final VoidCallback? onTap;
  final List<Widget> extraBadges;
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final a = article;
    final type = a.type == null || a.type == ArticleTypes.news ? null : newsTypeLabel(l10n, a.type);
    final cover = a.coverImage;
    return NewsCard(
      variant: variant,
      title: a.title,
      summary: a.summary,
      imageUrl: cover?.urlFor(variant == NewsCardVariant.compact ? 240 : 960),
      imageAlt: cover?.alt,
      imageCredit: cover?.credit,
      category: a.category?.name,
      publishedAt: a.publishedAt,
      isSponsored: a.isSponsored,
      sponsorName: a.sponsorName,
      isDemo: a.isDemo,
      now: now,
      badges: [
        if (type != null) Pill(label: type, dense: true, tone: AppTone.info, icon: Icons.article_outlined),
        if (a.isFallback && a.language != null)
          Pill(label: l10n.newsShownInLanguage(newsLanguageName(l10n, a.language)), dense: true, icon: Icons.translate),
        ...extraBadges,
      ],
      onTap: onTap ?? () => context.push(AppRoutes.article(a.slug)),
      trailingAction: showFavorite ? FavoriteButton(item: articleFavoriteItem(a)) : null,
    );
  }
}
