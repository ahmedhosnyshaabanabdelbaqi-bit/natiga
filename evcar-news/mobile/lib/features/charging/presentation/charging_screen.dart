import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/app_config/app_config.dart';
import '../../../core/app_config/app_config_controller.dart';
import '../../../core/app_config/features.dart';
import '../../../core/errors/app_errors.dart';
import '../../../shared/widgets/kit.dart';
import '../application/charging_providers.dart';
import '../data/location_service.dart';
import '../domain/station_models.dart';
import '../domain/station_query.dart';
import 'charging_filters_screen.dart';
import 'widgets/charging_labels.dart';
import 'widgets/location_prompts.dart';
import 'widgets/station_card.dart';
import 'widgets/stations_map.dart';

/// Charging tab root (`/charging`, `/charging?view=list`).
///
/// Map and list are two views of the SAME search (area + filters), so they
/// are always synchronized; on wide screens both are shown side by side.
/// The map searches only when the user taps "Search this area" (no request
/// per pan — the API limit is 60/min). Location is requested only when the
/// user asks for "near me"; otherwise searches are centred on a chosen or
/// default city, clearly labelled. Without a configured tile server the tab
/// shows the list with a notice.
class ChargingScreen extends ConsumerStatefulWidget {
  const ChargingScreen({super.key});

  @override
  ConsumerState<ChargingScreen> createState() => _ChargingScreenState();
}

class _ChargingScreenState extends ConsumerState<ChargingScreen> {
  final _map = MapController();
  final _search = TextEditingController();
  bool? _showMap;
  String? _selectedId;
  MapCamera? _movedCamera;
  bool _locating = false;

