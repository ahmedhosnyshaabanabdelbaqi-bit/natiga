import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/cache/cached_fetch.dart';
import '../../../shared/widgets/kit.dart';
import '../application/compare_providers.dart';
import '../domain/comparison_models.dart';
import 'widgets/compare_actions.dart';
import 'widgets/comparison_view.dart';
import 'widgets/saved_comparisons.dart';
import 'widgets/tray_editor.dart';

/// Compare tab root (`/compare`): 2–4 cars, each a trim of a model year in a
/// market (all mandatory), computed by the API; summary / detailed views,
/// differences only, pinned car names, landscape table, save and share.
class CompareScreen extends ConsumerWidget {
  const CompareScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final items = ref.watch(compareTrayProvider);
    final canCompare = items.length >= CompareTrayController.minItems;
    final request = canCompare ? CompareRequest(items) : null;

    Future<void> refresh() async {
      if (request != null) {
        ref.invalidate(comparisonProvider(request));
        await ref.read(comparisonProvider(request).future).then((_) {}, onError: (_) {});
      } else {
        ref.invalidate(featuredComparisonsProvider);
        ref.invalidate(myComparisonsProvider);
      }
    }

    return AppScaffold.slivers(
      title: l10n.compareTitle,
      largeTitle: !canCompare,
      onRefresh: refresh,
      actions: [
        IconButton(
          tooltip: l10n.compareSavedTitle,
          icon: const Icon(Icons.bookmarks_outlined),
          onPressed: () => showSavedComparisonsSheet(context),
        ),
        IconButton(
          tooltip: l10n.compareRecommendationsTitle,
          icon: const Icon(Icons.auto_awesome_outlined),
          onPressed: () => context.push(AppRoutes.recommendations),
        ),
        IconButton(
          tooltip: l10n.shellSearchTooltip,
          icon: const Icon(Icons.search),
          onPressed: () => context.push(AppRoutes.search()),
        ),
      ],
      slivers: request == null ? _introSlivers(context) : _comparisonSlivers(context, ref, request),
    );
  }

  List<Widget> _introSlivers(BuildContext context) {
    final gutter = context.pageGutter;
    return [
      SliverPadding(
        padding: EdgeInsets.fromLTRB(gutter, AppSpacing.sm, gutter, AppSpacing.xxl),
        sliver: SliverToBoxAdapter(
          child: ResponsiveCenter(
            padding: EdgeInsets.zero,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: const [
                _IntroCard(),
                SizedBox(height: AppSpacing.lg),
                CompareTrayEditor(),
                SizedBox(height: AppSpacing.lg),
                _RecommendCta(),
                SizedBox(height: AppSpacing.xl),
                FeaturedComparisonsSection(),
                MySavedComparisonsSection(),
              ],
            ),
          ),
        ),
      ),
    ];
  }

  List<Widget> _comparisonSlivers(BuildContext context, WidgetRef ref, CompareRequest request) {
    final value = ref.watch(comparisonProvider(request));
    final options = ref.watch(compareViewProvider);
    final gutter = context.pageGutter;
    return [
      SliverPadding(
        padding: EdgeInsets.fromLTRB(gutter, AppSpacing.sm, gutter, AppSpacing.sm),
        sliver: SliverToBoxAdapter(
          child: ResponsiveCenter(
            maxWidth: kMaxContentWidth,
            padding: EdgeInsets.zero,
            child: CompareControls(
              options: options,
              onSummary: ref.read(compareViewProvider.notifier).setSummary,
              onDifferencesOnly: ref.read(compareViewProvider.notifier).setDifferencesOnly,
              actions: [
                SecondaryButton(
                  label: l10nOf(context).compareEditCars(request.items.length),
                  icon: Icons.edit_outlined,
                  onPressed: () => showTrayEditorSheet(context),
                ),
                SecondaryButton(
                  label: l10nOf(context).compareSave,
                  icon: Icons.bookmark_add_outlined,
                  onPressed: () => saveTrayComparison(context, ref, request.items),
                ),
                SecondaryButton(
                  label: l10nOf(context).compareShare,
                  icon: Icons.share_outlined,
                  onPressed: () => shareTrayComparison(context, ref, request.items),
                ),
              ],
            ),
          ),
        ),
      ),
      SliverAsyncStateView<CachedResult<ComparisonData>>(
        value: value,
        onRetry: () => ref.invalidate(comparisonProvider(request)),
        loading: const ComparisonSkeleton(),
        builder: (context, res) => SliverMainAxisGroup(
          slivers: [
            if (res.fromCache)
              SliverPadding(
                padding: EdgeInsets.fromLTRB(gutter, 0, gutter, AppSpacing.sm),
                sliver: SliverToBoxAdapter(
                  child: CachedDataNotice(
                    savedAt: res.savedAt,
                    onRetry: () => ref.invalidate(comparisonProvider(request)),
                  ),
                ),
              ),
            ComparisonSliver(
              result: res.data,
              summaryView: options.summary,
              differencesOnly: options.differencesOnly,
              onCarTap: (car) => _carActions(context, ref, car),
              onShowAllRows: () {
                ref.read(compareViewProvider.notifier).setSummary(false);
                ref.read(compareViewProvider.notifier).setDifferencesOnly(false);
              },
            ),
          ],
        ),
      ),
    ];
  }

  static AppLocalizations l10nOf(BuildContext context) => context.l10n;

  Future<void> _carActions(BuildContext context, WidgetRef ref, ComparisonCar car) {
    final l10n = context.l10n;
    return showAppBottomSheet<void>(
      context: context,
      title: car.title,
      builder: (sheet) => Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (car.variantSlug != null)
              ListTile(
                leading: const Icon(Icons.directions_car_outlined),
                title: Text(l10n.compareOpenCar),
                onTap: () {
                  Navigator.of(sheet).pop();
                  context.push(AppRoutes.variant(car.variantSlug!));
                },
              ),
            ListTile(
              leading: const Icon(Icons.swap_horiz),
              title: Text(l10n.compareChangeCar),
              onTap: () {
                Navigator.of(sheet).pop();
                context.push(comparePickerLocation(replaceKey: car.key));
              },
            ),
            ListTile(
              leading: const Icon(Icons.delete_outline),
              title: Text(l10n.compareRemoveCar),
              onTap: () {
                Navigator.of(sheet).pop();
                ref.read(compareTrayProvider.notifier).remove(car.key);
              },
            ),
          ],
        ),
      ),
    );
  }
}

