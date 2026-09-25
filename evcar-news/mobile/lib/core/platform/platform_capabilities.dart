import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// What the current platform can do.
///
/// Production targets are **Android and iOS**. The web build exists only as a
/// design preview (docs/decisions/prep-mobile.md): plugins without a web
/// implementation fall back behind the existing abstractions (in-memory
/// cache, in-memory tokens) and features show an honest "not available in
/// the web preview" state instead of crashing.
///
/// Features read [platformCapabilitiesProvider] (never `kIsWeb` directly) so
/// widget tests can simulate the preview:
///
/// ```dart
/// if (!ref.watch(platformCapabilitiesProvider).panoramaWebView) {
///   return const UnsupportedOnPlatformView();
/// }
/// ```
@immutable
class PlatformCapabilities {
  const PlatformCapabilities({required this.isWebPreview});

  /// Capabilities of the running platform.
  static const current = PlatformCapabilities(isWebPreview: kIsWeb);

  /// The browser design preview (not a production target).
  final bool isWebPreview;

  /// SQLite offline cache / saved items (sqflite has no web implementation;
  /// the preview uses in-memory stores, nothing survives a reload).
  bool get offlineDatabase => !isWebPreview;

  /// Session tokens in the platform keystore/keychain. The preview keeps
  /// tokens in memory only (never in browser storage).
  bool get secureTokenStorage => !isWebPreview;

  /// Scheduled local notifications (reminders).
  bool get localNotifications => !isWebPreview;

  /// The isolated WebView used by the 360° viewer (webview_flutter has no
  /// endorsed web implementation).
  bool get panoramaWebView => !isWebPreview;

  /// Gyroscope-driven 360° mode.
  bool get motionSensors => !isWebPreview;

  /// Opening Google Maps / Waze / Apple Maps apps for directions (the
  /// preview opens the web map instead).
  bool get externalNavigationApps => !isWebPreview;

  @override
  bool operator ==(Object other) => other is PlatformCapabilities && other.isWebPreview == isWebPreview;

  @override
  int get hashCode => isWebPreview.hashCode;
}

/// Overridable in tests (`PlatformCapabilities(isWebPreview: true)`).
final platformCapabilitiesProvider = Provider<PlatformCapabilities>((ref) => PlatformCapabilities.current);
