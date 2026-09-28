import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/cache/cached_fetch.dart';
import '../../../shared/widgets/kit.dart';
import '../../../shared/widgets/safe_html.dart';
import '../application/encyclopedia_providers.dart';
import '../domain/encyclopedia_models.dart';
import 'widgets/encyclopedia_widgets.dart';

/// Encyclopedia entry (`/encyclopedia/:slug`): reviewed badge with date,
/// the fixed electrical safety notice (before the text, never hidden),
/// sanitized body rendered natively, related entries.
class EncyclopediaEntryScreen extends ConsumerWidget {
  const EncyclopediaEntryScreen({super.key, required this.slug});

  /// Entry slug.
  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final provider = encyclopediaEntryProvider(slug);
    final value = ref.watch(provider);

    Future<void> refresh() async {
      ref.invalidate(provider);
      try {
        await ref.read(provider.future);
      } on Object {
        // Rendered below.
      }
    }

    return AppScaffold.slivers(
      title: l10n.encyclopediaTitle,
      onRefresh: refresh,
      slivers: [
        SliverAsyncStateView<CachedResult<EncyclopediaEntryDetail>>(
          value: value,
          onRetry: () => ref.invalidate(provider),
          loading: const _EntrySkeleton(),
          builder: (context, res) => SliverToBoxAdapter(
            child: ResponsiveCenter(
              child: _EntryBody(
                detail: res.data,
                cachedAt: res.fromCache ? res.savedAt : null,
                onRetry: () => ref.invalidate(provider),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _EntryBody extends StatelessWidget {
  const _EntryBody({required this.detail, required this.cachedAt, required this.onRetry});

  final EncyclopediaEntryDetail detail;
  final DateTime? cachedAt;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final fmt = AppFormatters.of(context);
    final e = detail.entry;
    final minutes = e.readingMinutes;
    final cover = e.coverImage;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (cachedAt != null) ...[
          CachedDataNotice(savedAt: cachedAt!, onRetry: onRetry),
          const SizedBox(height: AppSpacing.md),
        ],
        Row(
          children: [
            Icon(encyclopediaCategoryIcon(e.category.iconKey, e.category.key), size: 18, color: theme.colorScheme.primary),
            const SizedBox(width: AppSpacing.xs),
            Flexible(
              child: Text(e.category.name, style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.primary)),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        Semantics(
          header: true,
          child: Text(e.title, style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
        ),
        if (e.summary != null) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(e.summary!, style: theme.textTheme.bodyLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
        ],
        const SizedBox(height: AppSpacing.md),
        Wrap(
          spacing: AppSpacing.xs,
          runSpacing: AppSpacing.xs,
          children: [
            ReviewedBadge(review: e.review, withDate: true),
            if (minutes != null)
              Pill(
                icon: Icons.schedule,
                dense: true,
                label: l10n.encyclopediaReadingMinutes(minutes, fmt.number(minutes) ?? '$minutes'),
              ),
            if (e.isFallback && e.language != null)
              Pill(
                icon: Icons.translate,
                dense: true,
                label: l10n.encyclopediaShownInLanguage(encyclopediaLanguageName(l10n, e.language)),
              ),
            if (e.isDemo) const DemoBadge(dense: true),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        LastUpdatedText(time: e.updatedAt),
        if (e.isDemo) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(l10n.commonDemoDescription, style: theme.textTheme.bodySmall),
        ],
        if (detail.safetyNotice != null) ...[
          const SizedBox(height: AppSpacing.lg),
          SafetyNoticeCard(text: detail.safetyNotice!),
        ],
        if (cover != null) ...[
          const SizedBox(height: AppSpacing.lg),
          ImageWithFallback(
            url: cover.url,
            semanticLabel: cover.alt,
            credit: cover.credit,
            aspectRatio: cover.aspectRatio ?? 16 / 9,
            borderRadius: AppRadii.image,
          ),
        ],
        const SizedBox(height: AppSpacing.lg),
        if (detail.bodyHtml.trim().isEmpty)
          Text(l10n.commonNotAvailable, style: theme.textTheme.bodyLarge)
        else
          SafeHtml(html: detail.bodyHtml),
        const SizedBox(height: AppSpacing.xl),
        _ReviewExplainer(entry: e),
        if (detail.related.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xl),
          SectionHeader(title: l10n.encyclopediaRelated, icon: Icons.auto_stories_outlined, padding: EdgeInsets.zero),
          const SizedBox(height: AppSpacing.sm),
          for (final r in detail.related)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.cardGap),
              child: EncyclopediaEntryCard(entry: r),
            ),
        ],
        const SizedBox(height: AppSpacing.lg),
      ],
    );
  }
}

/// The fixed electrical safety notice (warning tone + icon + text).
class SafetyNoticeCard extends StatelessWidget {
  const SafetyNoticeCard({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final tone = context.palette.tone(AppTone.warning);
    return Semantics(
      container: true,
      label: '${l10n.encyclopediaSafetyTitle}. $text',
      excludeSemantics: true,
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: tone.container,
          borderRadius: AppRadii.card,
          border: Border.all(color: tone.border),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.warning_amber_rounded, color: tone.onContainer),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l10n.encyclopediaSafetyTitle,
                    style: theme.textTheme.titleSmall?.copyWith(color: tone.onContainer, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(text, style: theme.textTheme.bodyMedium?.copyWith(color: tone.onContainer)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ReviewExplainer extends StatelessWidget {
  const _ReviewExplainer({required this.entry});

  final EncyclopediaEntrySummary entry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(entry.review.reviewed ? Icons.verified_outlined : Icons.info_outline, color: theme.colorScheme.primary),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Text(
              entry.review.reviewed ? l10n.encyclopediaReviewedExplain : l10n.encyclopediaNotReviewedExplain,
              style: theme.textTheme.bodySmall,
            ),
          ),
        ],
      ),
    );
  }
}

class _EntrySkeleton extends StatelessWidget {
  const _EntrySkeleton();

  @override
  Widget build(BuildContext context) {
    return Skeleton(
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: context.pageGutter),
        child: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SkeletonLine(widthFactor: 0.3),
            SizedBox(height: AppSpacing.md),
            SkeletonLine(widthFactor: 0.9, fontSize: 24),
            SizedBox(height: AppSpacing.sm),
            SkeletonLine(widthFactor: 0.6, fontSize: 24),
            SizedBox(height: AppSpacing.lg),
            SkeletonBox(aspectRatio: 16 / 9),
            SizedBox(height: AppSpacing.lg),
            SkeletonLine(),
            SizedBox(height: AppSpacing.sm),
            SkeletonLine(),
            SizedBox(height: AppSpacing.sm),
            SkeletonLine(widthFactor: 0.7),
          ],
        ),
      ),
    );
  }
}
