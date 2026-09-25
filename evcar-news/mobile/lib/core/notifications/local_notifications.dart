import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/timezone.dart' as tz;

import '../platform/platform_capabilities.dart';
import '../time/time_zones.dart';

/// Result of asking for notification permission.
enum NotificationPermissionStatus { granted, denied, unsupported }

/// One scheduled local notification (reminders: maintenance, insurance,
/// licence renewal). Local only — push is config-gated on the server and not
/// part of the app yet (docs/decisions/prep-mobile.md).
@immutable
class LocalNotificationRequest {
  const LocalNotificationRequest({
    required this.id,
    required this.title,
    required this.body,
    required this.at,
    required this.channelName,
    required this.channelDescription,
    this.route,
  });

  /// Stable 31-bit id (e.g. derived from the reminder id with
  /// [LocalNotificationService.idFor]); re-scheduling the same id replaces it.
  final int id;
  final String title;
  final String body;

  /// When to show it (any time zone; converted to the device zone).
  final DateTime at;

  /// Localized Android channel name/description (shown in system settings).
  final String channelName;
  final String channelDescription;

  /// In-app location opened when the notification is tapped (validated
  /// before navigation, e.g. `/reminders`).
  final String? route;
}

/// Local notifications behind an interface so features and tests do not
/// touch the plugin directly. Obtain it with [localNotificationsProvider].
abstract interface class LocalNotificationService {
  /// False on the web preview / platforms without the plugin.
  bool get isSupported;

  /// Initializes the plugin and time zones. Never prompts for permission.
  /// Returns false when unavailable.
  Future<bool> initialize();

  /// Asks the OS for permission (Android 13+, iOS). Call only when the user
  /// turns on a reminder — never at start-up.
  Future<NotificationPermissionStatus> requestPermission();

  /// Schedules (or replaces) a notification. Throws [UnsupportedError] when
  /// [isSupported] is false.
  Future<void> schedule(LocalNotificationRequest request);

  Future<void> cancel(int id);

  /// Ids currently scheduled on the device.
  Future<List<int>> pendingIds();

  /// Routes of tapped notifications while the app runs.
  Stream<String> get taps;

  /// Route of the notification that launched the app, if any.
  Future<String?> launchRoute();
}

/// Derives a stable positive 31-bit id from a string key (e.g. a reminder
/// UUID). FNV-1a, deterministic across runs and platforms.
int localNotificationIdFor(String key) {
  var hash = 0x811c9dc5;
  for (final unit in key.codeUnits) {
    hash ^= unit;
    hash = (hash * 0x01000193) & 0xFFFFFFFF;
  }
  return hash & 0x7FFFFFFF;
}

/// flutter_local_notifications implementation (Android/iOS).
///
/// Android needs core-library desugaring and the scheduled-notification
/// receivers in the manifest (see docs/decisions/prep-mobile.md §Android).
/// Scheduling is **inexact** (`inexactAllowWhileIdle`): reminders do not need
/// minute precision and this avoids the exact-alarm permission.
class PluginLocalNotificationService implements LocalNotificationService {
  PluginLocalNotificationService([FlutterLocalNotificationsPlugin? plugin])
    : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  final FlutterLocalNotificationsPlugin _plugin;
  final _taps = StreamController<String>.broadcast();
  Future<bool>? _init;

  @override
  bool get isSupported => true;

  @override
  Stream<String> get taps => _taps.stream;

  @override
  Future<bool> initialize() => _init ??= _initialize();

