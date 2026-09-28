import 'package:evcar_news/core/notifications/local_notifications.dart';
import 'package:evcar_news/core/settings/settings_controller.dart';
import 'package:evcar_news/features/notifications/domain/notification_models.dart';
import 'package:evcar_news/features/reminders/application/reminder_notifications.dart';
import 'package:evcar_news/features/reminders/domain/reminder.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

Reminder reminder(String id, {String? notifyOn, String status = 'upcoming'}) => Reminder.fromJson({
  'id': id,
  'type': 'maintenance',
  'typeLabel': 'Maintenance',
  'title': 'Maintenance',
  'dueDate': '2026-12-01',
  'status': status,
  'notifyOn': notifyOn,
});

ReminderNotificationTexts get texts => (
  title: (r) => r.displayTitle,
  body: (r) => 'due ${r.dueDate}',
  channelName: 'Reminders',
  channelDescription: 'Car reminders',
);

void main() {
  group('notification deep links', () {
    test('in-app paths are opened in the app (web share paths mapped)', () {
      expect((resolveNotificationLink('/news/new-battery') as InAppTarget).location, '/news/new-battery');
      expect((resolveNotificationLink('/n/new-battery') as InAppTarget).location, '/news/new-battery');
      expect((resolveNotificationLink('/garage/v1') as InAppTarget).location, '/garage/v1');
    });

    test('evcar.news links open the matching screen', () {
      expect((resolveNotificationLink('https://evcar.news/n/slug-1') as InAppTarget).location, '/news/slug-1');
      expect((resolveNotificationLink('https://www.evcar.news/cars/model-x?x=1') as InAppTarget).location, '/cars/model-x?x=1');
    });

    test('other https links open in the browser', () {
      expect((resolveNotificationLink('https://example.org/page') as ExternalTarget).url, 'https://example.org/page');
    });

    test('unsafe or unknown links are ignored', () {
      for (final bad in [
        null,
        '',
        '//evil.example',
        '/auth/login',
        'javascript:alert(1)',
        'http://example.org',
        'intent://x',
        'evcar://news/x',
        r'/news\evil',
        'https://user:pw@example.org',
      ]) {
        expect(resolveNotificationLink(bad), isNull, reason: '$bad');
      }
    });

    test('notification JSON keeps unread state and deep link', () {
      final n = AppNotification.fromJson({
        'id': 'n1',
        'type': 'news',
        'title': 'New article',
        'body': null,
        'deepLink': '/news/x',
        'data': {'articleId': 'a1'},
        'isRead': false,
        'readAt': null,
        'createdAt': '2026-09-27T10:00:00.000Z',
      });
      expect(n.isRead, isFalse);
      expect(n.copyWith(isRead: true).isRead, isTrue);
      expect(n.data['articleId'], 'a1');
    });

    test('preferences parse push status and quiet hours', () {
      final p = NotificationPreferences.fromJson({
        'types': {'news': true, 'priceAlerts': false},
        'channels': {'inApp': true, 'push': false, 'email': false},
        'quietHours': {'start': '22:00', 'end': '07:00', 'timezone': 'Africa/Cairo'},
        'unsubscribedAll': false,
        'unsubscribedAt': null,
        'push': {'configured': false, 'registeredDevices': 0, 'status': 'not_configured'},
      });
      expect(p.typeOn('news'), isTrue);
      expect(p.typeOn('reminders'), isFalse);
      expect(p.quietHours?.timezone, 'Africa/Cairo');
      expect(p.pushConfigured, isFalse);
      expect(p.pushStatus, 'not_configured');
      // An older server without `supported` → every switch, as before.
      expect(p.supportedTypes, NotificationTypes.all);
      expect(p.supportedTopicTypes, TopicTypes.all);
    });

    test('only switches and topics the server produces are offered (review 3)', () {
      final p = NotificationPreferences.fromJson({
        'types': {'news': true, 'priceAlerts': true, 'reminders': true},
        'channels': {'inApp': true, 'push': true, 'email': false},
        'unsubscribedAll': false,
        'push': {'configured': true, 'registeredDevices': 1, 'status': 'active'},
        'supported': {
          'types': ['news', 'future_type'],
          'topicTypes': ['category', 'brand', 'model', 'variant'],
        },
      });
      expect(p.supportedTypes, ['news']);
      expect(p.supportedTopicTypes, ['brand', 'model', 'variant', 'category']);
      expect(p.supportedTopicTypes, isNot(contains(TopicTypes.priceAlert)));
      expect(p.supportedTopicTypes, isNot(contains(TopicTypes.market)));
    });
  });

  group('reminder local notifications', () {
    test('only future notifyOn days of open reminders are planned (09:00 local)', () {
      final now = DateTime(2026, 9, 28, 12);
      final planned = plannedReminderNotifications([
        reminder('past', notifyOn: '2026-09-27'),
        reminder('today-late', notifyOn: '2026-09-28'),
        reminder('future', notifyOn: '2026-10-01'),
        reminder('done', notifyOn: '2026-10-02', status: 'completed'),
        reminder('none'),
      ], now);
      expect(planned.map((p) => p.reminder.id), ['future']);
      expect(planned.single.at, DateTime(2026, 10, 1, 9));
    });

    Future<(ProviderContainer, FakeLocalNotificationService)> setUpContainer({
      NotificationPermissionStatus permission = NotificationPermissionStatus.granted,
    }) async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final fake = FakeLocalNotificationService(permission: permission);
      final c = ProviderContainer(
        overrides: [
          sharedPreferencesProvider.overrideWithValue(prefs),
          localNotificationsProvider.overrideWithValue(fake),
        ],
      );
      addTearDown(c.dispose);
      return (c, fake);
    }

    test('nothing is scheduled until the user turns it on (permission asked only then)', () async {
      final (c, fake) = await setUpContainer();
      final ctrl = c.read(reminderNotificationsProvider.notifier);
      final now = DateTime(2026, 9, 28);
      expect(await ctrl.sync([reminder('a', notifyOn: '2026-10-01')], texts, now: now), 0);
      expect(fake.scheduled, isEmpty);
      final state = await ctrl.setEnabled(true);
      expect(state.enabled, isTrue);
      expect(await ctrl.sync([reminder('a', notifyOn: '2026-10-01'), reminder('b', notifyOn: '2026-10-05')], texts, now: now), 2);
      expect(fake.scheduled.values.map((r) => r.route), ['/reminders/a/edit', '/reminders/b/edit']);
      // A deleted / completed reminder's notification is cancelled on the next sync.
      await ctrl.sync([reminder('b', notifyOn: '2026-10-05')], texts, now: now);
      expect(fake.scheduled.keys, [localNotificationIdFor('reminder:b')]);
      // Sign-out / switch off cancels everything this feature scheduled.
      await ctrl.cancelAll();
      expect(fake.scheduled, isEmpty);
    });

    test('denied permission keeps it off and is reported', () async {
      final (c, fake) = await setUpContainer(permission: NotificationPermissionStatus.denied);
      final state = await c.read(reminderNotificationsProvider.notifier).setEnabled(true);
      expect(state.enabled, isFalse);
      expect(state.permissionDenied, isTrue);
      await c.read(reminderNotificationsProvider.notifier).sync([reminder('a', notifyOn: '2030-01-01')], texts);
      expect(fake.scheduled, isEmpty);
    });
  });
}
