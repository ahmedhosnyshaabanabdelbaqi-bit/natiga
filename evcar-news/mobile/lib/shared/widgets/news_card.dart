import 'package:flutter/material.dart';

import '../../app/theme/app_palette.dart';
import '../../app/theme/app_tokens.dart';
import '../../core/l10n/l10n.dart';
import 'app_card.dart';
import 'badges.dart';
import 'image_with_fallback.dart';

/// Layouts of [NewsCard].
enum NewsCardVariant {
  /// Top story: large image, title over a scrim (stacks below the image at
  /// large text sizes so nothing is clipped).
  hero,

  /// Image on top, title, two-line summary, meta line.
  standard,

  /// List row: thumbnail at the start, title and meta.
  compact,
}

/// Article card for news, reviews and guides.
///
/// Sponsored content is always labelled ([isSponsored] → "Sponsored by …")
/// and demo records carry the demo badge. [trailingAction] (e.g. a
/// `FavoriteButton`) stays a separate accessible button; the rest of the card
/// reads as one element: "title, category, time, sponsored, demo".
///
/// ```dart
/// NewsCard(
///   variant: NewsCardVariant.compact,
///   title: a.title,
///   imageUrl: a.coverImage?.url,
///   imageCredit: a.coverImage?.credit,
///   category: a.category?.name,
///   publishedAt: a.publishedAt,
///   isSponsored: a.isSponsored,
///   sponsorName: a.sponsorName,
///   isDemo: a.isDemo,
///   onTap: () => context.push(AppRoutes.article(a.slug)),
/// )
/// ```
class NewsCard extends StatelessWidget {
  const NewsCard({
    super.key,
    required this.title,
    this.variant = NewsCardVariant.standard,
    this.summary,
    this.imageUrl,
    this.imageAlt,
    this.imageCredit,
    this.category,
    this.publishedAt,
    this.sourceName,
    this.isSponsored = false,
    this.sponsorName,
    this.isDemo = false,
    this.badges = const [],
    this.onTap,
    this.trailingAction,
    this.now,
  });

  final String title;
  final NewsCardVariant variant;
  final String? summary;
  final String? imageUrl;
  final String? imageAlt;
  final String? imageCredit;
  final String? category;
  final DateTime? publishedAt;
  final String? sourceName;
  final bool isSponsored;
  final String? sponsorName;
  final bool isDemo;

  /// Extra pills (e.g. "Shown in English").
  final List<Widget> badges;
  final VoidCallback? onTap;
  final Widget? trailingAction;

  /// Injectable clock for tests.
  final DateTime? now;

  String _semantics(BuildContext context, String? time) {
    final l10n = context.l10n;
    return [
      title,
      ?category,
      ?time,
      ?sourceName,
      if (isSponsored)
        (sponsorName == null || sponsorName!.trim().isEmpty)
            ? l10n.commonSponsoredLabel
            : l10n.commonSponsoredBy(sponsorName!),
      if (isDemo) l10n.commonDemoLabel,
    ].join('. ');
  }

  List<Widget> _pills({bool dense = true}) => [
    if (isSponsored) SponsoredLabel(sponsorName: sponsorName, dense: dense),
    if (isDemo) DemoBadge(dense: dense),
    ...badges,
  ];

  @override
  Widget build(BuildContext context) {
    final time = friendlyTime(context, publishedAt, now: now);
    final body = switch (variant) {
      NewsCardVariant.hero => _hero(context, time),
      NewsCardVariant.standard => _standard(context, time),
      NewsCardVariant.compact => _compact(context, time),
    };
    final card = AppCard(
      padding: EdgeInsets.zero,
      onTap: onTap,
      semanticLabel: _semantics(context, time),
      child: ExcludeSemantics(child: body),
    );
    if (trailingAction == null) return card;
    return Stack(
      children: [
        card,
        PositionedDirectional(
          top: AppSpacing.xs,
          end: AppSpacing.xs,
          child: _ActionBackdrop(onImage: variant != NewsCardVariant.compact, child: trailingAction!),
        ),
      ],
    );
  }

  Widget _meta(BuildContext context, String? time, {Color? color}) {
    final theme = Theme.of(context);
    final style = theme.textTheme.labelMedium?.copyWith(
      color: color ?? theme.colorScheme.onSurfaceVariant,
      fontWeight: FontWeight.w500,
    );
    final parts = [?sourceName, ?time];
    if (parts.isEmpty) return const SizedBox.shrink();
    return Text(parts.join(' · '), style: style, maxLines: 2, overflow: TextOverflow.ellipsis);
  }

  Widget _category(BuildContext context, {bool onImage = false}) {
    if (category == null) return const SizedBox.shrink();
    final theme = Theme.of(context);
    return Text(
      category!.toUpperCase(),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: theme.textTheme.labelMedium?.copyWith(
        color: onImage ? Colors.white.withValues(alpha: 0.9) : theme.colorScheme.primary,
        fontWeight: FontWeight.w700,
      ),
    );
  }

