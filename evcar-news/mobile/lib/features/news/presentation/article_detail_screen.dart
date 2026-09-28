import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:share_plus/share_plus.dart';

import '../../../app/di/providers.dart';
import '../../../app/router/app_routes.dart';
import '../../../app/router/deep_links.dart';
import '../../../app/theme/app_colors.dart';
import '../../../app/theme/app_theme.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/app_config/app_config_controller.dart';
import '../../../core/app_config/features.dart';
import '../../../core/errors/app_errors.dart';
import '../../../core/links/external_links.dart';
import '../../../shared/widgets/kit.dart';
import '../../community/domain/community_models.dart';
import '../../community/presentation/widgets/comments_section.dart';
import '../application/news_providers.dart';
import '../application/reader_settings.dart';
import '../data/news_repository.dart';
import '../domain/article.dart';
import 'widgets/article_body.dart';
import 'widgets/article_card.dart';
import 'widgets/news_labels.dart';
import 'widgets/reader_image.dart';
import 'widgets/reader_settings_sheet.dart';

/// Shares a text (article title + link). Overridable in tests.
final newsShareProvider = Provider<Future<void> Function(String text, {String? subject, Rect? origin})>(
  (ref) =>
      (text, {subject, origin}) =>
          SharePlus.instance.share(ShareParams(text: text, subject: subject, sharePositionOrigin: origin)),
);

/// Text direction of the article's own language (a fallback English text in
/// the Arabic UI must still read left-to-right, and vice versa).
TextDirection? articleTextDirection(ArticleSummary a) => switch (a.language) {
  'ar' => TextDirection.rtl,
  'en' => TextDirection.ltr,
  _ => null,
};

Widget _inArticleDirection(ArticleSummary a, Widget child) {
  final dir = articleTextDirection(a);
  return dir == null ? child : Directionality(textDirection: dir, child: child);
}

/// Public link of an article: the server's `shareUrl` when it is an https
/// evcar.news (or configured share host) link, else built from settings.
String articleShareUrl(ArticleSummary a, String shareBaseUrl) {
  final uri = Uri.tryParse(a.shareUrl ?? '');
  final baseHost = Uri.tryParse(shareBaseUrl)?.host.toLowerCase();
  if (uri != null &&
      uri.scheme == 'https' &&
      (deepLinkHosts.contains(uri.host.toLowerCase()) || uri.host.toLowerCase() == baseHost)) {
    return uri.toString();
  }
  return '$shareBaseUrl/n/${Uri.encodeComponent(a.slug)}';
}

/// Article reader (`/news/:slug`, deep link `https://evcar.news/n/<slug>`):
/// comfortable reading (text size, line spacing, reader theme), attribution
/// and corrections, event vs publication date, related articles and cars,
/// share, save for offline reading, favorite.
class ArticleDetailScreen extends ConsumerStatefulWidget {
  const ArticleDetailScreen({super.key, required this.slug, this.now});

  /// Article slug (or id) from the URL.
  final String slug;

  /// Injectable clock for tests.
  final DateTime? now;

  @override
  ConsumerState<ArticleDetailScreen> createState() => _ArticleDetailScreenState();
}

class _ArticleDetailScreenState extends ConsumerState<ArticleDetailScreen> {
  bool _viewRecorded = false;
  bool _saving = false;

