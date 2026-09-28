import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/di/providers.dart';
import '../../../app/router/app_routes.dart';
import '../../../core/app_config/app_config_controller.dart';
import '../../../core/app_config/features.dart';
import '../../../core/cache/cached_fetch.dart';
import '../../../shared/widgets/kit.dart';
import '../application/cars_providers.dart';
import '../data/cars_repository.dart';
import '../domain/catalog_models.dart';
import 'widgets/car_labels.dart';
import 'widgets/car_page_parts.dart';
import 'widgets/charging_section.dart';
import 'widgets/content_sections.dart';
import 'widgets/price_section.dart';
import 'widgets/spec_sections.dart';
import 'widgets/tours_section.dart';

/// Tabs of the car page.
enum CarTab { overview, specs, news, owners, tours, competitors }

/// Car page (`/cars/:slug`, deep link `https://evcar.news/cars/<slug>`).
///
/// The user picks the market, model year and trim explicitly; every figure
/// on the page belongs to that exact (trim, market) pair — nothing from
/// another trim or market is mixed in silently.
class CarDetailScreen extends ConsumerStatefulWidget {
  const CarDetailScreen({super.key, required this.slug, this.initialTab = CarTab.overview});

  /// Car (model) slug from the URL.
  final String slug;
  final CarTab initialTab;

  @override
  ConsumerState<CarDetailScreen> createState() => _CarDetailScreenState();
}

