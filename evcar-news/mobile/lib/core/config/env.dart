import 'package:flutter/foundation.dart';

/// Compile-time configuration passed with `--dart-define`.
///
/// ```sh
/// flutter run --dart-define=API_BASE_URL=https://api.evcar.news/api/v1
/// ```
///
/// No secrets belong here: everything compiled into the app binary is public.
abstract final class Env {
  /// Base URL of the REST API including the `/api/v1` prefix.
  ///
  /// The default targets the host machine from the Android emulator
  /// (`10.0.2.2`) during local development; the web design preview defaults
  /// to `http://localhost:3000/api/v1` (the backend must list the preview
  /// origin in `CORS_ORIGINS`).
  static String get apiBaseUrl => _definedApiBaseUrl.isNotEmpty
      ? _definedApiBaseUrl
      : (kIsWeb ? 'http://localhost:3000/api/v1' : 'http://10.0.2.2:3000/api/v1');

  static const String _definedApiBaseUrl = String.fromEnvironment('API_BASE_URL');

  /// Public web origin used for share links when `/app-config` has not been
  /// loaded yet (the server value `share.baseUrl` wins once available).
  static const String shareBaseUrl = String.fromEnvironment('SHARE_BASE_URL', defaultValue: 'https://evcar.news');

  /// Connect/receive timeouts for API calls, in seconds.
  static const int apiTimeoutSeconds = int.fromEnvironment('API_TIMEOUT_SECONDS', defaultValue: 20);
}
