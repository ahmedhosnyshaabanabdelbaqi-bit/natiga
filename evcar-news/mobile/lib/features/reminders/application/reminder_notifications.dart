import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../app/router/app_routes.dart';
import '../../../core/notifications/local_notifications.dart';
import '../../../core/settings/settings_controller.dart';
import '../domain/reminder.dart';

/// Hour of the day (device time) at which a reminder's local notification is
/// shown on its `notifyOn` day.
const reminderNotificationHour = 9;

/// Texts of one scheduled notification (localized by the caller).
typedef ReminderNotificationTexts = ({
  String Function(Reminder r) title,
  String Function(Reminder r) body,
  String channelName,
  String channelDescription,
});

/// What should be scheduled for [reminders] at [now]: open reminders whose
/// `notifyOn` day at [reminderNotificationHour] is still in the future.
/// Past notification times are not re-fired (the reminder list shows the
/// "due soon" / "overdue" state instead) — no burst of stale alerts.
@visibleForTesting
List<({Reminder reminder, DateTime at})> plannedReminderNotifications(List<Reminder> reminders, DateTime now) {
  final out = <({Reminder reminder, DateTime at})>[];
  for (final r in reminders) {
    if (r.isCompleted) continue;
    final day = r.notifyDay;
    if (day == null) continue;
    final at = DateTime(day.year, day.month, day.day, reminderNotificationHour);
    if (at.isAfter(now)) out.add((reminder: r, at: at));
  }
  return out;
}

/// Per-device switch + bookkeeping for reminder notifications.
///
/// * The switch is off until the user turns it on; only then the OS
///   permission is requested (never at start-up).
/// * Denied permission turns it back off and is reported, so the UI explains
///   that reminders still show in the app.
/// * [sync] schedules one local notification per open reminder and cancels
///   the ones it scheduled before that are no longer needed (ids are stored
///   so other local notifications are never touched).
class ReminderNotificationsController extends Notifier<ReminderNotificationsState> {
  static const enabledKey = 'reminders.localNotifications.enabled.v1';
  static const scheduledKey = 'reminders.localNotifications.ids.v1';

  SharedPreferences get _prefs => ref.read(sharedPreferencesProvider);
  LocalNotificationService get _service => ref.read(localNotificationsProvider);

  @override
  ReminderNotificationsState build() {
    final service = ref.watch(localNotificationsProvider);
    final prefs = ref.watch(sharedPreferencesProvider);
    return ReminderNotificationsState(
      supported: service.isSupported,
      enabled: service.isSupported && (prefs.getBool(enabledKey) ?? false),
      permissionDenied: false,
    );
  }

  /// Turns device notifications on (asks for permission) or off (cancels
  /// everything this feature scheduled). Returns the resulting state.
  Future<ReminderNotificationsState> setEnabled(bool on) async {
    if (!state.supported) return state;
    if (!on) {
      await _prefs.setBool(enabledKey, false);
      await cancelAll();
      state = state.copyWith(enabled: false, permissionDenied: false);
      return state;
    }
    final status = await _service.requestPermission();
    if (status != NotificationPermissionStatus.granted) {
      await _prefs.setBool(enabledKey, false);
      state = state.copyWith(
        enabled: false,
        permissionDenied: status == NotificationPermissionStatus.denied,
        supported: status != NotificationPermissionStatus.unsupported,
      );
      return state;
    }
    await _prefs.setBool(enabledKey, true);
    state = state.copyWith(enabled: true, permissionDenied: false);
    return state;
  }

  List<int> _storedIds() =>
      (_prefs.getStringList(scheduledKey) ?? const []).map(int.tryParse).nonNulls.toList(growable: false);

  /// Brings the device's scheduled notifications in line with [reminders]
  /// (the full list of open reminders). Never throws: notifications are a
  /// convenience, the reminder list is the source of truth.
  Future<int> sync(List<Reminder> reminders, ReminderNotificationTexts texts, {DateTime? now}) async {
    if (!state.supported) return 0;
    try {
      if (!state.enabled) {
        await cancelAll();
        return 0;
      }
      final planned = plannedReminderNotifications(reminders, now ?? DateTime.now());
      final keep = <int>{};
      for (final p in planned) {
        final id = localNotificationIdFor('reminder:${p.reminder.id}');
        keep.add(id);
        await _service.schedule(
          LocalNotificationRequest(
            id: id,
            title: texts.title(p.reminder),
            body: texts.body(p.reminder),
            at: p.at,
            channelName: texts.channelName,
            channelDescription: texts.channelDescription,
            route: AppRoutes.reminderEdit(p.reminder.id),
          ),
        );
      }
      for (final id in _storedIds()) {
        if (!keep.contains(id)) await _service.cancel(id);
      }
      await _prefs.setStringList(scheduledKey, [for (final id in keep) '$id']);
      return keep.length;
    } on Object catch (e) {
      debugPrint('EV Car News: reminder notifications not synced: $e');
      return 0;
    }
  }

  /// Cancels every notification this feature scheduled (sign-out, switch off).
  Future<void> cancelAll() async {
    try {
      for (final id in _storedIds()) {
        await _service.cancel(id);
      }
      await _prefs.remove(scheduledKey);
    } on Object catch (e) {
      debugPrint('EV Car News: could not cancel reminder notifications: $e');
    }
  }
}

@immutable
class ReminderNotificationsState {
  const ReminderNotificationsState({required this.supported, required this.enabled, required this.permissionDenied});

  /// False on the web preview / when the plugin is unavailable.
  final bool supported;
  final bool enabled;

  /// The last request was denied by the user / OS.
  final bool permissionDenied;

  ReminderNotificationsState copyWith({bool? supported, bool? enabled, bool? permissionDenied}) =>
      ReminderNotificationsState(
        supported: supported ?? this.supported,
        enabled: enabled ?? this.enabled,
        permissionDenied: permissionDenied ?? this.permissionDenied,
      );
}

final reminderNotificationsProvider = NotifierProvider<ReminderNotificationsController, ReminderNotificationsState>(
  ReminderNotificationsController.new,
);
