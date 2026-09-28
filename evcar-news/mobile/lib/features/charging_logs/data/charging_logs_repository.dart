import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/paged.dart';
import '../../garage/common/personal_forms.dart';
import '../domain/charging_log.dart';

/// `/me/charging-logs` (backend-personal.md §3).
class ChargingLogsRepository {
  ChargingLogsRepository(this._api);

  final ApiClient _api;

  Future<Paged<ChargingLog>> list({String? vehicleId, int page = 1, int pageSize = 30}) => _api.getPage(
    '/me/charging-logs',
    ChargingLog.fromJson,
    query: {'vehicleId': ?vehicleId, 'page': page, 'pageSize': pageSize},
  );

  Future<ChargingLog> get(String id) =>
      _api.getData('/me/charging-logs/${Uri.encodeComponent(id)}', ChargingLog.fromJsonValue);

  Future<ChargingLog> create(ChargingLogDraft draft) =>
      _api.postData('/me/charging-logs', ChargingLog.fromJsonValue, body: draft.toCreateJson());

  Future<ChargingLog> update(String id, ChargingLogDraft draft) =>
      _api.patchData('/me/charging-logs/${Uri.encodeComponent(id)}', ChargingLog.fromJsonValue, body: draft.toPatchJson());

  Future<void> delete(String id) => _api.send('DELETE', '/me/charging-logs/${Uri.encodeComponent(id)}');

  /// [from]/[to] are inclusive calendar dates.
  Future<ChargingReport> report({DateTime? from, DateTime? to, String? vehicleId}) => _api.getData(
    '/me/charging-logs/report',
    ChargingReport.fromJsonValue,
    query: {
      if (from != null) 'from': isoDate(from),
      if (to != null) 'to': isoDate(to),
      'vehicleId': ?vehicleId,
    },
  );
}

final chargingLogsRepositoryProvider = Provider<ChargingLogsRepository>(
  (ref) => ChargingLogsRepository(ref.watch(apiClientProvider)),
);