  @override
  void initState() {
    super.initState();
    _search.text = ref.read(chargingFiltersProvider).query;
    // Silent check only: if access was granted before, centre on the user
    // without prompting. Never asks on open.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      final place = ref.read(chargingPlaceProvider);
      if (place.kind == PlaceKind.device) return;
      final access = await ref.read(locationStatusProvider.notifier).refresh();
      if (!mounted || access != LocationAccess.granted) return;
      await ref.read(locationStatusProvider.notifier).locate();
    });
  }

  @override
  void dispose() {
    _map.dispose();
    _search.dispose();
    super.dispose();
  }

  double _zoomForRadius(double? km) => km == null ? 11 : (14.2 - math.log(km) / math.ln2).clamp(5, 15).toDouble();

  void _moveMapTo(GeoPoint p, double zoom) {
    try {
      _map.move(latLngOf(p), zoom);
    } on Object {
      // Map not built yet (list view): it will open centred on the place.
    }
  }

  Future<void> _useMyLocation() async {
    if (_locating) return;
    setState(() => _locating = true);
    final outcome = await ref.read(locationStatusProvider.notifier).locate();
    if (!mounted) return;
    setState(() => _locating = false);
    await handleLocateOutcome(context, ref, outcome);
  }

  void _searchThisArea() {
    final cam = _movedCamera;
    if (cam == null) return;
    ref.read(chargingAreaProvider.notifier).visibleBounds(boundsOf(cam.visibleBounds), cam.zoom);
    setState(() {
      _movedCamera = null;
      _selectedId = null;
    });
  }

  Future<void> _onLongPress(GeoPoint p) async {
    final l10n = context.l10n;
    final ok = await showConfirmSheet(
      context: context,
      title: l10n.chargingSearchHereTitle,
      message: l10n.chargingSearchHereMessage,
      confirmLabel: l10n.chargingSearchHereAction,
      icon: Icons.place_outlined,
    );
    if (!ok || !mounted) return;
    ref.read(chargingPlaceProvider.notifier).setMapPoint(p);
    ref.read(chargingAreaProvider.notifier).aroundPlace();
  }

  void _select(StationListItem s, {bool moveMap = false}) {
    setState(() => _selectedId = s.id);
    if (moveMap) {
      try {
        _map.move(latLngOf(GeoPoint(s.latitude, s.longitude)), math.max(_map.camera.zoom, 13));
      } on Object {
        // map not ready
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final mapConfig = ref.watch(appConfigProvider.select((c) => c.map));
    final mapUsable = mapConfig.isUsable;
    final wide = context.windowSize == WindowSize.expanded;
    _showMap ??= GoRouterState.of(context).uri.queryParameters['view'] != 'list';
    final showMap = mapUsable && _showMap!;

    // Programmatic place changes (near me, city, long press) move the map.
    ref.listen(chargingAreaProvider, (prev, next) {
      final place = next.place;
      if (next.bounds == null && place != null) {
        _moveMapTo(place.point, _zoomForRadius(next.radiusKm));
        if (_movedCamera != null || _selectedId != null) {
          setState(() {
            _movedCamera = null;
            _selectedId = null;
          });
        }
      }
    });

    final header = _Header(search: _search, locating: _locating, onUseLocation: _useMyLocation);

    final list = _StationsList(
      mapUsable: mapUsable,
      selectedId: wide ? _selectedId : null,
      onUseLocation: _useMyLocation,
      onSelect: wide && mapUsable ? (s) => _select(s, moveMap: true) : null,
    );

    Widget content;
    if (!mapUsable) {
      content = list;
    } else if (wide) {
      content = Row(
        children: [
          SizedBox(width: 420, child: list),
          const VerticalDivider(width: 1),
          Expanded(child: _mapView(mapConfig)),
        ],
      );
    } else {
      content = AnimatedSwitcher(
        duration: AppMotion.of(context, AppMotion.medium),
        child: showMap ? KeyedSubtree(key: const ValueKey('map'), child: _mapView(mapConfig)) : list,
      );
    }

    final showSearch = Features.searchable.any(ref.watch(appConfigProvider).isFeatureEnabled);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.chargingTitle),
        actions: [
          // One toggle showing the other view (map ⇄ list): a two-segment
          // control here truncated the title on phones.
          if (mapUsable && !wide)
            IconButton(
              tooltip: showMap ? l10n.chargingViewList : l10n.chargingViewMap,
              icon: Icon(showMap ? Icons.view_list_outlined : Icons.map_outlined),
              onPressed: () => setState(() => _showMap = !showMap),
            ),
          if (showSearch)
            IconButton(
              tooltip: l10n.shellSearchTooltip,
              icon: const Icon(Icons.manage_search),
              onPressed: () => context.push(AppRoutes.search()),
            ),
        ],
      ),
      body: SafeArea(
        top: false,
        bottom: false,
        child: Column(
          children: [
            header,
            Expanded(child: content),
          ],
        ),
      ),
      floatingActionButton: showMap || wide
          ? null
          : FloatingActionButton.small(
              heroTag: 'charging-suggest',
              tooltip: l10n.chargingSuggestTitle,
              onPressed: () => context.push(AppRoutes.chargingSuggest),
              child: const Icon(Icons.add_location_alt_outlined),
            ),
    );
  }

  Widget _mapView(MapConfig mapConfig) {
    final l10n = context.l10n;
    final area = ref.watch(chargingAreaProvider);
    final place = ref.watch(chargingPlaceProvider);
    final filters = ref.watch(chargingFiltersProvider);
    final search = ref.watch(stationSearchProvider);
    final clusters = ref.watch(stationClustersProvider).value;
    final state = search.value;
    final stations = state == null ? const <StationListItem>[] : visibleStations(state, filters);
    final selected = stations.where((s) => s.id == _selectedId).firstOrNull;
    final now = ref.read(chargingClockProvider)();
    final center = area.bounds != null
        ? GeoPoint(area.bounds!.centerLat, area.bounds!.centerLng)
        : (area.place ?? place).point;

    return Stack(
      children: [
        Positioned.fill(
          child: StationsMap(
            controller: _map,
            config: mapConfig,
            initialCenter: center,
            initialZoom: area.zoom ?? _zoomForRadius(area.radiusKm),
            stations: stations,
            clusters: clusters,
            place: place,
            selectedId: _selectedId,
            bottomPadding: selected != null ? 0 : 56,
            onStationTap: (id) {
              final s = stations.where((x) => x.id == id).firstOrNull;
              if (s != null) _select(s);
            },
            onLongPress: _onLongPress,
            onClusterTap: (c) {
              _moveMapTo(GeoPoint(c.latitude, c.longitude), math.min(_map.camera.zoom + 2.5, 16));
              setState(() => _movedCamera = _map.camera);
            },
            onCameraMoved: (cam) {
              if (_movedCamera == null) {
                setState(() => _movedCamera = cam);
              } else {
                _movedCamera = cam;
              }
            },
          ),
        ),
        if (search.isLoading)
          const PositionedDirectional(top: 0, start: 0, end: 0, child: LinearProgressIndicator(minHeight: 3)),
        if (_movedCamera != null)
          PositionedDirectional(
            top: AppSpacing.md,
            start: 0,
            end: 0,
            child: Center(
              child: FilledButton.icon(
                onPressed: _searchThisArea,
                icon: const Icon(Icons.search),
                label: Text(l10n.chargingSearchThisArea),
              ),
            ),
          ),
        PositionedDirectional(
          end: AppSpacing.lg,
          bottom: (selected != null ? 0 : 64) + AppSpacing.lg,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              FloatingActionButton.small(
                heroTag: 'charging-suggest-map',
                tooltip: l10n.chargingSuggestTitle,
                onPressed: () => context.push(AppRoutes.chargingSuggest),
                child: const Icon(Icons.add_location_alt_outlined),
              ),
              const SizedBox(height: AppSpacing.sm),
              FloatingActionButton.small(
                heroTag: 'charging-locate',
                tooltip: l10n.chargingUseMyLocation,
                onPressed: _locating ? null : _useMyLocation,
                child: _locating
                    ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.my_location),
              ),
            ],
          ),
        ),
        PositionedDirectional(
          start: AppSpacing.md,
          end: AppSpacing.md,
          bottom: AppSpacing.md,
          child: SafeArea(
            top: false,
            child: selected != null && state != null
                ? Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Align(
                        alignment: AlignmentDirectional.centerEnd,
                        child: IconButton.filledTonal(
                          tooltip: l10n.commonClose,
                          onPressed: () => setState(() => _selectedId = null),
                          icon: const Icon(Icons.close),
                        ),
                      ),
                      StationCard(
                        station: selected,
                        fetchedAt: state.fetchedAt,
                        now: now,
                        offlineCopy: state.fromCache,
                        connectorName: ref.watch(stationMetaProvider).value?.data.connectorName,
                        compact: true,
                      ),
                    ],
                  )
                : _MapSummaryBar(
                    value: search,
                    count: stations.length,
                    onShowList: context.windowSize == WindowSize.expanded
                        ? null
                        : () => setState(() => _showMap = false),
                  ),
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Header: title, search, filters, quick chips, view toggle
// ---------------------------------------------------------------------------

