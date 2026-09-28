import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/app_config/app_config_controller.dart';
import '../../../core/app_config/features.dart';
import '../../../core/cache/cached_fetch.dart';
import '../../../shared/widgets/brand_title.dart';
import '../../../shared/widgets/kit.dart';
import '../application/home_providers.dart';
import '../domain/home_models.dart';
import 'widgets/home_sections.dart';

/// Home tab root (`/`): sections from `GET /home` in the server's order
/// (admin controls order + visibility): top story, for-you, latest news,
/// reviews, new cars, curated comparisons, the prominent 360° tours strip,
/// nearby stations (after location permission, or a chosen city) and
/// charging guides. Pull to refresh; the last copy is shown offline with
/// its date; the scroll position is kept when coming back.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  @override
  void initState() {
    super.initState();
    // Silent: locates only when access was already granted.
    ref.read(homeAutoLocateProvider);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final config = ref.watch(appConfigProvider);
    // Entry points of features the server does not announce stay hidden.
    final showSearch = Features.searchable.any(config.isFeatureEnabled);
    final showNotifications = config.isFeatureEnabled(Features.notifications);
    final value = ref.watch(homeFeedProvider);
    final res = value.value;

    final slivers = <Widget>[
      if (showSearch)
        SliverToBoxAdapter(
          child: ResponsiveCenter(
            maxWidth: kMaxContentWidth,
            child: Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xs, bottom: AppSpacing.sm),
              child: AppSearchField(
                readOnly: true,
                hintText: l10n.homeSearchHint,
                onTap: () => context.push(AppRoutes.search()),
              ),
            ),
          ),
        ),
      if (res != null && res.fromCache)
        SliverToBoxAdapter(
          child: ResponsiveCenter(
            maxWidth: kMaxContentWidth,
            child: Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: CachedDataNotice(
                savedAt: res.savedAt,
                onRetry: () => ref.read(homeFeedProvider.notifier).refresh(),
              ),
            ),
          ),
        ),
      if (res != null && value.hasError)
        SliverToBoxAdapter(
          child: ResponsiveCenter(
            maxWidth: kMaxContentWidth,
            child: _RefreshFailed(onRetry: () => ref.read(homeFeedProvider.notifier).refresh()),
          ),
        ),
      if (res != null)
        ..._content(context, res)
      else
        SliverAsyncStateView<CachedResult<HomeFeed>>(
          value: value,
          onRetry: () => ref.read(homeFeedProvider.notifier).refresh(),
          loading: const _HomeSkeleton(),
          builder: (context, data) => const SliverToBoxAdapter(child: SizedBox.shrink()),
        ),
    ];

    return KeyedSubtree(
      // Keeps the scroll offset when the user comes back (PageStorage).
      key: const PageStorageKey<String>('home-scroll'),
      child: AppScaffold.slivers(
        titleWidget: const BrandTitle(),
        actions: [
          if (showSearch)
            IconButton(
              tooltip: l10n.shellSearchTooltip,
              icon: const Icon(Icons.search),
              onPressed: () => context.push(AppRoutes.search()),
            ),
          if (showNotifications)
            IconButton(
              tooltip: l10n.shellNotificationsTooltip,
              icon: const Icon(Icons.notifications_outlined),
              onPressed: () => context.push(AppRoutes.notifications),
            ),
        ],
        onRefresh: () => ref.read(homeFeedProvider.notifier).refresh(),
        slivers: slivers,
      ),
    );
  }

  List<Widget> _content(BuildContext context, CachedResult<HomeFeed> res) {
    final l10n = context.l10n;
    final sections = res.data.sections;
    final visible = sections.where(
      (s) => s.items.isNotEmpty || s.itemType == 'station' || s.state == HomeSectionState.unavailable,
    );
    if (visible.isEmpty) {
      return [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl),
            child: EmptyState(
              icon: Icons.bolt_outlined,
              title: l10n.homeEmptyTitle,
              message: l10n.homeEmptyMessage,
              actions: [
                StateAction(
                  label: l10n.commonRetry,
                  icon: Icons.refresh,
                  primary: true,
                  onPressed: () => ref.read(homeFeedProvider.notifier).refresh(),
                ),
              ],
            ),
          ),
        ),
        const SliverToBoxAdapter(child: _ExploreSection()),
      ];
    }
    return [
      SliverList.builder(
        itemCount: sections.length,
        itemBuilder: (context, i) => ResponsiveCenter(
          maxWidth: kMaxContentWidth,
          padding: EdgeInsets.zero,
          child: HomeSectionView(
            key: ValueKey('home-section-${sections[i].key}'),
            section: sections[i],
            fetchedAt: res.savedAt,
            offlineCopy: res.fromCache,
          ),
        ),
      ),
      const SliverToBoxAdapter(child: _ExploreSection()),
      SliverToBoxAdapter(
        child: Padding(
          padding: EdgeInsets.fromLTRB(context.pageGutter, AppSpacing.lg, context.pageGutter, 0),
          child: Center(child: LastUpdatedText(time: res.savedAt)),
        ),
      ),
    ];
  }
}

