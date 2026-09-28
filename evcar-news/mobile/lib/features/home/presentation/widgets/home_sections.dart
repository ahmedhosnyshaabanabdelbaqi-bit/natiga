import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../shared/widgets/kit.dart';
import '../../../cars/domain/catalog_models.dart' show CarSummary;
import '../../../cars/presentation/widgets/car_summary_card.dart';
import '../../../charging/application/charging_providers.dart';
import '../../../charging/domain/station_models.dart' show StationListItem;
import '../../../charging/presentation/widgets/charging_labels.dart' show placeLabel;
import '../../../charging/presentation/widgets/location_prompts.dart';
import '../../../charging/presentation/widgets/station_card.dart';
import '../../../compare/domain/comparison_models.dart' show SavedComparison;
import '../../../compare/presentation/widgets/saved_comparisons.dart' show SavedComparisonTile;
import '../../../encyclopedia/domain/encyclopedia_models.dart';
import '../../../encyclopedia/presentation/widgets/encyclopedia_widgets.dart';
import '../../../news/domain/article.dart' show ArticleSummary;
import '../../../news/presentation/widgets/article_card.dart';
import '../../../tours/domain/tour_models.dart' show TourCard;
import '../../../tours/presentation/widgets/tour_card.dart';
import '../../application/home_providers.dart';
import '../../domain/home_models.dart';

/// Localized fallback title when the server sends none.
String homeSectionFallbackTitle(AppLocalizations l10n, String key) => switch (key) {
  HomeSectionKeys.topStory => l10n.homeTopStory,
  HomeSectionKeys.forYou => l10n.homeForYou,
  HomeSectionKeys.latestNews => l10n.homeLatestNews,
  HomeSectionKeys.reviews => l10n.homeReviews,
  HomeSectionKeys.newCars => l10n.homeNewCars,
  HomeSectionKeys.featuredComparisons => l10n.homeFeaturedComparisons,
  HomeSectionKeys.interiorTours => l10n.homeInteriorTours,
  HomeSectionKeys.nearbyStations => l10n.homeNearbyStations,
  HomeSectionKeys.chargingGuides => l10n.homeChargingGuides,
  _ => '',
};

IconData homeSectionIcon(HomeSection s) => switch (s.key) {
  HomeSectionKeys.forYou => Icons.auto_awesome_outlined,
  HomeSectionKeys.latestNews => Icons.newspaper_outlined,
  HomeSectionKeys.reviews => Icons.rate_review_outlined,
  HomeSectionKeys.newCars => Icons.directions_car_outlined,
  HomeSectionKeys.featuredComparisons => Icons.compare_arrows,
  HomeSectionKeys.interiorTours => Icons.threesixty,
  HomeSectionKeys.nearbyStations => Icons.ev_station_outlined,
  HomeSectionKeys.chargingGuides => Icons.menu_book_outlined,
  _ => Icons.article_outlined,
};

/// Renders one server section, or nothing when it has nothing to show.
class HomeSectionView extends ConsumerWidget {
  const HomeSectionView({super.key, required this.section, required this.fetchedAt, required this.offlineCopy});

  final HomeSection section;
  final DateTime fetchedAt;
  final bool offlineCopy;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final s = section;
    final title = s.title.isNotEmpty ? s.title : homeSectionFallbackTitle(l10n, s.key);
    final route = s.browse?.route;
    final header = SectionHeader(
      title: title,
      icon: homeSectionIcon(s),
      onSeeAll: route == null ? null : () => context.push(route),
    );

    if (s.state == HomeSectionState.unavailable) {
      return _Titled(
        header: header,
        child: _SectionProblem(onRetry: () => ref.read(homeFeedProvider.notifier).refresh()),
      );
    }
    if (s.itemType == 'station') {
      return _Titled(
        header: header,
        child: _NearbyStations(section: s, fetchedAt: fetchedAt, offlineCopy: offlineCopy),
      );
    }
    if (s.items.isEmpty) return const SizedBox.shrink();

    switch (s.itemType) {
      case 'article':
        final items = s.itemsOf<ArticleSummary>();
        if (s.key == HomeSectionKeys.topStory) {
          return Padding(
            padding: EdgeInsets.fromLTRB(context.pageGutter, AppSpacing.md, context.pageGutter, 0),
            child: ArticleCard(article: items.first, variant: NewsCardVariant.hero),
          );
        }
        if (s.key == HomeSectionKeys.latestNews) {
          return _Titled(
            header: header,
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: context.pageGutter),
              child: Column(
                children: [
                  for (final a in items.take(5))
                    Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                      child: ArticleCard(article: a, variant: NewsCardVariant.compact),
                    ),
                ],
              ),
            ),
          );
        }
        return _Titled(
          header: header,
          child: HorizontalCardList(itemWidth: 280, children: [for (final a in items) ArticleCard(article: a)]),
        );
      case 'car':
        return _Titled(
          header: header,
          child: HorizontalCardList(
            itemWidth: 250,
            children: [for (final c in s.itemsOf<CarSummary>()) CarSummaryCard(car: c)],
          ),
        );
      case 'comparison':
        return _Titled(
          header: header,
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: context.pageGutter),
            child: Column(
              children: [
                for (final c in s.itemsOf<SavedComparison>().take(4))
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                    child: SavedComparisonTile(comparison: c),
                  ),
              ],
            ),
          ),
        );
      case 'tour':
        return _ToursStrip(section: s, title: title, route: route);
      case 'encyclopedia':
        return _Titled(
          header: header,
          child: HorizontalCardList(
            itemWidth: 220,
            children: [
              for (final e in s.itemsOf<EncyclopediaEntrySummary>()) EncyclopediaEntryCard(entry: e, compact: true),
            ],
          ),
        );
    }
    return const SizedBox.shrink();
  }
}