class _Header extends ConsumerWidget {
  const _Header({required this.search, required this.locating, required this.onUseLocation});

  final TextEditingController search;
  final bool locating;
  final VoidCallback onUseLocation;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final filters = ref.watch(chargingFiltersProvider);
    final place = ref.watch(chargingPlaceProvider);
    final notifier = ref.read(chargingFiltersProvider.notifier);
    final gutter = context.pageGutter;

    return Material(
      color: theme.colorScheme.surface,
      elevation: 0,
      child: Padding(
        padding: EdgeInsetsDirectional.fromSTEB(gutter, AppSpacing.sm, gutter - AppSpacing.xs, AppSpacing.sm),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsetsDirectional.only(end: AppSpacing.xs),
              child: Row(
                children: [
                  Expanded(
                    child: AppSearchField(
                      controller: search,
                      hintText: l10n.chargingSearchHint,
                      onSubmitted: notifier.setQuery,
                      onChanged: (v) {
                        if (v.isEmpty && filters.query.isNotEmpty) notifier.setQuery('');
                      },
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Badge(
                    isLabelVisible: filters.activeCount > 0,
                    label: Text('${filters.activeCount}'),
                    child: IconButton.filledTonal(
                      tooltip: filters.activeCount > 0
                          ? l10n.commonFiltersActive(filters.activeCount)
                          : l10n.commonFilters,
                      onPressed: () => showStationFiltersSheet(context, ref),
                      icon: const Icon(Icons.tune),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  ActionChip(
                    avatar: locating
                        ? const SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2))
                        : Icon(place.kind == PlaceKind.device ? Icons.my_location : Icons.near_me_outlined, size: 18),
                    label: Text(l10n.chargingNearMe),
                    onPressed: locating ? null : onUseLocation,
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  ActionChip(
                    avatar: const Icon(Icons.place_outlined, size: 18),
                    label: Text(placeLabel(context, place)),
                    tooltip: l10n.chargingChoosePlace,
                    onPressed: () => context.push(AppRoutes.chargingLocation),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  AppFilterChip(
                    label: l10n.chargingQuickDc,
                    icon: Icons.bolt,
                    selected: filters.current == CurrentType.dc,
                    onSelected: (on) => notifier.set(filters.copyWith(current: () => on ? CurrentType.dc : null)),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  AppFilterChip(
                    label: l10n.chargingFilterOpenNow,
                    icon: Icons.schedule,
                    selected: filters.openNow,
                    onSelected: (on) => notifier.set(filters.copyWith(openNow: on)),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  AppFilterChip(
                    label: filters.vehicle == null
                        ? l10n.chargingQuickMyCar
                        : l10n.chargingQuickMyCarNamed(filters.vehicle!.name),
                    icon: Icons.directions_car_outlined,
                    selected: filters.vehicle != null,
                    onSelected: (on) {
                      if (on) {
                        showStationFiltersSheet(context, ref);
                      } else {
                        notifier.clearVehicle();
                      }
                    },
                  ),
                  const SizedBox(width: AppSpacing.xs),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Bottom bar of the map when no station is selected.
class _MapSummaryBar extends StatelessWidget {
  const _MapSummaryBar({required this.value, required this.count, this.onShowList});

  final AsyncValue<StationSearchState> value;
  final int count;
  final VoidCallback? onShowList;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final state = value.value;
    final String text;
    IconData icon = Icons.ev_station_outlined;
    if (value.hasError && state == null) {
      final e = value.error!;
      text = isCompatibilityUnknown(e) ? l10n.chargingCompatUnknownShort : errorMessage(l10n, e);
      icon = Icons.error_outline;
    } else if (state == null) {
      text = l10n.chargingSearching;
    } else if (count == 0) {
      text = l10n.chargingNoStationsHere;
      icon = Icons.search_off;
    } else {
      text = state.truncated ? l10n.chargingResultsTruncated(count) : l10n.chargingResultsCount(count);
    }
    return Material(
      elevation: 3,
      color: theme.colorScheme.surface,
      borderRadius: AppRadii.pill,
      child: InkWell(
        borderRadius: AppRadii.pill,
        onTap: onShowList,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.lg, AppSpacing.sm, AppSpacing.md, AppSpacing.sm),
            child: Row(
              children: [
                Icon(icon, color: theme.colorScheme.primary),
                const SizedBox(width: AppSpacing.sm),
                Expanded(child: Text(text, style: theme.textTheme.bodyMedium)),
                if (state?.fromCache ?? false) ...[
                  const SizedBox(width: AppSpacing.xs),
                  Pill(label: l10n.chargingSavedCopy, icon: Icons.history, dense: true),
                ],
                if (onShowList != null) ...[
                  const SizedBox(width: AppSpacing.xs),
                  Text(
                    l10n.chargingViewList,
                    style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.primary),
                  ),
                  Icon(Icons.chevron_right, color: theme.colorScheme.primary),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

class _StationsList extends ConsumerWidget {
  const _StationsList({required this.mapUsable, required this.onUseLocation, this.selectedId, this.onSelect});

  final bool mapUsable;
  final VoidCallback onUseLocation;
  final String? selectedId;
  final ValueChanged<StationListItem>? onSelect;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final search = ref.watch(stationSearchProvider);
    final filters = ref.watch(chargingFiltersProvider);
    final area = ref.watch(chargingAreaProvider);
    final meta = ref.watch(stationMetaProvider).value?.data;
    final now = ref.read(chargingClockProvider)();
    final gutter = context.pageGutter;

    Future<void> refresh() async {
      ref.invalidate(stationSearchProvider);
      await ref.read(stationSearchProvider.future).then((_) {}, onError: (Object _) {});
    }

    final state = search.value;
    return RefreshIndicator.adaptive(
      onRefresh: refresh,
      child: CustomScrollView(
        slivers: [
          if (!mapUsable) SliverToBoxAdapter(child: _Notice.mapNotConfigured(context)),
          SliverToBoxAdapter(child: _AreaBanner(onUseLocation: onUseLocation)),
          if (state?.fromCache ?? false)
            SliverToBoxAdapter(
              child: CachedDataNotice(savedAt: state!.fetchedAt, onRetry: refresh),
            ),
          if (state?.fromCache ?? false) SliverToBoxAdapter(child: _Notice.noLiveOffline(context)),
          if (filters.vehicle != null && state?.compatibility != null)
            SliverToBoxAdapter(child: _Notice.compatibility(context, state!.compatibility!, filters.vehicle!.name)),
          if (state?.truncated ?? false) SliverToBoxAdapter(child: _Notice.truncated(context)),
          if (search.hasError && !search.isLoading && isCompatibilityUnknown(search.error))
            SliverFillRemaining(
              hasScrollBody: false,
              child: StateMessageView(
                kind: StateKind.error,
                icon: Icons.directions_car_outlined,
                title: l10n.chargingCompatUnknownTitle,
                message: errorMessage(l10n, search.error!),
                actions: [
                  StateAction(
                    label: l10n.chargingRemoveCarFilter,
                    icon: Icons.filter_alt_off_outlined,
                    primary: true,
                    onPressed: () => ref.read(chargingFiltersProvider.notifier).clearVehicle(),
                  ),
                ],
              ),
            )
          else
            SliverAsyncStateView<StationSearchState>(
              value: search,
              onRetry: () => ref.invalidate(stationSearchProvider),
              loading: Padding(
                padding: EdgeInsets.all(gutter),
                child: Column(
                  children: [
                    for (var i = 0; i < 3; i++) ...[
                      const StationCardSkeleton(),
                      const SizedBox(height: AppSpacing.cardGap),
                    ],
                  ],
                ),
              ),
              isEmpty: (s) => visibleStations(s, filters).isEmpty,
              emptyIcon: Icons.ev_station_outlined,
              emptyTitle: l10n.chargingEmptyTitle,
              emptyMessage: filters.isEmpty ? l10n.chargingEmptyMessage : l10n.chargingEmptyFilteredMessage,
              emptyActions: [
                if (!filters.isEmpty)
                  StateAction(
                    label: l10n.chargingClearFilters,
                    icon: Icons.filter_alt_off_outlined,
                    primary: true,
                    onPressed: () {
                      ref.read(chargingFiltersProvider.notifier).clear();
                    },
                  ),
                if (area.bounds == null && (area.radiusKm ?? 0) < 100)
                  StateAction(
                    label: l10n.chargingWidenSearch,
                    icon: Icons.zoom_out_map,
                    onPressed: () => ref.read(chargingAreaProvider.notifier).aroundPlace(radiusKm: 100),
                  ),
                StateAction(
                  label: l10n.chargingSuggestTitle,
                  icon: Icons.add_location_alt_outlined,
                  onPressed: () => context.push(AppRoutes.chargingSuggest),
                ),
              ],
              builder: (context, s) {
                final items = visibleStations(s, filters);
                return SliverPadding(
                  padding: EdgeInsetsDirectional.fromSTEB(gutter, AppSpacing.sm, gutter, AppSpacing.xxxl * 2),
                  sliver: SliverList.separated(
                    itemCount: items.length + 1,
                    separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.cardGap),
                    itemBuilder: (context, i) {
                      if (i == items.length) return _ListFooter(state: s);
                      if (i >= items.length - 5 && s.hasMore && !s.loadingMore && s.loadMoreError == null) {
                        Future.microtask(() => ref.read(stationSearchProvider.notifier).loadMore());
                      }
                      final item = items[i];
                      return StationCard(
                        station: item,
                        fetchedAt: s.fetchedAt,
                        now: now,
                        offlineCopy: s.fromCache,
                        connectorName: meta?.connectorName,
                        selected: item.id == selectedId,
                        onTap: onSelect == null ? null : () => onSelect!(item),
                      );
                    },
                  ),
                );
              },
            ),
        ],
      ),
    );
  }
}

/// Compatibility-unknown and other errors get a specific way forward.
class _ListFooter extends ConsumerWidget {
  const _ListFooter({required this.state});

  final StationSearchState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    if (state.loadingMore) {
      return const Padding(
        padding: EdgeInsets.all(AppSpacing.lg),
        child: Center(child: CircularProgressIndicator.adaptive()),
      );
    }
    if (state.loadMoreError != null) {
      return Row(
        children: [
          Expanded(child: Text(errorMessage(l10n, state.loadMoreError!))),
          TextButton(
            onPressed: () => ref.read(stationSearchProvider.notifier).loadMore(),
            child: Text(l10n.commonRetry),
          ),
        ],
      );
    }
    final total = state.total;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (!state.hasMore && total != null)
            Text(
              l10n.chargingEndOfResults(total),
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          // Explained once, below the results, instead of on every card.
          if (!state.fromCache && !state.liveAvailability.configured)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.md),
              child: HelpNote(icon: Icons.sensors_off_outlined, text: l10n.chargingNoLiveProvider),
            ),
        ],
      ),
    );
  }
}

/// "Around Cairo (default) · 25 km" + actions to change the place.
class _AreaBanner extends ConsumerWidget {
  const _AreaBanner({required this.onUseLocation});

  final VoidCallback onUseLocation;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final fmt = AppFormatters.of(context);
    final area = ref.watch(chargingAreaProvider);
    final place = ref.watch(chargingPlaceProvider);
    final String text = area.bounds != null
        ? l10n.chargingAreaVisibleMap
        : l10n.chargingAreaAround(placeLabel(context, area.place ?? place), fmt.distanceKm(area.radiusKm)!);
    final isDefault = (area.place ?? place).kind == PlaceKind.marketDefault;
    return Padding(
      padding: EdgeInsetsDirectional.fromSTEB(context.pageGutter, AppSpacing.md, context.pageGutter, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(area.bounds != null ? Icons.crop_free : Icons.radar, size: 18, color: theme.colorScheme.primary),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(text, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
              ),
            ],
          ),
          if (isDefault) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              l10n.chargingDefaultPlaceHint,
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: AppSpacing.xs),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.xs,
              children: [
                TextButton.icon(
                  onPressed: onUseLocation,
                  icon: const Icon(Icons.my_location, size: 18),
                  label: Text(l10n.chargingUseMyLocation),
                ),
                TextButton.icon(
                  onPressed: () => context.push(AppRoutes.chargingLocation),
                  icon: const Icon(Icons.location_city_outlined, size: 18),
                  label: Text(l10n.chargingChoosePlace),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Small informational banners of the list.
class _Notice extends StatelessWidget {
  const _Notice({required this.icon, required this.text, this.tone = AppTone.info});

  factory _Notice.mapNotConfigured(BuildContext context) =>
      _Notice(icon: Icons.map_outlined, text: context.l10n.chargingMapNotConfigured);

  factory _Notice.noLiveOffline(BuildContext context) =>
      _Notice(icon: Icons.cloud_off_outlined, text: context.l10n.chargingOfflineNoLive, tone: AppTone.warning);

  factory _Notice.truncated(BuildContext context) =>
      _Notice(icon: Icons.zoom_in, text: context.l10n.chargingTruncatedHint, tone: AppTone.warning);

  factory _Notice.compatibility(BuildContext context, VehicleCompatibility c, String name) => _Notice(
    icon: Icons.verified_outlined,
    tone: AppTone.brand,
    text: [
      context.l10n.chargingCompatNotice(c.vehicleName ?? name),
      if (c.ignoredInlets > 0) context.l10n.chargingCompatIgnored(c.ignoredInlets),
      ?c.note,
    ].join(' '),
  );

  final IconData icon;
  final String text;
  final AppTone tone;

  @override
  Widget build(BuildContext context) {
    final colors = context.palette.tone(tone);
    final theme = Theme.of(context);
    return Padding(
      padding: EdgeInsetsDirectional.fromSTEB(context.pageGutter, AppSpacing.sm, context.pageGutter, 0),
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: colors.container,
          borderRadius: const BorderRadius.all(Radius.circular(AppRadii.md)),
          border: Border.all(color: colors.border),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 20, color: colors.onContainer),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(text, style: theme.textTheme.bodySmall?.copyWith(color: colors.onContainer)),
            ),
          ],
        ),
      ),
    );
  }
}

/// Muted inline note with an icon.
class HelpNote extends StatelessWidget {
  const HelpNote({super.key, required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = theme.colorScheme.onSurfaceVariant;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: color),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Text(text, style: theme.textTheme.bodySmall?.copyWith(color: color)),
        ),
      ],
    );
  }
}