  Widget _hero(BuildContext context, String? time) {
    final theme = Theme.of(context);
    final overlayText = context.textScale <= 1.3;
    final pills = _pills();
    if (!overlayText) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (isLoadableImageUrl(imageUrl))
            ImageWithFallback(
              url: imageUrl,
              semanticLabel: imageAlt,
              credit: imageCredit,
              aspectRatio: 16 / 9,
              fallbackIcon: Icons.article_outlined,
              showFallbackText: false,
            )
          else
            AspectRatio(
              aspectRatio: 16 / 9,
              child: DecoratedBox(
                decoration: BoxDecoration(gradient: context.palette.brandGradient),
                child: Center(child: Icon(Icons.bolt, size: 64, color: Colors.white.withValues(alpha: 0.3))),
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _category(context),
                const SizedBox(height: AppSpacing.xs),
                Text(title, style: theme.textTheme.headlineSmall),
                if (pills.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.sm),
                  Wrap(spacing: 6, runSpacing: 4, children: pills),
                ],
                const SizedBox(height: AppSpacing.sm),
                _meta(context, time),
              ],
            ),
          ),
        ],
      );
    }
    // Text over the image: the card is at least 4:3 and grows when the
    // title needs more room (never clipped).
    return LayoutBuilder(
      builder: (context, constraints) => Stack(
        children: [
          Positioned.fill(
            child: isLoadableImageUrl(imageUrl)
                ? ImageWithFallback(
                    url: imageUrl,
                    semanticLabel: imageAlt,
                    fallbackIcon: Icons.article_outlined,
                    showFallbackText: false,
                  )
                // No cover image: a calm brand background instead of an
                // empty placeholder behind the headline.
                : DecoratedBox(
                    decoration: BoxDecoration(gradient: context.palette.brandGradient),
                    child: Align(
                      alignment: AlignmentDirectional.topEnd,
                      child: Padding(
                        padding: const EdgeInsets.all(AppSpacing.lg),
                        child: Icon(Icons.bolt, size: 96, color: Colors.white.withValues(alpha: 0.18)),
                      ),
                    ),
                  ),
          ),
          Positioned.fill(
            child: DecoratedBox(decoration: BoxDecoration(gradient: context.palette.imageScrim)),
          ),
          if (imageCredit != null && imageCredit!.trim().isNotEmpty)
            PositionedDirectional(
              top: AppSpacing.sm,
              start: AppSpacing.sm,
              child: _HeroCredit(text: context.l10n.commonImageCredit(imageCredit!.trim())),
            ),
          ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxWidth * 3 / 4, minWidth: double.infinity),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.xxxl, AppSpacing.lg, AppSpacing.lg),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.end,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (pills.isNotEmpty) ...[
                    Wrap(spacing: 6, runSpacing: 4, children: pills),
                    const SizedBox(height: AppSpacing.sm),
                  ],
                  _category(context, onImage: true),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    title,
                    maxLines: 4,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.headlineSmall?.copyWith(color: Colors.white, height: 1.3),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  _meta(context, time, color: Colors.white.withValues(alpha: 0.85)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Titles may use more lines when the text is enlarged (never hide the
  /// headline from low-vision readers).
  static int _titleLines(BuildContext context) => context.textScale > 1.3 ? 6 : 3;

  Widget _standard(BuildContext context, String? time) {
    final theme = Theme.of(context);
    final pills = _pills();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ImageWithFallback(
          url: imageUrl,
          semanticLabel: imageAlt,
          credit: imageCredit,
          aspectRatio: 16 / 9,
          fallbackIcon: Icons.article_outlined,
          showFallbackText: false,
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.lg, AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _category(context),
              const SizedBox(height: AppSpacing.xs),
              Text(
                title,
                maxLines: _titleLines(context),
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
              ),
              if (summary != null && summary!.trim().isNotEmpty) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(
                  summary!,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
              ],
              if (pills.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.sm),
                Wrap(spacing: 6, runSpacing: 4, children: pills),
              ],
              const SizedBox(height: AppSpacing.sm),
              _meta(context, time),
            ],
          ),
        ),
      ],
    );
  }

  Widget _compact(BuildContext context, String? time) {
    final theme = Theme.of(context);
    final pills = _pills();
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ImageWithFallback(
            url: imageUrl,
            semanticLabel: imageAlt,
            width: 104,
            height: 78,
            borderRadius: AppRadii.image,
            fallbackIcon: Icons.article_outlined,
            showFallbackText: false,
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Padding(
              padding: EdgeInsetsDirectional.only(end: trailingAction == null ? 0 : 36),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _category(context),
                  Text(
                    title,
                    maxLines: _titleLines(context),
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  if (pills.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.xs),
                    Wrap(spacing: 6, runSpacing: 4, children: pills),
                  ],
                  const SizedBox(height: AppSpacing.xs),
                  _meta(context, time),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroCredit extends StatelessWidget {
  const _HeroCredit({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 220),
      child: DecoratedBox(
        decoration: BoxDecoration(color: const Color(0x80000000), borderRadius: BorderRadius.circular(AppRadii.xs)),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textScaler: TextScaler.noScaling,
            style: const TextStyle(color: Colors.white, fontSize: 10),
          ),
        ),
      ),
    );
  }
}

/// Circular translucent backdrop that keeps an icon button legible on
/// images.
class _ActionBackdrop extends StatelessWidget {
  const _ActionBackdrop({required this.child, required this.onImage});

  final Widget child;
  final bool onImage;

  @override
  Widget build(BuildContext context) {
    if (!onImage) return child;
    return DecoratedBox(
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Theme.of(context).colorScheme.surface.withValues(alpha: 0.85),
      ),
      child: child,
    );
  }
}
