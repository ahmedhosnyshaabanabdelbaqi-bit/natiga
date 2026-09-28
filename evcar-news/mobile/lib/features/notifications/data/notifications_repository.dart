import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/paged.dart';
import '../../../core/json/json_readers.dart';
import '../domain/notification_models.dart';

/// Notification centre, preferences and topic subscriptions
/// (backend-personal.md §6).
class NotificationsRepository {
  NotificationsRepository(this._api);

  final ApiClient _api;

  Future<Paged<AppNotification>> list({bool unreadOnly = false, int page = 1, int pageSize = 30}) => _api.getPage(
    '/me/notifications',
    AppNotification.fromJson,
    query: {if (unreadOnly) 'unread': 'true', 'page': page, 'pageSize': pageSize},
  );

  Future<int> unreadCount() =>
      _api.getData('/me/notifications/unread-count', (d) => asJsonObject(d).intOrNull('count') ?? 0);

  Future<AppNotification> markRead(String id, {bool read = true}) => _api.postData(
    '/me/notifications/${Uri.encodeComponent(id)}/${read ? 'read' : 'unread'}',
    AppNotification.fromJsonValue,
  );

  Future<int> markAllRead() =>
      _api.postData('/me/notifications/read-all', (d) => asJsonObject(d).intOrNull('updated') ?? 0);

  Future<void> delete(String id) => _api.send('DELETE', '/me/notifications/${Uri.encodeComponent(id)}');

  Future<NotificationPreferences> preferences() =>
      _api.getData('/me/notification-preferences', NotificationPreferences.fromJsonValue);

  /// PATCH body: `{types?, channels?: {push?}, quietHours?: {...}|null, unsubscribeAll?}`.
  Future<NotificationPreferences> updatePreferences(Map<String, Object?> patch) =>
      _api.patchData('/me/notification-preferences', NotificationPreferences.fromJsonValue, body: patch);

  Future<List<NotificationSubscription>> subscriptions() async {
    final page = await _api.getPage('/me/notification-subscriptions', NotificationSubscription.fromJson);
    return page.items;
  }

  /// Idempotent: returns the existing subscription when it already exists.
  Future<NotificationSubscription> subscribe({
    required String topicType,
    String? brandId,
    String? modelId,
    String? variantId,
    String? categoryId,
    String? stationId,
    String? marketCode,
  }) => _api.postData(
    '/me/notification-subscriptions',
    NotificationSubscription.fromJsonValue,
    body: {
      'topicType': topicType,
      'brandId': ?brandId,
      'modelId': ?modelId,
      'variantId': ?variantId,
      'categoryId': ?categoryId,
      'stationId': ?stationId,
      'marketCode': ?marketCode,
    },
  );

  Future<void> unsubscribe(String id) => _api.send('DELETE', '/me/notification-subscriptions/${Uri.encodeComponent(id)}');
}

final notificationsRepositoryProvider = Provider<NotificationsRepository>(
  (ref) => NotificationsRepository(ref.watch(apiClientProvider)),
);
