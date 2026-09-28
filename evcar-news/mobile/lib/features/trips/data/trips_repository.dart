import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/api/api_client.dart';
import '../../../core/json/json_readers.dart';
import '../domain/trip_models.dart';

/// `POST /trips/plan`, `/me/trips` (backend-personal.md §7).
class TripsRepository {
  TripsRepository(this._api);

  final ApiClient _api;

  /// 503 INTEGRATION_NOT_CONFIGURED without a routing provider; 422
  /// TRIP_VEHICLE_DATA_MISSING / TRIP_NO_REACHABLE_STATION when no honest
  /// plan exists (never an invented plan).
  Future<TripPlan> plan(TripPlanRequest request) =>
      _api.postData('/trips/plan', TripPlan.fromJsonValue, body: request.toJson());

  Future<List<SavedTrip>> saved() async {
    final page = await _api.getPage('/me/trips', SavedTrip.fromJson);
    return page.items;
  }

  Future<({TripPlan plan, String? staleNotice})> savedPlan(String id) => _api.getData(
    '/me/trips/${Uri.encodeComponent(id)}',
    (d) {
      final j = asJsonObject(d, 'trip');
      return (plan: TripPlan.fromJsonValue(j['plan']), staleNotice: j.stringOrNull('staleNotice'));
    },
  );

  Future<void> deleteSaved(String id) => _api.send('DELETE', '/me/trips/${Uri.encodeComponent(id)}');
}

final tripsRepositoryProvider = Provider<TripsRepository>((ref) => TripsRepository(ref.watch(apiClientProvider)));
