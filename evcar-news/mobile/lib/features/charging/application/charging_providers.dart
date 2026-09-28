import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/cache/cached_fetch.dart';
import '../../../core/settings/settings_controller.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/location_service.dart';
import '../data/stations_repository.dart';
import '../domain/city_presets.dart';
import '../domain/station_models.dart';
import '../domain/station_query.dart';

/// Server error code when a car has no verified inlet data (backend §3).
const compatibilityUnknownCode = 'VEHICLE_COMPATIBILITY_UNKNOWN';

bool isCompatibilityUnknown(Object? e) => e is ApiException && e.code == compatibilityUnknownCode;

/// Injectable clock (tests pin time for expiry / open-now rules).
final chargingClockProvider = Provider<DateTime Function()>((ref) => () => DateTime.now().toUtc());

// ---------------------------------------------------------------------------
// Reference place (device location / city / map point)
// ---------------------------------------------------------------------------

/// SharedPreferences key of the city the user picked (a city id — never
/// coordinates of the device).
const chargingCityPrefKey = 'charging.city.v1';

/// The reference point of searches and distances.
///
/// Starts at the city the user picked earlier, else the market's main city
/// (clearly labelled as a default). The device position, when the user asks
/// for it, lives only in this in-memory state.
class ChargingPlaceController extends Notifier<SearchPlace> {
  @override
  SearchPlace build() {
    // Language is read (not watched) so switching it keeps a located point;
    // city names are rendered from [SearchPlace.cityId] in the UI language.
    final lang = ref.read(effectiveLanguageProvider);
    final market = ref.watch(effectiveMarketProvider.select((m) => m.code));
    final saved = cityById(ref.read(sharedPreferencesProvider).getString(chargingCityPrefKey));
    if (saved != null) return saved.toPlace(lang);
    return defaultCityFor(market).toPlace(lang, kind: PlaceKind.marketDefault);
  }

  void setCity(CityPreset city) {
    unawaited(ref.read(sharedPreferencesProvider).setString(chargingCityPrefKey, city.id));
    state = city.toPlace(ref.read(effectiveLanguageProvider));
  }

  /// A point chosen on the map (not persisted).
  void setMapPoint(GeoPoint point) => state = SearchPlace(point: point, kind: PlaceKind.mapPoint);

  /// The device position (not persisted).
  void setDevice(GeoPoint point) => state = SearchPlace(point: point, kind: PlaceKind.device);
}

final chargingPlaceProvider = NotifierProvider<ChargingPlaceController, SearchPlace>(ChargingPlaceController.new);

/// Outcome of "use my location".
enum LocateOutcome { located, denied, deniedForever, serviceDisabled, unavailable }

/// Location permission status as last seen (null = not checked yet).
class LocationStatusController extends Notifier<LocationAccess?> {
  @override
  LocationAccess? build() => null;

  LocationService get _service => ref.read(locationServiceProvider);

  /// Checks silently (no prompt) — used to decide whether to offer the
  /// "near me" shortcut; never asks on its own.
  Future<LocationAccess> refresh() async {
    final access = await _service.check();
    if (ref.mounted) state = access;
    return access;
  }

  /// Asks for while-in-use access (only after an explicit user action) and,
  /// when granted, sets the device position as the reference place.
  Future<LocateOutcome> locate() async {
    final access = await _service.request();
    if (!ref.mounted) return LocateOutcome.unavailable;
    state = access;
    switch (access) {
      case LocationAccess.granted:
        final pos = await _service.currentPosition();
        if (pos == null || !ref.mounted) return LocateOutcome.unavailable;
        ref.read(chargingPlaceProvider.notifier).setDevice(pos);
        ref.read(chargingAreaProvider.notifier).aroundPlace();
        return LocateOutcome.located;
      case LocationAccess.denied:
        return LocateOutcome.denied;
      case LocationAccess.deniedForever:
        return LocateOutcome.deniedForever;
      case LocationAccess.serviceDisabled:
        return LocateOutcome.serviceDisabled;
      case LocationAccess.unavailable:
        return LocateOutcome.unavailable;
    }
  }
}

final locationStatusProvider = NotifierProvider<LocationStatusController, LocationAccess?>(
  LocationStatusController.new,
);

// ---------------------------------------------------------------------------
// Filters + committed search area
// ---------------------------------------------------------------------------

