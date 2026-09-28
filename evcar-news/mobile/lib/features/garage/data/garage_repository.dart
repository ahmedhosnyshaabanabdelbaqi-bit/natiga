import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/api/api_client.dart';
import '../domain/user_vehicle.dart';

/// `GET|POST /me/vehicles`, `GET|PATCH|DELETE /me/vehicles/:id`
/// (backend-personal.md §2). Personal data is not written to the offline
/// cache (it would outlive a sign-out on a shared phone).
class GarageRepository {
  GarageRepository(this._api);

  final ApiClient _api;

  Future<List<UserVehicle>> list() async {
    final page = await _api.getPage('/me/vehicles', UserVehicle.fromJson);
    return page.items;
  }

  Future<UserVehicle> get(String id) => _api.getData('/me/vehicles/${Uri.encodeComponent(id)}', UserVehicle.fromJsonValue);

  Future<UserVehicle> create(UserVehicleDraft draft) =>
      _api.postData('/me/vehicles', UserVehicle.fromJsonValue, body: draft.toCreateJson());

  Future<UserVehicle> update(String id, Map<String, Object?> patch) =>
      _api.patchData('/me/vehicles/${Uri.encodeComponent(id)}', UserVehicle.fromJsonValue, body: patch);

  Future<void> delete(String id) => _api.send('DELETE', '/me/vehicles/${Uri.encodeComponent(id)}');
}

final garageRepositoryProvider = Provider<GarageRepository>((ref) => GarageRepository(ref.watch(apiClientProvider)));
