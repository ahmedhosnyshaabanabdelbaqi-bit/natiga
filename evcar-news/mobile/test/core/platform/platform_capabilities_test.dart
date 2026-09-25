import 'package:evcar_news/app/di/providers.dart';
import 'package:evcar_news/core/auth/device_id_store.dart';
import 'package:evcar_news/core/auth/token_storage.dart';
import 'package:evcar_news/core/platform/platform_capabilities.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('mobile: keystore-backed tokens and device id; everything supported', () {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    final caps = c.read(platformCapabilitiesProvider);
    expect(caps.isWebPreview, isFalse, reason: 'tests run as a mobile/desktop VM, not web');
    expect(caps.offlineDatabase && caps.localNotifications && caps.panoramaWebView, isTrue);
    expect(c.read(tokenStorageProvider), isA<SecureTokenStorage>());
    expect(c.read(deviceIdStoreProvider), isA<SecureDeviceIdStore>());
  });

  test('web preview: tokens stay in memory, native-only features report unsupported', () {
    final c = ProviderContainer(
      overrides: [platformCapabilitiesProvider.overrideWithValue(const PlatformCapabilities(isWebPreview: true))],
    );
    addTearDown(c.dispose);
    final caps = c.read(platformCapabilitiesProvider);
    expect(caps.offlineDatabase, isFalse);
    expect(caps.localNotifications, isFalse);
    expect(caps.panoramaWebView, isFalse);
    expect(caps.motionSensors, isFalse);
    expect(c.read(tokenStorageProvider), isA<InMemoryTokenStorage>());
    expect(c.read(deviceIdStoreProvider), isA<InMemoryDeviceIdStore>());
  });
}
