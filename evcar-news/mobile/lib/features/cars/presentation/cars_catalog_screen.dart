import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/di/providers.dart';
import '../../../app/router/app_routes.dart';
import '../../../shared/widgets/kit.dart';
import '../application/cars_providers.dart';
import '../domain/cars_query.dart';
import 'widgets/car_list_slivers.dart';
import 'widgets/car_summary_card.dart';
import 'widgets/catalog_filter_sheet.dart';

/// Cars tab root (`/cars`): brands strip, search, filters (powertrain,
/// body, local price range, minimum range WITH its cycle, seats, sort) and
/// the market-aware list of models. Changing the market in settings reloads
/// everything (prices and availability are per market).
class CarsCatalogScreen extends ConsumerStatefulWidget {
  const CarsCatalogScreen({super.key});

  @override
  ConsumerState<CarsCatalogScreen> createState() => _CarsCatalogScreenState();
}

class _CarsCatalogScreenState extends ConsumerState<CarsCatalogScreen> {
  CarsQuery _query = const CarsQuery();
  final _search = TextEditingController();
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onSearch(String text) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      if (!mounted) return;
      final t = text.trim();
      setState(() => _query = _query.copyWith(q: () => t.isEmpty ? null : t));
    });
  }

  Future<void> _refresh() async {
    ref.invalidate(brandsProvider);
    ref.invalidate(catalogProvider(_query));
    try {
      await ref.read(catalogProvider(_query).future);
    } on Object {
      // The error state is rendered by the list.
    }
  }

  Future<void> _openFilters(String? currency, String marketName) async {
    final next = await showCatalogFilterSheet(context, initial: _query, currencyCode: currency, marketName: marketName);
    if (next != null && mounted) setState(() => _query = next);
  }

  void _togglePowertrain(String code, bool on) {
    final next = {..._query.powertrains};
    on ? next.add(code) : next.remove(code);
    setState(() => _query = _query.copyWith(powertrains: next));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final market = ref.watch(effectiveMarketProvider);
    final marketName = context.languageCode == 'ar' ? market.nameAr : market.nameEn;
    final catalog = ref.watch(catalogProvider(_query));
    final state = catalog.value;
    final currency = state?.currencyCode ?? market.currency;

    return AppScaffold.slivers(
      title: l10n.carsCatalogTitle,
      largeTitle: true,
      onRefresh: _refresh,
      bottomBar: const CompareTrayBar(),
      actions: [
        IconButton(
          tooltip: l10n.carsBrandsTitle,
          icon: const Icon(Icons.grid_view_rounded),
          onPressed: () => context.push(AppRoutes.brands),
        ),
        IconButton(
          tooltip: l10n.shellSearchTooltip,
          icon: const Icon(Icons.search),
          onPressed: () => context.push(AppRoutes.search()),
        ),
      ],
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: context.pageGutter),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AppSearchField(controller: _search, hintText: l10n.carsSearchHint, onChanged: _onSearch),
                const SizedBox(height: AppSpacing.sm),
                _MarketLine(marketName: marketName, currency: currency),
              ],
            ),
          ),
        ),
        const SliverToBoxAdapter(child: _BrandsStrip()),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.only(top: AppSpacing.sm, bottom: AppSpacing.md),
            child: FilterBar(
              activeCount: _query.activeCount,
              onOpenFilters: () => _openFilters(currency, marketName),
              chips: [
                for (final p in powertrainCodes)
                  AppFilterChip(
                    label: p,
                    selected: _query.powertrains.contains(p),
                    onSelected: (on) => _togglePowertrain(p, on),
                  ),
                if (_query.minRangeKm != null)
                  InputChip(
                    label: Text(
                      '${l10n.carsFilterAtLeast(AppFormatters.of(context).distanceKm(_query.minRangeKm)!)} · ${_query.rangeCycle}',
                    ),
                    onDeleted: () => setState(() => _query = _query.copyWith(minRangeKm: () => null)),
                    deleteButtonTooltipMessage: l10n.carsFilterRemove,
                  ),
                if (_query.hasFilters)
                  ActionChip(
                    avatar: const Icon(Icons.filter_alt_off_outlined, size: 18),
                    label: Text(l10n.carsFilterClear),
                    onPressed: () {
                      _search.clear();
                      setState(() => _query = CarsQuery(brand: _query.brand));
                    },
                  ),
              ],
            ),
          ),
        ),
        if (state != null && state.fromCache && state.savedAt != null)
          SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.fromLTRB(context.pageGutter, 0, context.pageGutter, AppSpacing.md),
              child: CachedDataNotice(savedAt: state.savedAt!, onRetry: _refresh),
            ),
          ),
        if (state != null && state.items.isNotEmpty && state.total != null)
          SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.fromLTRB(context.pageGutter, 0, context.pageGutter, AppSpacing.sm),
              child: Semantics(
                liveRegion: true,
                child: Text(
                  l10n.carsResultCount(state.total!),
                  style: Theme.of(context).textTheme.labelLarge
                      ?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
                ),
              ),
            ),
          ),
        SliverAsyncStateView(
          value: catalog,
          onRetry: () => ref.invalidate(catalogProvider(_query)),
          isEmpty: (s) => s.items.isEmpty,
          loading: const CarListSkeleton(),
          emptyIcon: Icons.directions_car_outlined,
          emptyTitle: _query.hasFilters ? l10n.carsNoMatchTitle : l10n.carsEmptyTitle,
          emptyMessage: _query.hasFilters ? l10n.carsNoMatchMessage : l10n.carsEmptyMessage(marketName),
          emptyActions: _query.hasFilters
              ? [
                  StateAction(
                    label: l10n.carsFilterClear,
                    icon: Icons.filter_alt_off_outlined,
                    primary: true,
                    onPressed: () {
                      _search.clear();
                      setState(() => _query = const CarsQuery());
                    },
                  ),
                ]
              : [
                  StateAction(
                    label: l10n.carsChangeMarket,
                    icon: Icons.public,
                    onPressed: () => context.push(AppRoutes.settings),
                  ),
                ],
          builder: (context, s) => SliverCarCards(
            cars: s.items,
            onNearEnd: s.hasMore ? () => ref.read(catalogProvider(_query).notifier).loadMore() : null,
          ),
        ),
        if (state != null && state.items.isNotEmpty)
          SliverToBoxAdapter(
            child: _LoadMoreFooter(
              loading: state.loadingMore,
              error: state.loadMoreError,
              hasMore: state.hasMore,
              onRetry: () => ref.read(catalogProvider(_query).notifier).loadMore(),
            ),
          ),
      ],
    );
  }
}

