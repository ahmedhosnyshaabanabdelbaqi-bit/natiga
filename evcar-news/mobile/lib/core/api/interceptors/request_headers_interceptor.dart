import 'package:dio/dio.dart';

/// Current language/market for outgoing requests.
class RequestLocale {
  const RequestLocale({required this.languageCode, required this.marketCode});

  /// `ar` or `en`.
  final String languageCode;

  /// e.g. `EG`, `SA`, `AE`.
  final String marketCode;
}

/// Adds `Accept-Language`, `X-Market` and client identification headers.
///
/// The values are read lazily on every request so changing language or
/// market in settings takes effect immediately without rebuilding Dio.
/// A per-request `lang`/`market` query parameter (ARCHITECTURE §4.3) still
/// overrides these headers on the server.
class RequestHeadersInterceptor extends Interceptor {
  RequestHeadersInterceptor({required this.locale, this.appVersion});

  final RequestLocale Function() locale;
  final String? Function()? appVersion;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final l = locale();
    options.headers.putIfAbsent('Accept-Language', () => l.languageCode);
    options.headers.putIfAbsent('X-Market', () => l.marketCode);
    // Mobile receives the refresh token in the JSON body (§4.4.1); only web
    // clients send `web` here.
    options.headers.putIfAbsent('X-Client-Type', () => 'mobile');
    final v = appVersion?.call();
    if (v != null) options.headers.putIfAbsent('X-App-Version', () => v);
    handler.next(options);
  }
}