class _CarDetailScreenState extends ConsumerState<CarDetailScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(
    length: CarTab.values.length,
    vsync: this,
    initialIndex: widget.initialTab.index,
  )..addListener(_onTab);

  /// Market chosen on this page (null = the app's market).
  String? _market;

  /// Trim chosen on this page (null = the server's default trim).
  String? _variantId;

  void _onTab() {
    if (!_tabs.indexIsChanging) setState(() {});
  }

  @override
  void dispose() {
    _tabs
      ..removeListener(_onTab)
      ..dispose();
    super.dispose();
  }

  String get _marketCode => _market ?? ref.read(effectiveMarketProvider).code;

  VariantSummary? _selected(CarDetail car) =>
      car.variantById(_variantId) ?? car.variantById(car.defaultVariantId) ?? car.allVariants.firstOrNull;

  Future<void> _refresh(MarketKey key, VariantSummary? v) async {
    ref.invalidate(carDetailProvider(key));
    if (v != null) ref.invalidate(variantSheetProvider(MarketKey(v.slug, key.market)));
    try {
      await ref.read(carDetailProvider(key).future);
    } on Object {
      // Rendered below.
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    ref.watch(effectiveMarketProvider);
    final key = MarketKey(widget.slug, _marketCode);
    final value = ref.watch(carDetailProvider(key));
    final car = value.value?.data;
    final variant = car == null ? null : _selected(car);

    return AppScaffold.slivers(
      title: car?.name ?? l10n.carsDetailTitle,
      flexibleHeader: car == null ? null : _Hero(car: car),
      expandedHeight: 240,
      onRefresh: () => _refresh(key, variant),
      bottomBar: const CompareTrayBar(),
      actions: [
        if (car != null)
          FavoriteButton(
            item: FavoriteItem(
              key: FavoriteKey(FavoriteType.model, car.id),
              title: car.title,
              imageUrl: car.heroImage?.url,
              route: AppRoutes.car(car.slug),
            ),
          ),
      ],
      bottom: car == null
          ? null
          : TabBar(
              controller: _tabs,
              isScrollable: true,
              tabAlignment: TabAlignment.start,
              tabs: [
                Tab(text: l10n.carsTabOverview),
                Tab(text: l10n.carsTabSpecs),
                Tab(text: l10n.carsTabNews),
                Tab(text: l10n.carsTabOwners),
                Tab(text: l10n.carsTabTours),
                Tab(text: l10n.carsTabCompetitors),
              ],
            ),
      slivers: [
        SliverAsyncStateView<CachedResult<CarDetail>>(
          value: value,
          onRetry: () => ref.invalidate(carDetailProvider(key)),
          loading: const _CarPageSkeleton(),
          builder: (context, res) => SliverPadding(
            padding: EdgeInsets.fromLTRB(context.pageGutter, AppSpacing.lg, context.pageGutter, 0),
            sliver: SliverToBoxAdapter(
              child: ResponsiveCenter(
                maxWidth: kMaxContentWidth,
                padding: EdgeInsets.zero,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (res.fromCache) ...[
                      CachedDataNotice(savedAt: res.savedAt, onRetry: () => _refresh(key, variant)),
                      const SizedBox(height: AppSpacing.md),
                    ],
                    AnimatedSwitcher(
                      duration: AppMotion.of(context, AppMotion.fast),
                      child: KeyedSubtree(
                        key: ValueKey('${_tabs.index}-${variant?.id}-${key.market}'),
                        child: _tabBody(context, res.data, variant, key.market),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _tabBody(BuildContext context, CarDetail car, VariantSummary? variant, String market) {
    final tab = CarTab.values[_tabs.index];
    final l10n = context.l10n;
    final selector = VersionSelector(
      car: car,
      markets: ref.watch(appConfigProvider).enabledMarkets,
      marketCode: market,
      selectedVariantId: variant?.id,
      onMarket: (code) => setState(() => _market = code),
      onVariant: (v) => setState(() => _variantId = v.id),
    );
    if (variant == null) {
      // The model has no trim listed in this market: say so plainly.
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          selector,
          const SizedBox(height: AppSpacing.lg),
          EmptyState(
            icon: Icons.public_off_outlined,
            title: l10n.carsNotSoldInMarketTitle,
            message: car.availableMarkets.isEmpty
                ? l10n.carsNotSoldAnywhereMessage
                : l10n.carsNotSoldInMarketMessage(car.availableMarkets.map((m) => m.name).join('، ')),
            compact: true,
          ),
          if (tab == CarTab.competitors) ...[
            const SizedBox(height: AppSpacing.lg),
            CompetitorsList(cars: car.competitors),
          ],
        ],
      );
    }

    switch (tab) {
      case CarTab.news:
        return RelatedArticlesList(articles: car.relatedArticles);
      case CarTab.owners:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _TrimLine(variant: variant, marketName: _marketName(car, market)),
            const SizedBox(height: AppSpacing.md),
            OwnerReviewsSection(carSlug: car.slug, variantId: variant.id),
          ],
        );
      case CarTab.competitors:
        return CompetitorsList(cars: car.competitors);
      case CarTab.overview:
      case CarTab.specs:
      case CarTab.tours:
        break;
    }

    final sheetKey = MarketKey(variant.slug, market);
    final sheetValue = ref.watch(variantSheetProvider(sheetKey));
    final toursEnabled = ref.watch(featureFlagProvider(Features.interiorTours));

    Widget sheetState(Widget Function(VariantView v) builder) => AsyncStateView<VariantView>(
      value: sheetValue,
      compact: true,
      onRetry: () => ref.invalidate(variantSheetProvider(sheetKey)),
      loading: const Skeleton(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SkeletonBox(height: 120),
            SizedBox(height: AppSpacing.md),
            SkeletonBox(height: 200),
          ],
        ),
      ),
      builder: (context, v) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SheetOriginNotice(view: v, onRetry: () => ref.invalidate(variantSheetProvider(sheetKey))),
          builder(v),
        ],
      ),
    );

    if (tab == CarTab.tours) {
      final fromSheet = sheetValue.value?.sheet;
      final tours = fromSheet?.tours.tours ?? car.tours.forVariant(variant.id);
      final images = (fromSheet?.images.isNotEmpty ?? false) ? fromSheet!.images : car.images;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _TrimLine(variant: variant, marketName: _marketName(car, market)),
          const SizedBox(height: AppSpacing.md),
          ToursSection(
            carSlug: car.slug,
            tours: tours,
            images: images,
            toursEnabled: toursEnabled,
            unavailableLabel: car.tours.unavailableLabel,
          ),
        ],
      );
    }

    if (tab == CarTab.specs) {
      return sheetState(
        (v) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SelectionSummary(sheet: v.sheet),
            const SizedBox(height: AppSpacing.lg),
            RangesCard(sheet: v.sheet),
            const SizedBox(height: AppSpacing.cardGap),
            ChargingSection(sheet: v.sheet),
            const SizedBox(height: AppSpacing.sm),
            SpecGroupsView(groups: v.sheet.specGroups),
            const SizedBox(height: AppSpacing.lg),
            SecondaryButton(
              label: l10n.carsOpenFullSheet,
              icon: Icons.open_in_full,
              expand: true,
              onPressed: () => context.push(AppRoutes.variant(v.sheet.slug)),
            ),
          ],
        ),
      );
    }

    // Overview.
    final exactTours = car.tours.forVariant(variant.id);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        selector,
        const SizedBox(height: AppSpacing.lg),
        sheetState(
          (v) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SelectionSummary(sheet: v.sheet),
              const SizedBox(height: AppSpacing.lg),
              KeyFactsGrid(sheet: v.sheet),
              const SizedBox(height: AppSpacing.lg),
              PriceSection(sheet: v.sheet),
              const SizedBox(height: AppSpacing.lg),
              if (exactTours.isNotEmpty && toursEnabled) ...[
                TourHeroCard(carSlug: car.slug, tour: exactTours.first, compact: true),
                const SizedBox(height: AppSpacing.lg),
              ] else ...[
                _TourUnavailableLine(onGallery: () => _tabs.animateTo(CarTab.tours.index)),
                const SizedBox(height: AppSpacing.lg),
              ],
              CarActionsBar(view: v, imageUrl: car.heroImage?.url ?? car.images.firstOrNull?.url),
            ],
          ),
        ),
        if (car.description != null && car.description!.trim().isNotEmpty) ...[
          SectionHeader(
            title: l10n.carsAbout(car.name),
            icon: Icons.info_outline,
            padding: const EdgeInsetsDirectional.only(top: AppSpacing.xl, bottom: AppSpacing.sm),
          ),
          Text(car.description!, style: Theme.of(context).textTheme.bodyLarge),
        ],
      ],
    );
  }

  String _marketName(CarDetail car, String code) {
    for (final m in car.availableMarkets) {
      if (m.code == code) return m.name;
    }
    final cfg = ref.read(appConfigProvider).marketByCode(code);
    if (cfg == null) return code;
    return context.languageCode == 'ar' ? cfg.nameAr : cfg.nameEn;
  }
}

