import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/cache/cached_fetch.dart';
import '../../charging/data/location_service.dart';
import '../../search/application/paged_state.dart';
import '../data/services_repository.dart';
import '../domain/service_models.dart';

/// Outcome of "near me" in the directory.
enum NearMeOutcome { located, denied, deniedForever, serviceDisabled, unavailable }

/// Current directory filters (kept while the app runs; the near-me point is
/// memory only and cleared when the user turns it off).
class ServiceFiltersController extends Notifier<ServiceFilters> {
  @override
  ServiceFilters build() {
    // A different market has different cities / providers.
    ref.watch(effectiveMarketProvider.select((m) => m.code));
    return const ServiceFilters();
  }

  void set(ServiceFilters filters) => state = filters;

  void setType(String? type) => state = state.copyWith(type: () => type);

  void setCity(String? city) => state = state.copyWith(city: () => city);

  void setQuery(String q) => state = state.copyWith(q: () => q.trim().isEmpty ? null : q.trim());

  void setOpenNow(bool on) => state = state.copyWith(openNow: on);

  void clearNearMe() => state = state.copyWith(point: () => null);

  void clear() => state = ServiceFilters(q: state.q);

  /// Asks for while-in-use location (explicit user action only) and sorts by
  /// distance from the device.
  Future<NearMeOutcome> nearMe() async {
    final service = ref.read(locationServiceProvider);
    final access = await service.request();
    switch (access) {
      case LocationAccess.granted:
        final pos = await service.currentPosition();
        if (pos == null || !ref.mounted) return NearMeOutcome.unavailable;
        state = state.copyWith(point: () => (lat: pos.lat, lng: pos.lng), city: () => null);
        return NearMeOutcome.located;
      case LocationAccess.denied:
        return NearMeOutcome.denied;
      case LocationAccess.deniedForever:
        return NearMeOutcome.deniedForever;
      case LocationAccess.serviceDisabled:
        return NearMeOutcome.serviceDisabled;
      case LocationAccess.unavailable:
        return NearMeOutcome.unavailable;
    }
  }
}

final serviceFiltersProvider = NotifierProvider<ServiceFiltersController, ServiceFilters>(
  ServiceFiltersController.new,
);

final serviceTypesProvider = FutureProvider.autoDispose<CachedResult<List<ServiceTypeCount>>>((ref) {
  ref.watch(requestLocaleProvider);
  return ref.watch(servicesRepositoryProvider).types();
});

class ServicesListController extends PagedController<ServiceProvider> {
  ServicesListController(this.filters);

  final ServiceFilters filters;

  @override
  void watchDependencies() {
    ref.watch(requestLocaleProvider);
    ref.watch(servicesRepositoryProvider);
  }

  @override
  Future<CachedResult<PageChunk<ServiceProvider>>> fetchPage(int page) async {
    final res = await ref.read(servicesRepositoryProvider).list(filters, page: page);
    return CachedResult(
      data: PageChunk(items: res.data.items, hasMore: res.data.meta.hasMore, extra: res.data),
      savedAt: res.savedAt,
      fromCache: res.fromCache,
    );
  }

  @override
  String idOf(ServiceProvider item) => item.id;
}

final servicesListProvider = AsyncNotifierProvider.autoDispose
    .family<ServicesListController, PagedState<ServiceProvider>, ServiceFilters>(ServicesListController.new);

/// Provider detail; distance is included when "near me" is on.
final serviceProviderDetailProvider = FutureProvider.autoDispose.family<CachedResult<ServiceProvider>, String>((
  ref,
  id,
) {
  ref.watch(requestLocaleProvider);
  final f = ref.watch(serviceFiltersProvider.select((f) => (lat: f.lat, lng: f.lng)));
  return ref.watch(servicesRepositoryProvider).detail(id, lat: f.lat, lng: f.lng);
});