  Future<void> _toggleSaved(ArticleDetail a) async {
    final l10n = context.l10n;
    final notifier = ref.read(savedArticlesProvider.notifier);
    if (ref.read(isArticleSavedProvider(a.id))) {
      await notifier.remove(a.id);
      if (mounted) showAppSnackBar(context, l10n.newsRemovedSnack, icon: Icons.delete_outline);
      return;
    }
    setState(() => _saving = true);
    try {
      final saved = await notifier.save(a);
      if (!mounted) return;
      final missing = saved.imagesExpected - saved.imageUrls.length;
      showAppSnackBar(
        context,
        missing > 0 ? l10n.newsSavedSnackPartial(missing) : l10n.newsSavedSnack,
        icon: Icons.download_done,
        tone: missing > 0 ? AppTone.warning : AppTone.success,
      );
    } on Object {
      if (mounted) showAppSnackBar(context, l10n.newsSaveFailed, tone: AppTone.danger, icon: Icons.error_outline);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _share(ArticleDetail a, BuildContext buttonContext) async {
    final base = ref.read(appConfigProvider).share.baseUrl;
    final url = articleShareUrl(a, base);
    final box = buttonContext.findRenderObject() as RenderBox?;
    final origin = box == null ? null : box.localToGlobal(Offset.zero) & box.size;
    try {
      await ref.read(newsShareProvider)('${a.title}\n$url', subject: a.title, origin: origin);
    } on Object {
      if (mounted) showAppSnackBar(context, context.l10n.commonErrorGeneric, tone: AppTone.danger);
    }
  }

  ThemeData? _readerTheme(ReaderTheme mode) {
    if (mode == ReaderTheme.app) return null;
    final branding = ref.watch(appConfigProvider.select((c) => c.branding));
    final primary = AppColors.parseHex(branding.primaryColor, AppColors.electricBlue);
    final accent = AppColors.parseHex(branding.accentColor, AppColors.cyan);
    return mode == ReaderTheme.dark
        ? AppTheme.dark(primary: primary, accent: accent)
        : AppTheme.light(primary: primary, accent: accent);
  }

  @override
  void initState() {
    super.initState();
    // Count one anonymous view per opening, only for a live (online) load.
    ref.listenManual<AsyncValue<ArticleView>>(articleViewProvider(widget.slug), (previous, next) {
      final view = next.value;
      if (!_viewRecorded && view != null && view.origin == ArticleOrigin.live) {
        _viewRecorded = true;
        ref.read(newsRepositoryProvider).recordView(view.article.slug);
      }
    }, fireImmediately: true);
  }

  @override
  Widget build(BuildContext context) {
    final provider = articleViewProvider(widget.slug);

    final value = ref.watch(provider);
    final settings = ref.watch(readerSettingsProvider);
    final l10n = context.l10n;

    Widget page;
    if (value.hasValue) {
      page = _reader(context, value.requireValue, settings);
    } else if (value.hasError) {
      page = AppScaffold(
        title: l10n.newsArticleTitle,
        body: _ArticleError(error: value.error!, onRetry: () => ref.invalidate(provider)),
      );
    } else {
      page = AppScaffold(title: '', body: const _ReaderSkeleton());
    }

    final theme = _readerTheme(settings.theme);
    return theme == null ? page : Theme(data: theme, child: page);
  }

  Widget _reader(BuildContext context, ArticleView view, ReaderSettings settings) {
    final l10n = context.l10n;
    final a = view.article;
    final isSaved = ref.watch(isArticleSavedProvider(a.id));
    final shareBase = ref.watch(appConfigProvider.select((c) => c.share.baseUrl));

    return AppScaffold.slivers(
      title: '',
      onRefresh: () async {
        ref.invalidate(articleViewProvider(widget.slug));
        try {
          await ref.read(articleViewProvider(widget.slug).future);
        } on Object {
          // Shown by the error state.
        }
      },
      actions: [
        IconButton(
          tooltip: l10n.newsReaderSettings,
          icon: const Icon(Icons.text_fields),
          onPressed: () => showReaderSettingsSheet(context),
        ),
        _saving
            ? Semantics(
                label: l10n.newsSavingOffline,
                liveRegion: true,
                child: const SizedBox.square(
                  dimension: kMinTouchTarget,
                  child: Padding(padding: EdgeInsets.all(14), child: CircularProgressIndicator(strokeWidth: 2.5)),
                ),
              )
            : IconButton(
                tooltip: isSaved ? l10n.newsSavedOfflineState : l10n.newsSaveOffline,
                isSelected: isSaved,
                icon: const Icon(Icons.download_for_offline_outlined),
                selectedIcon: const Icon(Icons.download_done),
                onPressed: () => _toggleSaved(a),
              ),
        FavoriteButton(item: articleFavoriteItem(a)),
        Builder(
          builder: (buttonContext) => IconButton(
            tooltip: l10n.commonShare,
            icon: Icon(Theme.of(context).platform == TargetPlatform.iOS ? Icons.ios_share : Icons.share_outlined),
            onPressed: () => _share(a, buttonContext),
          ),
        ),
      ],
      slivers: [
        if (view.isOfflineCopy && view.savedAt != null)
          SliverToBoxAdapter(
            child: CachedDataNotice(
              savedAt: view.savedAt!,
              now: widget.now,
              onRetry: () => ref.invalidate(articleViewProvider(widget.slug)),
            ),
          ),
        SliverResponsivePadding(
          maxWidth: kMaxReadableWidth,
          vertical: AppSpacing.md,
          sliver: SliverList.list(
            children: [
              _ArticleHeader(article: a, now: widget.now),
              if (a.coverImage != null) ...[
                const SizedBox(height: AppSpacing.lg),
                ReaderImage(
                  url: a.coverImage!.urlFor(MediaQuery.sizeOf(context).width * MediaQuery.devicePixelRatioOf(context)),
                  fallbackUrls: a.coverImage!.allUrls.toList(),
                  alt: a.coverImage!.alt,
                  aspectRatio: a.coverImage!.aspectRatio ?? 16 / 9,
                  localImages: view.localImages,
                  rights: ImageRights(
                    caption: a.coverImage!.caption,
                    credit: a.coverImage!.credit,
                    licenseType: a.coverImage!.licenseType,
                    licenseUrl: a.coverImage!.licenseUrl,
                    sourceUrl: a.coverImage!.sourceUrl,
                  ),
                ),
              ],
              const SizedBox(height: AppSpacing.lg),
              _inArticleDirection(
                a,
                ArticleBody(
                  html: a.bodyHtml,
                  baseUrl: shareBase,
                  fontScale: settings.fontScale,
                  lineHeight: settings.lineSpacing.height,
                  localImages: view.localImages,
                ),
              ),
              if (a.source != null) ...[const SizedBox(height: AppSpacing.lg), _SourceCard(source: a.source!)],
              if (a.corrections.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.lg),
                _CorrectionsCard(corrections: a.corrections),
              ],
              if (a.tags.isNotEmpty) ...[const SizedBox(height: AppSpacing.lg), _TagsSection(tags: a.tags)],
              if (a.relatedVehicles.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.lg),
                _RelatedCars(vehicles: a.relatedVehicles),
              ],
              if (a.allowComments && ref.watch(featureFlagProvider(Features.community))) ...[
                const SizedBox(height: AppSpacing.lg),
                // Latest comments inline; the full thread has its own page.
                CommentsSection(
                  targetType: CommunityTargetTypes.article,
                  targetId: a.id,
                  previewCount: 3,
                  padding: EdgeInsets.zero,
                  onViewAll: () => context.push(AppRoutes.articleComments(a.slug)),
                ),
              ],
            ],
          ),
        ),
        if (a.relatedArticles.isNotEmpty)
          SliverToBoxAdapter(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SectionHeader(title: l10n.newsRelatedArticlesTitle, icon: Icons.auto_stories_outlined),
                HorizontalCardList(
                  children: [
                    for (final r in a.relatedArticles)
                      ArticleCard(article: r, variant: NewsCardVariant.standard, now: widget.now),
                  ],
                ),
              ],
            ),
          ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Header: labels, title, summary, dates, notices
// ---------------------------------------------------------------------------

class _ArticleHeader extends ConsumerWidget {
  const _ArticleHeader({required this.article, this.now});

  final ArticleDetail article;
  final DateTime? now;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final fmt = AppFormatters.of(context);
    final a = article;
    final type = a.type == null || a.type == ArticleTypes.news ? null : newsTypeLabel(l10n, a.type);
    final market = ref.watch(effectiveMarketProvider);
    final marketName = context.languageCode == 'ar' ? market.nameAr : market.nameEn;

    final meta = <(IconData, String, String?)>[
      if (a.authorName != null) (Icons.person_outline, l10n.newsByAuthor(a.authorName!), null),
      if (a.publishedAt != null)
        (
          Icons.schedule,
          l10n.newsPublishedOn(friendlyTime(context, a.publishedAt, now: now)!),
          l10n.newsPublishedOn(fmt.dateTime(a.publishedAt)!),
        ),
      if (a.contentUpdatedAt != null)
        (
          Icons.update,
          l10n.newsUpdatedOn(friendlyTime(context, a.contentUpdatedAt, now: now)!),
          l10n.newsUpdatedOn(fmt.dateTime(a.contentUpdatedAt)!),
        ),
      if (a.readingMinutes != null) (Icons.timer_outlined, l10n.newsReadingTime(a.readingMinutes!), null),
    ];

    final notices = <(IconData, String, AppTone)>[
      if (a.isFallback && a.language != null)
        (
          Icons.translate,
          l10n.newsFallbackNotice(
            newsLanguageName(l10n, a.requestedLanguage ?? context.languageCode),
            newsLanguageName(l10n, a.language),
          ),
          AppTone.info,
        ),
      if (a.machineTranslated) (Icons.g_translate, l10n.newsMachineTranslated, AppTone.info),
      if (!a.marketMatch) (Icons.public, l10n.newsMarketMismatch(marketName), AppTone.warning),
      if (a.isDemo) (Icons.science_outlined, l10n.commonDemoDescription, AppTone.demo),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.xs,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            if (a.category != null)
              ActionChip(
                avatar: const Icon(Icons.folder_outlined, size: 18),
                label: Text(a.category!.name),
                onPressed: () => context.push(AppRoutes.newsCategory(a.category!.slug)),
                materialTapTargetSize: MaterialTapTargetSize.padded,
              ),
            if (type != null) Pill(label: type, icon: Icons.article_outlined, tone: AppTone.info),
            if (a.isSponsored) SponsoredLabel(sponsorName: a.sponsorName),
            if (a.isDemo) const DemoBadge(),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        Semantics(
          header: true,
          child: Text(
            a.title,
            textDirection: articleTextDirection(a),
            style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800, height: 1.35),
          ),
        ),
        if (a.summary != null) ...[
          const SizedBox(height: AppSpacing.md),
          Text(
            a.summary!,
            textDirection: articleTextDirection(a),
            style: theme.textTheme.titleMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w400,
              height: 1.6,
            ),
          ),
        ],
        if (a.eventDate != null) ...[
          const SizedBox(height: AppSpacing.md),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: Pill(
              label: l10n.newsEventDate(fmt.date(a.eventDate)!),
              icon: Icons.event_outlined,
              tone: AppTone.brand,
            ),
          ),
        ],
        if (meta.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: AppSpacing.lg,
            runSpacing: AppSpacing.xs,
            children: [
              for (final (icon, text, exact) in meta)
                Semantics(
                  label: exact ?? text,
                  excludeSemantics: true,
                  child: Tooltip(
                    message: exact ?? text,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(icon, size: 16, color: theme.colorScheme.onSurfaceVariant),
                        const SizedBox(width: AppSpacing.xs),
                        Flexible(
                          child: Text(
                            text,
                            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ],
        for (final (icon, text, tone) in notices) ...[
          const SizedBox(height: AppSpacing.sm),
          _Notice(icon: icon, text: text, tone: tone),
        ],
      ],
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.icon, required this.text, required this.tone});

  final IconData icon;
  final String text;
  final AppTone tone;

  @override
  Widget build(BuildContext context) {
    final colors = context.palette.tone(tone);
    return Semantics(
      container: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.container,
          borderRadius: AppRadii.control,
          border: Border.all(color: colors.border),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, size: 18, color: colors.onContainer),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(text, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: colors.onContainer)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Source, corrections, tags, related cars
// ---------------------------------------------------------------------------

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.icon, required this.title, required this.child});

  final IconData icon;
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(icon, size: 20, color: theme.colorScheme.primary),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Semantics(header: true, child: Text(title, style: theme.textTheme.titleSmall)),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          child,
        ],
      ),
    );
  }
}