class _Titled extends StatelessWidget {
  const _Titled({required this.header, required this.child});

  final Widget header;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [header, child]);
  }
}

class _SectionProblem extends StatelessWidget {
  const _SectionProblem({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: context.pageGutter),
      child: AppCard(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Row(
          children: [
            Icon(Icons.cloud_off_outlined, color: theme.colorScheme.onSurfaceVariant),
            const SizedBox(width: AppSpacing.md),
            Expanded(child: Text(l10n.homeSectionUnavailable, style: theme.textTheme.bodyMedium)),
            TextButton(onPressed: onRetry, child: Text(l10n.commonRetry)),
          ],
        ),
      ),
    );
  }
}

/// «جولات 360°» — the prominent strip (REQUIREMENTS §3: tours are not a
/// hidden feature): tinted band, badge, intro and large cards.
class _ToursStrip extends StatelessWidget {
  const _ToursStrip({required this.section, required this.title, required this.route});

  final HomeSection section;
  final String title;
  final String? route;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final palette = context.palette;
    final tone = palette.tone(AppTone.brand);
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xl),
      child: DecoratedBox(
        decoration: BoxDecoration(color: tone.container.withValues(alpha: 0.55)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(height: 4, decoration: BoxDecoration(gradient: palette.accentGradient)),
            Padding(
              padding: EdgeInsets.fromLTRB(context.pageGutter, AppSpacing.lg, context.pageGutter, AppSpacing.sm),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(gradient: palette.brandGradient, borderRadius: AppRadii.control),
                    child: const Icon(Icons.threesixty, color: Colors.white, size: 28),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Semantics(
                          header: true,
                          child: Text(
                            title,
                            style: theme.textTheme.titleLarge?.copyWith(
                              fontWeight: FontWeight.w800,
                              color: tone.onContainer,
                            ),
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(l10n.homeToursIntro, style: theme.textTheme.bodyMedium?.copyWith(color: tone.onContainer)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            HorizontalCardList(
              itemWidth: 300,
              children: [for (final t in section.itemsOf<TourCard>()) TourListCard(card: t)],
            ),
            if (route != null)
              Padding(
                padding: EdgeInsets.fromLTRB(context.pageGutter, AppSpacing.xs, context.pageGutter, AppSpacing.md),
                child: Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: TextButton.icon(
                    onPressed: () => context.push(route!),
                    icon: const Icon(Icons.threesixty),
                    label: Text(l10n.homeAllTours),
                  ),
                ),
              )
            else
              const SizedBox(height: AppSpacing.md),
          ],
        ),
      ),
    );
  }
}

/// Nearby stations: a prompt (location or city) until a point is known,
/// then up to 3 stations with the three separate statuses.
class _NearbyStations extends ConsumerWidget {
  const _NearbyStations({required this.section, required this.fetchedAt, required this.offlineCopy});

  final HomeSection section;
  final DateTime fetchedAt;
  final bool offlineCopy;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final place = ref.watch(homeNearbyPlaceProvider);
    if (section.state == HomeSectionState.locationRequired || place == null) {
      return Padding(
        padding: EdgeInsets.symmetric(horizontal: context.pageGutter),
        child: const NearbyPromptCard(),
      );
    }
    final stations = section.itemsOf<StationListItem>();
    final now = ref.watch(chargingClockProvider)();
    final meta = ref.watch(stationMetaProvider).value?.data;
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: context.pageGutter),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(Icons.place_outlined, size: 18, color: theme.colorScheme.onSurfaceVariant),
              const SizedBox(width: AppSpacing.xs),
              Expanded(
                child: Text(
                  l10n.homeNearbyAround(placeLabel(context, place)),
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
              ),
              TextButton(onPressed: () => context.push(AppRoutes.chargingLocation), child: Text(l10n.homeChangePlace)),
            ],
          ),
          if (stations.isEmpty)
            AppCard(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Row(
                children: [
                  Icon(Icons.ev_station_outlined, color: theme.colorScheme.onSurfaceVariant),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(child: Text(l10n.homeNearbyEmpty, style: theme.textTheme.bodyMedium)),
                ],
              ),
            )
          else
            for (final s in stations.take(3))
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: StationCard(
                  station: s,
                  fetchedAt: fetchedAt,
                  now: now,
                  offlineCopy: offlineCopy,
                  connectorName: meta?.connectorName,
                  compact: true,
                ),
              ),
        ],
      ),
    );
  }
}

/// "See charging stations near you": use my location, or choose a city.
/// The position is used for the request only and never stored.
class NearbyPromptCard extends ConsumerStatefulWidget {
  const NearbyPromptCard({super.key});

  @override
  ConsumerState<NearbyPromptCard> createState() => _NearbyPromptCardState();
}

class _NearbyPromptCardState extends ConsumerState<NearbyPromptCard> {
  bool _busy = false;

  Future<void> _locate() async {
    setState(() => _busy = true);
    final outcome = await ref.read(locationStatusProvider.notifier).locate();
    if (!mounted) return;
    setState(() => _busy = false);
    await handleLocateOutcome(context, ref, outcome);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final tone = context.palette.tone(AppTone.info);
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(color: tone.container, shape: BoxShape.circle),
                child: Icon(Icons.near_me_outlined, color: tone.onContainer),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.homeNearbyPromptTitle,
                      style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      l10n.homeNearbyPromptMessage,
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              PrimaryButton(
                label: l10n.homeUseMyLocation,
                icon: Icons.my_location,
                loading: _busy,
                onPressed: _busy ? null : _locate,
              ),
              SecondaryButton(
                label: l10n.homeChooseCity,
                icon: Icons.location_city_outlined,
                onPressed: () => context.push(AppRoutes.chargingLocation),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
