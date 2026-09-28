import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/cache/cached_fetch.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../charging/application/charging_providers.dart';
import '../../charging/data/location_service.dart';
import '../../charging/domain/station_query.dart';
import '../data/home_repository.dart';
import '../domain/home_models.dart';

/// Point used for "nearby stations": the device position or a city / map
/// point the user chose (shared with the charging tab), never the market's
/// default city (that would pretend to know where the user is).
final homeNearbyPlaceProvider = Provider<SearchPlace?>((ref) {
  final place = ref.watch(chargingPlaceProvider);
  return place.kind == PlaceKind.marketDefault ? null : place;
});

/// Runs once per app session: when location access was ALREADY granted
/// (checked silently, no prompt), locate the device so nearby stations
/// show without a tap. Never prompts on its own.
final homeAutoLocateProvider = FutureProvider<void>((ref) async {
  if (ref.read(chargingPlaceProvider).kind != PlaceKind.marketDefault) return;
  final status = ref.read(locationStatusProvider.notifier);
  final access = await status.refresh();
  if (access == LocationAccess.granted && ref.read(chargingPlaceProvider).kind == PlaceKind.marketDefault) {
    await status.locate();
  }
});

class HomeFeedController extends AsyncNotifier<CachedResult<HomeFeed>> {
  @override
  Future<CachedResult<HomeFeed>> build() {
    ref.watch(requestLocaleProvider);
    final signedIn = ref.watch(authControllerProvider.select((s) => s.isSignedIn));
    final place = ref.watch(homeNearbyPlaceProvider);
    ref.listen(authControllerProvider.select((s) => s.isSignedIn), (was, now) {
      // The account's personalized copy must not outlive the session.
      if ((was ?? false) && !now) unawaited(ref.read(homeRepositoryProvider).forgetUserCopy());
    });
    return ref
        .watch(homeRepositoryProvider)
        .home(lat: place?.point.lat, lng: place?.point.lng, signedIn: signedIn);
  }

  Future<void> refresh() async {
    ref.invalidateSelf();
    try {
      await future;
    } on Object {
      // Rendered by the screen.
    }
  }
}

final homeFeedProvider = AsyncNotifierProvider<HomeFeedController, CachedResult<HomeFeed>>(HomeFeedController.new);