class _SourceCard extends StatelessWidget {
  const _SourceCard({required this.source});

  final ArticleSource source;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final url = source.url;
    final openable = url != null && Uri.tryParse(url)?.scheme == 'https';
    return _SectionCard(
      icon: Icons.link,
      title: l10n.newsSourceTitle,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (source.name != null)
            Text(source.name!, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
          if (source.attribution != null)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xs),
              child: Text(source.attribution!, style: theme.textTheme.bodySmall),
            ),
          if (openable)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xs),
              child: TextButton.icon(
                onPressed: () => openExternalUrl(context, url),
                icon: const Icon(Icons.open_in_new),
                label: Text(l10n.newsSourceOpen),
              ),
            ),
        ],
      ),
    );
  }
}

class _CorrectionsCard extends StatelessWidget {
  const _CorrectionsCard({required this.corrections});

  final List<ArticleCorrection> corrections;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final fmt = AppFormatters.of(context);
    final sorted = [...corrections]
      ..sort((a, b) => (b.correctedAt ?? DateTime(0)).compareTo(a.correctedAt ?? DateTime(0)));
    return _SectionCard(
      icon: Icons.fact_check_outlined,
      title: l10n.newsCorrectionsTitle,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final c in sorted)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.sm),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: AppSpacing.sm,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Pill(
                        label: newsCorrectionKindLabel(l10n, c.kind),
                        dense: true,
                        tone: c.kind == CorrectionKinds.correction ? AppTone.warning : AppTone.info,
                        icon: c.kind == CorrectionKinds.correction ? Icons.edit_note : Icons.info_outline,
                      ),
                      Text(fmt.date(c.correctedAt) ?? l10n.commonNotAvailable, style: theme.textTheme.labelMedium),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    c.note,
                    style: theme.textTheme.bodyMedium,
                    textDirection: c.noteLanguage == 'ar'
                        ? TextDirection.rtl
                        : (c.noteLanguage == 'en' ? TextDirection.ltr : null),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _TagsSection extends StatelessWidget {
  const _TagsSection({required this.tags});

  final List<TaxonomyRef> tags;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(header: true, child: Text(l10n.newsTagsTitle, style: Theme.of(context).textTheme.titleSmall)),
        const SizedBox(height: AppSpacing.sm),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.xs,
          children: [
            for (final t in tags)
              ActionChip(
                avatar: const Icon(Icons.tag, size: 18),
                label: Text(t.name),
                onPressed: () => context.push(AppRoutes.newsTag(t.slug)),
                materialTapTargetSize: MaterialTapTargetSize.padded,
              ),
          ],
        ),
      ],
    );
  }
}