class ChargingFiltersController extends Notifier<StationFilters> {
  @override
  StationFilters build() => StationFilters.empty;

  void set(StationFilters filters) => state = filters;

  void setQuery(String q) => state = state.copyWith(query: q);

  void clear() => state = state.cleared();

  void clearVehicle() => state = state.copyWith(vehicle: () => null);
}

final chargingFiltersProvider = NotifierProvider<ChargingFiltersController, StationFilters>(
  ChargingFiltersController.new,
);

/// The area the current results cover. Map and list read the same area and
/// the same results, so they are always in sync.
class ChargingAreaController extends Notifier<SearchArea> {
  @override
  SearchArea build() => SearchArea.around(ref.read(chargingPlaceProvider));

  /// Search around the current reference place (after locating / picking).
  void aroundPlace({double radiusKm = SearchArea.defaultRadiusKm}) =>
      state = SearchArea.around(ref.read(chargingPlaceProvider), radiusKm: radiusKm);

  /// "Search this area": the visible map rectangle; distances stay relative
  /// to the reference place.
  void visibleBounds(GeoBounds bounds, double zoom) =>
      state = SearchArea.bounds(bounds, place: ref.read(chargingPlaceProvider), zoom: zoom);
}

final chargingAreaProvider = NotifierProvider<ChargingAreaController, SearchArea>(ChargingAreaController.new);

// ---------------------------------------------------------------------------
// Meta, cars
// ---------------------------------------------------------------------------

final stationMetaProvider = FutureProvider<CachedResult<StationMeta>>((ref) {
  ref.watch(requestLocaleProvider);
  return ref.watch(stationsRepositoryProvider).meta();
});

/// Garage cars of the signed-in user (empty for guests).
final myChargingCarsProvider = FutureProvider.autoDispose<List<GarageCar>>((ref) async {
  final signedIn = ref.watch(authControllerProvider.select((s) => s.isSignedIn));
  if (!signedIn) return const [];
  return ref.watch(stationsRepositoryProvider).myCars();
});

// ---------------------------------------------------------------------------
// Search (map + list)
// ---------------------------------------------------------------------------

class StationSearchState {
  const StationSearchState({
    required this.items,
    required this.fetchedAt,
    this.fromCache = false,
    this.nextCursor,
    this.total,
    this.truncated = false,
    this.liveAvailability = LiveAvailabilityInfo.none,
    this.compatibility,
    this.loadingMore = false,
    this.loadMoreError,
  });

  final List<StationListItem> items;

  /// When the results were fetched (or saved, for an offline copy).
  final DateTime fetchedAt;

  /// Offline copy: label it and never show live status.
  final bool fromCache;
  final String? nextCursor;
  final int? total;
  final bool truncated;
  final LiveAvailabilityInfo liveAvailability;
  final VehicleCompatibility? compatibility;
  final bool loadingMore;
  final Object? loadMoreError;

  bool get hasMore => !fromCache && nextCursor != null;

  StationSearchState copyWith({
    List<StationListItem>? items,
    String? Function()? nextCursor,
    bool? loadingMore,
    Object? Function()? loadMoreError,
  }) => StationSearchState(
    items: items ?? this.items,
    fetchedAt: fetchedAt,
    fromCache: fromCache,
    nextCursor: nextCursor != null ? nextCursor() : this.nextCursor,
    total: total,
    truncated: truncated,
    liveAvailability: liveAvailability,
    compatibility: compatibility,
    loadingMore: loadingMore ?? this.loadingMore,
    loadMoreError: loadMoreError != null ? loadMoreError() : this.loadMoreError,
  );
}

/// Distances for a saved copy (stripped before storage) are recomputed
/// from the current reference place, in memory.
List<StationListItem> withLocalDistances(List<StationListItem> items, SearchPlace? place) {
  if (place == null) return items;
  final list = [
    for (final s in items)
      s.copyWith(distanceM: () => haversineMeters(place.point.lat, place.point.lng, s.latitude, s.longitude)),
  ];
  list.sort((a, b) => a.distanceM!.compareTo(b.distanceM!));
  return list;
}

class StationSearchController extends AsyncNotifier<StationSearchState> {
  StationsRepository get _repo => ref.read(stationsRepositoryProvider);