/// Links to every enabled area, so personalization never hides browsing.
class _ExploreSection extends ConsumerWidget {
  const _ExploreSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final config = ref.watch(appConfigProvider);
    bool on(String f) => config.isFeatureEnabled(f);
    final tiles = [
      if (on(Features.news)) (Icons.newspaper_outlined, l10n.homeExploreNews, AppRoutes.news),
      if (on(Features.cars)) (Icons.directions_car_outlined, l10n.homeExploreBrands, AppRoutes.brands),
      if (on(Features.interiorTours)) (Icons.threesixty, l10n.homeExploreTours, AppRoutes.tours),
      if (on(Features.encyclopedia)) (Icons.menu_book_outlined, l10n.homeExploreEncyclopedia, AppRoutes.encyclopedia),
      if (on(Features.servicesDirectory)) (Icons.handyman_outlined, l10n.homeExploreServices, AppRoutes.services),
      if (on(Features.calculators)) (Icons.calculate_outlined, l10n.homeExploreCalculators, AppRoutes.calculators),
    ];
    if (tiles.isEmpty) return const SizedBox.shrink();
    return ResponsiveCenter(
      maxWidth: kMaxContentWidth,
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SectionHeader(title: l10n.homeExploreTitle, icon: Icons.explore_outlined),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: context.pageGutter),
            child: AdaptiveGrid(
              minItemWidth: 150,
              spacing: AppSpacing.sm,
              children: [
                for (final (icon, label, route) in tiles) _ExploreTile(icon: icon, label: label, route: route),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ExploreTile extends StatelessWidget {
  const _ExploreTile({required this.icon, required this.label, required this.route});

  final IconData icon;
  final String label;
  final String route;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tone = context.palette.tone(AppTone.brand);
    return AppCard(
      semanticLabel: label,
      onTap: () => context.push(route),
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: tone.container, borderRadius: AppRadii.control),
            child: Icon(icon, color: tone.onContainer, size: 22),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(label, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}

class _RefreshFailed extends StatelessWidget {
  const _RefreshFailed({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tone = context.palette.tone(AppTone.warning);
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.md, AppSpacing.xs, AppSpacing.xs, AppSpacing.xs),
      decoration: BoxDecoration(color: tone.container, borderRadius: AppRadii.control),
      child: Row(
        children: [
          Icon(Icons.sync_problem, color: tone.onContainer, size: 20),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(l10n.homeRefreshFailed, style: TextStyle(color: tone.onContainer)),
          ),
          TextButton(onPressed: onRetry, child: Text(l10n.commonRetry)),
        ],
      ),
    );
  }
}

class _HomeSkeleton extends StatelessWidget {
  const _HomeSkeleton();

  @override
  Widget build(BuildContext context) {
    return Skeleton(
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: context.pageGutter),
        child: const Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(height: AppSpacing.md),
            SkeletonBox(aspectRatio: 16 / 10),
            SizedBox(height: AppSpacing.xl),
            SkeletonLine(widthFactor: 0.4, fontSize: 18),
            SizedBox(height: AppSpacing.md),
            NewsCardSkeleton.compact(),
            SizedBox(height: AppSpacing.sm),
            NewsCardSkeleton.compact(),
            SizedBox(height: AppSpacing.sm),
            NewsCardSkeleton.compact(),
          ],
        ),
      ),
    );
  }
}
