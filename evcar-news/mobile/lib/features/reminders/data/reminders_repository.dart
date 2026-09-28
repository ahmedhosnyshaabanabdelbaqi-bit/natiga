import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/api/api_client.dart';
import '../../../core/json/json_readers.dart';
import '../domain/reminder.dart';

/// `/me/reminders` (backend-personal.md §4).
class RemindersRepository {
  RemindersRepository(this._api);

  final ApiClient _api;

  /// [status]: `open` | `completed` | `all`.
  Future<List<Reminder>> list({String status = 'open', String? vehicleId}) async {
    final page = await _api.getPage(
      '/me/reminders',
      Reminder.fromJson,
      query: {'status': status, 'vehicleId': ?vehicleId},
    );
    return page.items;
  }

  Future<Reminder> get(String id) => _api.getData('/me/reminders/${Uri.encodeComponent(id)}', Reminder.fromJsonValue);

  Future<Reminder> create(ReminderDraft d) => _api.postData('/me/reminders', Reminder.fromJsonValue, body: d.toCreateJson());

  Future<Reminder> update(String id, ReminderDraft d) =>
      _api.patchData('/me/reminders/${Uri.encodeComponent(id)}', Reminder.fromJsonValue, body: d.toPatchJson());

  Future<void> delete(String id) => _api.send('DELETE', '/me/reminders/${Uri.encodeComponent(id)}');

  /// Marks it done; returns the next occurrence when the reminder repeats.
  Future<({Reminder completed, Reminder? next})> complete(String id, {DateTime? completedAt, num? odometerKm}) {
    return _api.postData('/me/reminders/${Uri.encodeComponent(id)}/complete', (data) {
      final j = asJsonObject(data, 'complete');
      final next = j['next'];
      return (
        completed: Reminder.fromJsonValue(j['completed']),
        next: next == null ? null : Reminder.fromJsonValue(next),
      );
    }, body: {'completedAt': ?completedAt?.toUtc().toIso8601String(), 'odometerKm': ?odometerKm});
  }
}

final remindersRepositoryProvider = Provider<RemindersRepository>((ref) => RemindersRepository(ref.watch(apiClientProvider)));
