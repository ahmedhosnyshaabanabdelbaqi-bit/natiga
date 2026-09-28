import 'package:flutter/foundation.dart';

import '../../../app/router/app_routes.dart';
import '../../../app/router/deep_links.dart';
import '../../../core/json/json_readers.dart';

/// One entry of the in-app notification centre (`/me/notifications`).
@immutable
class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    this.body,
    this.deepLink,
    this.data = const {},
    required this.isRead,
    this.readAt,
    required this.createdAt,
  });

  final String id;

  /// e.g. `news`, `price_alert`, `reminder`, `community`, `station`, `campaign`.
  final String type;
  final String title;
  final String? body;

  /// App path (`/news/<slug>`) or https URL; validated before opening.
  final String? deepLink;
  final Map<String, dynamic> data;
  final bool isRead;
  final DateTime? readAt;
  final DateTime createdAt;

  AppNotification copyWith({bool? isRead}) => AppNotification(
    id: id,
    type: type,
    title: title,
    body: body,
    deepLink: deepLink,
    data: data,
    isRead: isRead ?? this.isRead,
    readAt: readAt,
    createdAt: createdAt,
  );

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
    id: j.requireString('id'),
    type: j.stringOrNull('type') ?? 'other',
    title: j.stringOrNull('title') ?? '',
    body: j.stringOrNull('body'),
    deepLink: j.stringOrNull('deepLink'),
    data: j.objectOrNull('data') ?? const {},
    isRead: j.boolOr('isRead', false),
    readAt: j.dateTimeOrNull('readAt'),
    createdAt: j.dateTimeOrNull('createdAt') ?? DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
  );

  static AppNotification fromJsonValue(Object? data) => AppNotification.fromJson(asJsonObject(data, 'notification'));
}

/// Where tapping a notification goes.
sealed class NotificationTarget {
  const NotificationTarget();
}

/// An in-app route (already validated).
class InAppTarget extends NotificationTarget {
  const InAppTarget(this.location);

  final String location;
}

/// An https page outside the app (opened in the browser).
class ExternalTarget extends NotificationTarget {
  const ExternalTarget(this.url);

  final String url;
}

/// Resolves a notification `deepLink` safely:
/// * app paths (`/news/x`) must pass [AppRoutes.safeReturnPath] (no `//`,
///   schemes, back-slashes or `/auth/…`) and are mapped like web links;
/// * `https://evcar.news/...` links open the matching in-app screen;
/// * other `https` URLs open in the browser;
/// * anything else (http, javascript:, intent:, custom schemes) is ignored.
NotificationTarget? resolveNotificationLink(String? link) {
  final raw = link?.trim();
  if (raw == null || raw.isEmpty) return null;
  if (raw.startsWith('/')) {
    final safe = AppRoutes.safeReturnPath(raw);
    if (safe == null) return null;
    final uri = Uri.tryParse(safe);
    if (uri == null) return null;
    final mapped = deepLinkRedirect(uri);
    final location = mapped ?? safe;
    return AppRoutes.safeReturnPath(location) == null ? null : InAppTarget(location);
  }
  final uri = Uri.tryParse(raw);
  if (uri == null || uri.scheme.toLowerCase() != 'https' || uri.host.isEmpty || uri.userInfo.isNotEmpty) return null;
  if (deepLinkHosts.contains(uri.host.toLowerCase())) {
    final path = uri.path.isEmpty ? '/' : uri.path;
    final inApp = Uri(path: path, query: uri.hasQuery ? uri.query : null).toString();
    final mapped = deepLinkRedirect(Uri.parse(inApp)) ?? inApp;
    final safe = AppRoutes.safeReturnPath(mapped);
    return safe == null ? null : InAppTarget(safe);
  }
  return ExternalTarget(uri.toString());
}

/// Categories of notifications the user can switch on/off
/// (`notification-preferences.types`).
abstract final class NotificationTypes {
  static const news = 'news';
  static const priceAlerts = 'priceAlerts';
  static const reminders = 'reminders';
  static const community = 'community';
  static const stationAlerts = 'stationAlerts';
  static const campaigns = 'campaigns';

  static const all = [news, priceAlerts, reminders, community, stationAlerts, campaigns];
}

@immutable
class QuietHours {
  const QuietHours({required this.start, required this.end, required this.timezone});

  /// `HH:MM`.
  final String start;
  final String end;
  final String timezone;

  Map<String, Object?> toJson() => {'start': start, 'end': end, 'timezone': timezone};