  Future<bool> _initialize() async {
    try {
      TimeZones.ensureInitialized();
      try {
        final info = await FlutterTimezone.getLocalTimezone();
        TimeZones.setLocal(info.identifier);
      } on PlatformException {
        // Keep UTC; scheduled times are absolute instants anyway.
      }
      final ok = await _plugin.initialize(
        settings: const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          iOS: DarwinInitializationSettings(
            requestAlertPermission: false,
            requestBadgePermission: false,
            requestSoundPermission: false,
          ),
        ),
        onDidReceiveNotificationResponse: (response) {
          final route = response.payload;
          if (route != null && route.isNotEmpty) _taps.add(route);
        },
      );
      return ok ?? false;
    } on MissingPluginException {
      return false;
    } on PlatformException catch (e) {
      debugPrint('EV Car News: local notifications unavailable: $e');
      return false;
    }
  }

  @override
  Future<NotificationPermissionStatus> requestPermission() async {
    if (!await initialize()) return NotificationPermissionStatus.unsupported;
    bool? granted;
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        granted = await _plugin
            .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
            ?.requestNotificationsPermission();
      case TargetPlatform.iOS:
        granted = await _plugin
            .resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()
            ?.requestPermissions(alert: true, badge: false, sound: true);
      default:
        return NotificationPermissionStatus.unsupported;
    }
    return granted == true ? NotificationPermissionStatus.granted : NotificationPermissionStatus.denied;
  }

  @override
  Future<void> schedule(LocalNotificationRequest request) async {
    if (!await initialize()) throw UnsupportedError('Local notifications are not available');
    await _plugin.zonedSchedule(
      id: request.id,
      title: request.title,
      body: request.body,
      scheduledDate: tz.TZDateTime.from(request.at, tz.local),
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          'reminders',
          request.channelName,
          channelDescription: request.channelDescription,
          importance: Importance.defaultImportance,
          priority: Priority.defaultPriority,
        ),
        iOS: const DarwinNotificationDetails(),
      ),
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      payload: request.route,
    );
  }

  @override
  Future<void> cancel(int id) async {
    if (!await initialize()) return;
    await _plugin.cancel(id: id);
  }

  @override
  Future<List<int>> pendingIds() async {
    if (!await initialize()) return const [];
    final pending = await _plugin.pendingNotificationRequests();
    return [for (final p in pending) p.id];
  }

  @override
  Future<String?> launchRoute() async {
    if (!await initialize()) return null;
    final details = await _plugin.getNotificationAppLaunchDetails();
    if (details == null || !details.didNotificationLaunchApp) return null;
    final route = details.notificationResponse?.payload;
    return route == null || route.isEmpty ? null : route;
  }
}

/// Used on the web preview and in tests: nothing is scheduled, features show
/// "reminders are not available on this platform".
class UnsupportedLocalNotificationService implements LocalNotificationService {
  const UnsupportedLocalNotificationService();

  @override
  bool get isSupported => false;

  @override
  Future<bool> initialize() async => false;

  @override
  Future<NotificationPermissionStatus> requestPermission() async => NotificationPermissionStatus.unsupported;

  @override
  Future<void> schedule(LocalNotificationRequest request) =>
      Future.error(UnsupportedError('Local notifications are not available'));

  @override
  Future<void> cancel(int id) async {}

  @override
  Future<List<int>> pendingIds() async => const [];

  @override
  Stream<String> get taps => const Stream.empty();

  @override
  Future<String?> launchRoute() async => null;
}

/// In-memory fake for widget/unit tests: records what was scheduled.
class FakeLocalNotificationService implements LocalNotificationService {
  FakeLocalNotificationService({this.permission = NotificationPermissionStatus.granted});

  NotificationPermissionStatus permission;
  final scheduled = <int, LocalNotificationRequest>{};
  final _taps = StreamController<String>.broadcast();

  /// Simulates the user tapping a notification.
  void tap(String route) => _taps.add(route);

  @override
  bool get isSupported => true;

  @override
  Future<bool> initialize() async => true;

  @override
  Future<NotificationPermissionStatus> requestPermission() async => permission;

  @override
  Future<void> schedule(LocalNotificationRequest request) async => scheduled[request.id] = request;

  @override
  Future<void> cancel(int id) async => scheduled.remove(id);

  @override
  Future<List<int>> pendingIds() async => scheduled.keys.toList();

  @override
  Stream<String> get taps => _taps.stream;

  @override
  Future<String?> launchRoute() async => null;
}

/// The app's notification service (plugin on Android/iOS, unsupported on the
/// web preview). Tests override it with [FakeLocalNotificationService].
final localNotificationsProvider = Provider<LocalNotificationService>((ref) {
  if (!ref.watch(platformCapabilitiesProvider).localNotifications) {
    return const UnsupportedLocalNotificationService();
  }
  return PluginLocalNotificationService();
});