class _MarketLine extends StatelessWidget {
  const _MarketLine({required this.marketName, required this.currency});

  final String marketName;
  final String? currency;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = context.l10n;
    final text = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.public, size: 18, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(width: AppSpacing.xs),
        Flexible(
          child: Text(
            currency == null ? l10n.carsMarketLineNoCurrency(marketName) : l10n.carsMarketLine(marketName, currency!),
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ),
      ],
    );
    // Side by side on normal text; the button wraps under the text when large.
    return Wrap(
      alignment: WrapAlignment.spaceBetween,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        text,
        TextButton(onPressed: () => context.push(AppRoutes.settings), child: Text(l10n.carsChangeMarket)),
      ],
    );
  }
}

class _BrandsStrip extends ConsumerWidget {
  const _BrandsStrip();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final brands = ref.watch(brandsProvider);
    return brands.when(
      skipLoadingOnRefresh: true,
      loading: () => Padding(
        padding: EdgeInsets.symmetric(horizontal: context.pageGutter, vertical: AppSpacing.md),
        child: const Skeleton(
          child: Row(
            children: [
              SkeletonCircle(size: 56),
              SizedBox(width: AppSpacing.lg),
              SkeletonCircle(size: 56),
              SizedBox(width: AppSpacing.lg),
              SkeletonCircle(size: 56),
              SizedBox(width: AppSpacing.lg),
              SkeletonCircle(size: 56),
            ],
          ),
        ),
      ),
      // The list below shows the real error; a failed strip just stays out of the way.
      error: (_, _) => const SizedBox.shrink(),
      data: (res) {
        final list = [...res.data]..sort((a, b) => (b.carCount ?? 0).compareTo(a.carCount ?? 0));
        final withCars = list.where((b) => (b.carCount ?? 0) > 0).take(16).toList();
        if (withCars.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SectionHeader(
              title: l10n.carsBrandsTitle,
              icon: Icons.workspace_premium_outlined,
              padding: EdgeInsetsDirectional.fromSTEB(context.pageGutter, AppSpacing.lg, AppSpacing.xs, 0),
              onSeeAll: () => context.push(AppRoutes.brands),
            ),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: EdgeInsets.symmetric(horizontal: context.pageGutter - AppSpacing.xs),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final b in withCars) BrandTile(brand: b, onTap: () => context.push(AppRoutes.brand(b.slug))),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _LoadMoreFooter extends StatelessWidget {
  const _LoadMoreFooter({required this.loading, required this.error, required this.hasMore, required this.onRetry});

  final bool loading;
  final Object? error;
  final bool hasMore;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    Widget child;
    if (loading) {
      child = const Center(child: CircularProgressIndicator.adaptive());
    } else if (error != null) {
      child = ErrorState(error: error!, onRetry: onRetry, compact: true);
    } else if (!hasMore) {
      child = Center(
        child: Text(
          l10n.carsEndOfList,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
        ),
      );
    } else {
      child = const SizedBox(height: 48);
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
      child: child,
    );
  }
}

/// Exposed for the brand screen: label of a car count.
String brandCarsLabel(AppLocalizations l10n, int? count) =>
    count == null ? l10n.commonNotAvailable : (count == 0 ? l10n.carsBrandNoCarsInMarket : l10n.carsModelCount(count));