class _RelatedCars extends ConsumerWidget {
  const _RelatedCars({required this.vehicles});

  final List<RelatedVehicle> vehicles;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final carsOn = ref.watch(featureFlagProvider(Features.cars));
    return _SectionCard(
      icon: Icons.directions_car_outlined,
      title: l10n.newsRelatedCarsTitle,
      child: Column(
        children: [
          for (final v in vehicles)
            ListTile(
              contentPadding: EdgeInsets.zero,
              minTileHeight: kMinTouchTarget,
              leading: Icon(v.type == 'brand' ? Icons.verified_outlined : Icons.electric_car_outlined),
              title: Text(v.name),
              subtitle: Text(
                [
                  if (v.type == 'brand') l10n.newsVehicleBrand,
                  if (v.type == 'model') l10n.newsVehicleModel,
                  if (v.type != 'brand' && v.brandName != null) v.brandName!,
                  if (v.modelYear != null) l10n.newsVehicleModelYear('${v.modelYear}'),
                ].join(' · '),
                style: theme.textTheme.bodySmall,
              ),
              trailing: carsOn ? const Icon(Icons.chevron_right) : null,
              onTap: carsOn
                  ? () => context.push(switch (v.type) {
                      'brand' => AppRoutes.brand(v.slug),
                      'variant' => AppRoutes.variant(v.slug),
                      _ => AppRoutes.car(v.slug),
                    })
                  : null,
            ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Loading / error
// ---------------------------------------------------------------------------

class _ReaderSkeleton extends StatelessWidget {
  const _ReaderSkeleton();

  @override
  Widget build(BuildContext context) {
    return Skeleton(
      semanticLabel: context.l10n.commonLoading,
      child: ResponsiveCenter(
        child: ListView(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
          physics: const NeverScrollableScrollPhysics(),
          children: const [
            SkeletonBox(width: 96, height: 28, radius: 999),
            SizedBox(height: AppSpacing.md),
            SkeletonLine(fontSize: 24),
            SizedBox(height: AppSpacing.xs),
            SkeletonLine(fontSize: 24, widthFactor: 0.7),
            SizedBox(height: AppSpacing.md),
            SkeletonLine(widthFactor: 0.5),
            SizedBox(height: AppSpacing.lg),
            SkeletonBox(aspectRatio: 16 / 9),
            SizedBox(height: AppSpacing.lg),
            SkeletonLine(fontSize: 17),
            SizedBox(height: AppSpacing.sm),
            SkeletonLine(fontSize: 17),
            SizedBox(height: AppSpacing.sm),
            SkeletonLine(fontSize: 17, widthFactor: 0.8),
          ],
        ),
      ),
    );
  }
}

class _ArticleError extends StatelessWidget {
  const _ArticleError({required this.error, required this.onRetry});

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final browse = StateAction(
      label: l10n.newsBrowseAll,
      icon: Icons.newspaper_outlined,
      onPressed: () => context.go(AppRoutes.news),
    );
    final e = error;
    if (e is ApiException && e.kind == ApiErrorKind.notFound) {
      return StateMessageView(
        kind: StateKind.empty,
        icon: Icons.article_outlined,
        title: l10n.newsNotFoundTitle,
        message: l10n.newsNotFoundMessage,
        actions: [browse],
      );
    }
    if (classifyError(e) == ErrorStateKind.offline) {
      return OfflineState(message: l10n.newsOfflineNoCopyMessage, onRetry: onRetry);
    }
    return ErrorState(error: e, onRetry: onRetry, actions: [browse]);
  }
}