  @override
  Future<StationSearchState> build() async {
    ref.watch(requestLocaleProvider);
    final area = ref.watch(chargingAreaProvider);
    final filters = ref.watch(chargingFiltersProvider);
    final res = await ref.watch(stationsRepositoryProvider).search(area, filters);
    final page = res.data;
    final items = res.fromCache ? withLocalDistances(page.items, area.place) : page.items;
    return StationSearchState(
      items: items,
      fetchedAt: res.fromCache ? res.savedAt : ref.read(chargingClockProvider)(),
      fromCache: res.fromCache,
      nextCursor: page.nextCursor,
      total: page.total,
      truncated: page.truncated,
      liveAvailability: page.liveAvailability,
      compatibility: page.compatibility,
    );
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || current.loadingMore || !current.hasMore || state.isLoading) return;
    state = AsyncData(current.copyWith(loadingMore: true, loadMoreError: () => null));
    try {
      final res = await _repo.search(
        ref.read(chargingAreaProvider),
        ref.read(chargingFiltersProvider),
        cursor: current.nextCursor,
      );
      if (!ref.mounted) return;
      final latest = state.value ?? current;
      final seen = {for (final s in latest.items) s.id};
      state = AsyncData(
        latest.copyWith(
          items: [
            ...latest.items,
            for (final s in res.data.items)
              if (seen.add(s.id)) s,
          ],
          nextCursor: () => res.data.items.isEmpty ? null : res.data.nextCursor,
          loadingMore: false,
        ),
      );
    } on Object catch (e) {
      if (!ref.mounted) return;
      state = AsyncData((state.value ?? current).copyWith(loadingMore: false, loadMoreError: () => e));
    }
  }
}

final stationSearchProvider = AsyncNotifierProvider<StationSearchController, StationSearchState>(
  StationSearchController.new,
);

/// Server clusters for the map when zoomed out (< 9) or when the result was
/// truncated. `null` = use client-side clustering of the list results.
final stationClustersProvider = FutureProvider.autoDispose<List<StationCluster>?>((ref) async {
  ref.watch(requestLocaleProvider);
  final area = ref.watch(chargingAreaProvider);
  final filters = ref.watch(chargingFiltersProvider);
  final bounds = area.bounds;
  final zoom = area.zoom;
  if (bounds == null || zoom == null) return null;
  final truncated = ref.watch(stationSearchProvider.select((s) => s.value?.truncated ?? false));
  if (zoom >= 9 && !truncated) return null;
  try {
    return await ref.watch(stationsRepositoryProvider).clusters(bounds, zoom.floor(), filters);
  } on ApiException catch (e) {
    if (e.isConnectivityProblem) return null;
    rethrow;
  }
});

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

class StationDetailView {
  const StationDetailView({
    required this.station,
    required this.fetchedAt,
    this.fromCache = false,
    this.compatibilityError,
  });

  final StationDetail station;

  /// Fetch time (or save time of an offline copy).
  final DateTime fetchedAt;
  final bool fromCache;

  /// Set when compatibility for the chosen car could not be determined
  /// (the station is then shown without it).
  final ApiException? compatibilityError;
}

final stationDetailProvider = FutureProvider.autoDispose.family<StationDetailView, String>((ref, id) async {
  ref.watch(requestLocaleProvider);
  final vehicle = ref.watch(chargingFiltersProvider.select((f) => f.vehicle));
  final place = ref.read(chargingPlaceProvider);
  final repo = ref.watch(stationsRepositoryProvider);
  final now = ref.read(chargingClockProvider);
  ApiException? compatError;
  CachedResult<StationDetail> res;
  try {
    res = await repo.detail(id, from: place.point, vehicle: vehicle);
  } on ApiException catch (e) {
    if (vehicle == null || !isCompatibilityUnknown(e)) rethrow;
    compatError = e;
    res = await repo.detail(id, from: place.point);
  }
  return StationDetailView(
    station: res.data,
    fetchedAt: res.fromCache ? res.savedAt : now(),
    fromCache: res.fromCache,
    compatibilityError: compatError,
  );
});

/// Results after the device-side filters (operator names).
List<StationListItem> visibleStations(StationSearchState s, StationFilters f) =>
    f.operatorNames.isEmpty ? s.items : [for (final x in s.items) if (f.matchesLocally(x)) x];

/// Operator names present in the loaded results (for the operator filter).
List<String> operatorNamesOf(StationSearchState? s) {
  if (s == null) return const [];
  final names = <String>{for (final x in s.items) ?x.operatorName};
  return names.toList()..sort();
}