  static QuietHours? tryParse(Map<String, dynamic>? j) {
    if (j == null) return null;
    final s = j.stringOrNull('start');
    final e = j.stringOrNull('end');
    if (s == null || e == null) return null;
    return QuietHours(start: s, end: e, timezone: j.stringOrNull('timezone') ?? 'UTC');
  }
}

/// `push.status`: active | disabled_by_user | no_device | not_configured.
@immutable
class NotificationPreferences {
  const NotificationPreferences({
    required this.types,
    required this.pushEnabled,
    required this.emailEnabled,
    this.quietHours,
    required this.unsubscribedAll,
    this.unsubscribedAt,
    required this.pushConfigured,
    required this.registeredDevices,
    required this.pushStatus,
    this.supportedTypes = NotificationTypes.all,
    this.supportedTopicTypes = TopicTypes.all,
  });

  final Map<String, bool> types;

  /// Switches the server actually produces notifications for
  /// (`supported.types`); only these are shown (review 3: a switch without a
  /// producer is a button without a function). Older servers that do not send
  /// the field get every switch, as before.
  final List<String> supportedTypes;

  /// Topic types whose follow leads to notifications (`supported.topicTypes`).
  final List<String> supportedTopicTypes;
  final bool pushEnabled;
  final bool emailEnabled;
  final QuietHours? quietHours;
  final bool unsubscribedAll;
  final DateTime? unsubscribedAt;
  final bool pushConfigured;
  final int registeredDevices;
  final String pushStatus;

  bool typeOn(String key) => types[key] ?? false;

  factory NotificationPreferences.fromJson(Map<String, dynamic> j) {
    final types = j.objectOrNull('types') ?? const <String, dynamic>{};
    final channels = j.objectOrNull('channels') ?? const <String, dynamic>{};
    final push = j.objectOrNull('push') ?? const <String, dynamic>{};
    return NotificationPreferences(
      types: {for (final k in NotificationTypes.all) k: types.boolOr(k, false)},
      pushEnabled: channels.boolOr('push', false),
      emailEnabled: channels.boolOr('email', false),
      quietHours: QuietHours.tryParse(j.objectOrNull('quietHours')),
      unsubscribedAll: j.boolOr('unsubscribedAll', false),
      unsubscribedAt: j.dateTimeOrNull('unsubscribedAt'),
      pushConfigured: push.boolOr('configured', false),
      registeredDevices: push.intOrNull('registeredDevices') ?? 0,
      pushStatus: push.stringOrNull('status') ?? 'not_configured',
      supportedTypes: _supported(j, 'types', NotificationTypes.all),
      supportedTopicTypes: _supported(j, 'topicTypes', TopicTypes.all),
    );
  }

  static List<String> _supported(Map<String, dynamic> j, String key, List<String> known) {
    final raw = j.objectOrNull('supported')?[key];
    if (raw is! List) return known;
    final set = {for (final v in raw) if (v is String) v};
    // Keep the app's order; ignore values this app version does not know.
    return [for (final k in known) if (set.contains(k)) k];
  }

  static NotificationPreferences fromJsonValue(Object? data) =>
      NotificationPreferences.fromJson(asJsonObject(data, 'preferences'));
}

/// Topic types of `/me/notification-subscriptions`.
abstract final class TopicTypes {
  static const brand = 'brand';
  static const model = 'model';
  static const variant = 'variant';
  static const category = 'category';
  static const market = 'market';
  static const station = 'station';
  static const priceAlert = 'price_alert';

  static const all = [brand, model, variant, category, market, station, priceAlert];
}

@immutable
class NotificationSubscription {
  const NotificationSubscription({
    required this.id,
    required this.topicType,
    required this.targetId,
    required this.targetName,
    this.marketCode,
    this.createdAt,
  });

  final String id;
  final String topicType;
  final String targetId;
  final String targetName;
  final String? marketCode;
  final DateTime? createdAt;

  factory NotificationSubscription.fromJson(Map<String, dynamic> j) {
    final t = j.objectOrNull('target') ?? const <String, dynamic>{};
    return NotificationSubscription(
      id: j.requireString('id'),
      topicType: j.stringOrNull('topicType') ?? '',
      targetId: t.stringOrNull('id') ?? t.stringOrNull('code') ?? '',
      targetName: t.stringOrNull('name') ?? t.stringOrNull('code') ?? '',
      marketCode: j.stringOrNull('marketCode'),
      createdAt: j.dateTimeOrNull('createdAt'),
    );
  }

  static NotificationSubscription fromJsonValue(Object? data) =>
      NotificationSubscription.fromJson(asJsonObject(data, 'subscription'));
}