/// Opens the tray editor in a sheet (change / reorder / remove / add).
Future<void> showTrayEditorSheet(BuildContext context) {
  final l10n = context.l10n;
  return showAppBottomSheet<void>(
    context: context,
    title: l10n.compareEditCarsTitle,
    builder: (sheet) => Padding(
      padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.lg),
      child: CompareTrayEditor(onNavigate: () => Navigator.of(sheet).pop()),
    ),
  );
}

/// View switches shared by the Compare tab and shared comparisons.
class CompareControls extends StatelessWidget {
  const CompareControls({
    super.key,
    required this.options,
    required this.onSummary,
    required this.onDifferencesOnly,
    this.actions = const [],
  });

  final CompareViewOptions options;
  final ValueChanged<bool> onSummary;
  final ValueChanged<bool> onDifferencesOnly;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          label: l10n.compareViewLabel,
          container: true,
          child: ChoicePills<bool>(
            options: {true: l10n.compareViewSummary, false: l10n.compareViewDetailed},
            selected: options.summary,
            onSelected: onSummary,
          ),
        ),
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          value: options.differencesOnly,
          onChanged: onDifferencesOnly,
          title: Text(l10n.compareDifferencesOnly),
          subtitle: Text(l10n.compareDifferencesOnlyHint),
        ),
        if (actions.isNotEmpty) Wrap(spacing: AppSpacing.sm, runSpacing: AppSpacing.sm, children: actions),
      ],
    );
  }
}

/// Loading placeholder shaped like the comparison.
class ComparisonSkeleton extends StatelessWidget {
  const ComparisonSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    final gutter = context.pageGutter;
    return Skeleton(
      semanticLabel: context.l10n.compareLoading,
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: gutter, vertical: AppSpacing.md),
        child: const Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                SkeletonCircle(size: 26),
                SizedBox(width: AppSpacing.sm),
                Expanded(child: SkeletonLine(widthFactor: 0.8)),
                SizedBox(width: AppSpacing.lg),
                SkeletonCircle(size: 26),
                SizedBox(width: AppSpacing.sm),
                Expanded(child: SkeletonLine(widthFactor: 0.8)),
              ],
            ),
            SizedBox(height: AppSpacing.lg),
            SkeletonCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SkeletonLine(widthFactor: 0.4, fontSize: 18),
                  SizedBox(height: AppSpacing.md),
                  SkeletonLine(widthFactor: 0.9),
                  SizedBox(height: AppSpacing.sm),
                  SkeletonLine(widthFactor: 0.7),
                ],
              ),
            ),
            SizedBox(height: AppSpacing.md),
            SkeletonCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SkeletonLine(widthFactor: 0.5, fontSize: 18),
                  SizedBox(height: AppSpacing.md),
                  SkeletonLine(widthFactor: 0.6),
                  SizedBox(height: AppSpacing.sm),
                  SkeletonLine(widthFactor: 0.6),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _IntroCard extends StatelessWidget {
  const _IntroCard();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(gradient: context.palette.brandGradient, borderRadius: AppRadii.card),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.compare_arrows, color: Colors.white, size: 32),
          const SizedBox(height: AppSpacing.sm),
          Semantics(
            header: true,
            child: Text(
              l10n.compareIntroTitle,
              style: theme.textTheme.titleLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(l10n.compareIntroMessage, style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white)),
          const SizedBox(height: AppSpacing.md),
          for (final rule in [
            l10n.compareIntroRuleMandatory,
            l10n.compareIntroRuleCycles,
            l10n.compareIntroRuleMissing,
          ])
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.xs),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.check_circle_outline, color: Colors.white, size: 18),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(rule, style: theme.textTheme.bodySmall?.copyWith(color: Colors.white)),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _RecommendCta extends StatelessWidget {
  const _RecommendCta();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    return AppCard(
      onTap: () => context.push(AppRoutes.recommendations),
      semanticLabel: '${l10n.compareRecommendCtaTitle}. ${l10n.compareRecommendCtaMessage}',
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Row(
        children: [
          Icon(Icons.auto_awesome_outlined, color: theme.colorScheme.primary, size: 32),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l10n.compareRecommendCtaTitle,
                  style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 2),
                Text(
                  l10n.compareRecommendCtaMessage,
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right),
        ],
      ),
    );
  }
}
