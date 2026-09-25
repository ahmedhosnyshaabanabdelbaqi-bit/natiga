import 'package:dio/dio.dart';

import '../auth/auth_tokens.dart';
import '../auth/token_refresher.dart';
import '../auth/token_storage.dart';
import '../config/env.dart';
import '../json/json_readers.dart';
import 'api_exception.dart';
import 'interceptors/auth_interceptor.dart';
import 'interceptors/request_headers_interceptor.dart';

/// Builds the Dio instances used by the app.
///
/// Two instances share base options and headers:
///  * the main one (with [AuthInterceptor]);
///  * a bare one used only for `POST /auth/refresh`, so a refresh can never
///    recurse into the auth interceptor.
class DioFactory {
  DioFactory({
    required this.baseUrl,
    required this.locale,
    this.appVersion,
    this.adapter,
    this.timeout = const Duration(seconds: Env.apiTimeoutSeconds),
  });

  final String baseUrl;
  final RequestLocale Function() locale;
  final String? Function()? appVersion;

  /// Injected transport (tests use a fake adapter; production uses Dio's).
  final HttpClientAdapter? adapter;
  final Duration? timeout;

  BaseOptions get _baseOptions => BaseOptions(
    baseUrl: baseUrl,
    connectTimeout: timeout,
    receiveTimeout: timeout,
    sendTimeout: null,
    responseType: ResponseType.json,
    contentType: Headers.jsonContentType,
    headers: {'Accept': 'application/json'},
  );

  Dio createBare() {
    final dio = Dio(_baseOptions);
    if (adapter != null) dio.httpClientAdapter = adapter!;
    dio.interceptors.add(RequestHeadersInterceptor(locale: locale, appVersion: appVersion));
    return dio;
  }

  /// Returns the refresh call bound to [bare].
  RefreshCall refreshCallFor(Dio bare) {
    return (String refreshToken) async {
      try {
        final res = await bare.post<Object?>(
          '/auth/refresh',
          data: {'refreshToken': refreshToken},
          options: Options(extra: {AuthExtra.skipAuth: true}),
        );
        final body = res.data;
        if (body is! Map || body['data'] is! Map) {
          throw const ApiException(kind: ApiErrorKind.badResponse, code: 'BAD_RESPONSE');
        }
        return AuthTokens.fromLoginData(asJsonObject(body['data']), previousRefreshToken: refreshToken);
      } on DioException catch (e) {
        throw ApiException.fromDioException(e);
      } on FormatException catch (e) {
        throw ApiException(kind: ApiErrorKind.badResponse, code: 'BAD_RESPONSE', details: e.message);
      }
    };
  }

  Dio createAuthenticated({required TokenStorage storage, required TokenRefresher refresher}) {
    final dio = createBare();
    dio.interceptors.add(AuthInterceptor(dio: dio, storage: storage, refresher: refresher));
    return dio;
  }
}