class _TrimLine extends StatelessWidget {
  const _TrimLine({required this.variant, required this.marketName});

  final VariantSummary variant;
  final String marketName;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Icon(Icons.tune, size: 18, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(width: AppSpacing.xs),
        Expanded(
          child: Text(
            context.l10n.carsViewingTrim(
              '${variant.modelYear} ${variant.displayName} (${variant.powertrainType.toUpperCase()})',
              marketName,
            ),
            style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ),
      ],
    );
  }
}

class _TourUnavailableLine extends StatelessWidget {
  const _TourUnavailableLine({required this.onGallery});

  final VoidCallback onGallery;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Row(
        children: [
          Icon(Icons.threesixty, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(width: AppSpacing.md),
          Expanded(child: Text(l10n.carsTourUnavailable, style: theme.textTheme.bodyMedium)),
          TextButton(onPressed: onGallery, child: Text(l10n.carsGalleryTitle)),
        ],
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.car});

  final CarDetail car;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final image = car.heroImage ?? car.images.firstOrNull;
    final powertrains = car.powertrainTypes.map(Powertrain.fromApi).whereType<Powertrain>();
    return Stack(
      fit: StackFit.expand,
      children: [
        DecoratedBox(decoration: BoxDecoration(gradient: context.palette.brandGradient)),
        if (image != null)
          ImageWithFallback(
            url: image.url,
            semanticLabel: image.alt ?? car.title,
            credit: image.credit,
            fallbackIcon: Icons.directions_car_outlined,
            showFallbackText: false,
          )
        else
          Center(
            child: Icon(Icons.directions_car_filled_outlined, size: 96, color: Colors.white.withValues(alpha: 0.35)),
          ),
        IgnorePointer(
          child: DecoratedBox(decoration: BoxDecoration(gradient: context.palette.imageScrim)),
        ),
        PositionedDirectional(
          start: context.pageGutter,
          end: context.pageGutter,
          bottom: kTextTabBarHeight + AppSpacing.md,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                car.brand.name,
                style: theme.textTheme.labelLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
              ),
              Wrap(
                spacing: 6,
                runSpacing: 4,
                children: [
                  for (final p in powertrains) PowertrainPill(powertrain: p, dense: true),
                  if (car.bodyType != null) Pill(label: CarLabels.bodyType(l10n, car.bodyType!), dense: true),
                  if (car.tours.available) const Tour360Badge(dense: true),
                  if (car.isDemo) const DemoBadge(dense: true),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CarPageSkeleton extends StatelessWidget {
  const _CarPageSkeleton();

  @override
  Widget build(BuildContext context) => Skeleton(
    child: Padding(
      padding: EdgeInsets.all(context.pageGutter),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SkeletonBox(height: 180),
          SizedBox(height: AppSpacing.lg),
          SkeletonLine(widthFactor: 0.6, fontSize: 20),
          SizedBox(height: AppSpacing.md),
          SkeletonBox(height: 96),
          SizedBox(height: AppSpacing.md),
          SkeletonBox(height: 140),
        ],
      ),
    ),
  );
}
