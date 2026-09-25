import 'package:evcar_news/core/notifications/local_notifications.dart';
import 'package:evcar_news/core/platform/platform_capabilities.dart';
import 'package:evcar_news/core/time/time_zones.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('notification ids are stable, positive 31-bit values', () {
    final a = localNotificationIdFor('0192f0c4-reminder-1');
    expect(a, localNotificationIdFor('0192f0c4-reminder-1'));
    expect(a, isNot(localNotificationIdFor('0192f0c4-reminder-2')));
    expect(a, inInclusiveRange(0, 0x7FFFFFFF));
  });

  test('web preview uses the unsupported service (nothing is scheduled)', () async {
    final c = ProviderContainer(
      overrides: [platformCapabilitiesProvider.overrideWithValue(const PlatformCapabilities(isWebPreview: true))],
    );
    addTearDown(c.dispose);
    final service = c.read(localNotificationsProvider);
    expect(service.isSupported, isFalse);
    expect(await service.requestPermission(), NotificationPermissionStatus.unsupported);
    await expectLater(
      service.schedule(
        LocalNotificationRequest(
          id: 1,
          title: 't',
          body: 'b',
          at: DateTime.utc(2030),
          channelName: 'Reminders',
          channelDescription: 'd',
        ),
      ),
      throwsUnsupportedError,
    );
  });

  test('fake service records schedules and taps', () async {
    final fake = FakeLocalNotificationService();
    final taps = <String>[];
    fake.taps.listen(taps.add);
    await fake.schedule(
      LocalNotificationRequest(
        id: 7,
        title: 'Insurance',
        body: 'Renew in 7 days',
        at: DateTime.utc(2030),
        channelName: 'Reminders',
        channelDescription: 'd',
        route: '/reminders',
      ),
    );
    expect(await fake.pendingIds(), [7]);
    fake.tap('/reminders');
    await Future<void>.delayed(Duration.zero);
    expect(taps, ['/reminders']);
    await fake.cancel(7);
    expect(await fake.pendingIds(), isEmpty);
  });

  test('plugin service degrades gracefully without the platform plugin (tests, unsupported OS)', () async {
    final service = PluginLocalNotificationService();
    expect(await service.initialize(), isFalse);
    expect(await service.pendingIds(), isEmpty);
    expect(await service.launchRoute(), isNull);
  });

  test('time zones: station-local "now" and unknown zones', () {
    final instant = DateTime.utc(2026, 1, 15, 10);
    expect(TimeZones.nowIn('Africa/Cairo', now: instant)!.hour, 12);
    expect(TimeZones.nowIn('Asia/Riyadh', now: instant)!.hour, 13);
    expect(TimeZones.nowIn('Mars/Base'), isNull);
    expect(TimeZones.nowIn(null), isNull);
  });
}
