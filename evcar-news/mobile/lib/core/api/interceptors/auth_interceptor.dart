import 'package:dio/dio.dart';

import '../../auth/token_refresher.dart';
import '../../auth/token_storage.dart';
import '../api_exception.dart';

/// `RequestOptions.extra` keys understood by [AuthInterceptor].
abstract final class AuthExtra {
  /// Do not attach the bearer token and never refresh (auth endpoints).
  static const skipAuth = 'evcar.skipAuth';

  /// Internal: marks the single retry after a refresh.
  static const retried = 'evcar.retried';
}

/// Attaches `Authorization: Bearer <access>` and handles `401 TOKEN_EXPIRED`
/// by refreshing once (single-flight via [TokenRefresher]) and retrying the
/// original request once. A second 401 is surfaced, never looped.
///
/// Any other 401 on a request that carried a token (revoked session,
/// suspended account) ends the local session.
class AuthInterceptor extends Interceptor {
  AuthInterceptor({required this._dio, required this._storage, required this._refresher});

  final Dio _dio;
  final TokenStorage _storage;
  final TokenRefresher _refresher;

  static const _authHeader = 'Authorization';

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    if (options.extra[AuthExtra.skipAuth] == true) {
      handler.next(options);
      return;
    }
    // Requests issued while a refresh is running wait for the new token
    // instead of failing with a guaranteed 401.
    if (_refresher.isRefreshing) await _refresher.idle;
    final tokens = await _storage.read();
    if (tokens != null) {
      options.headers[_authHeader] = 'Bearer ${tokens.accessToken}';
    } else {
      options.headers.remove(_authHeader);
    }
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final options = err.requestOptions;
    final response = err.response;
    if (response?.statusCode != 401 || options.extra[AuthExtra.skipAuth] == true) {
      handler.next(err);
      return;
    }
    final sentAuth = options.headers[_authHeader] as String?;
    if (sentAuth == null) {
      // Anonymous request to a protected endpoint: nothing to refresh.
      handler.next(err);
      return;
    }

    final apiError = ApiException.fromDioException(err);
    if (!apiError.isTokenExpired) {
      // Revoked session / suspended account → sign out locally.
      await _endSessionIfStillCurrent(sentAuth);
      handler.next(err);
      return;
    }
    if (options.extra[AuthExtra.retried] == true) {
      // Still expired right after a refresh (e.g. clock skew): surface it.
      handler.next(err);
      return;
    }

    try {
      final current = await _storage.read();
      if (current == null) {
        handler.next(err); // signed out meanwhile
        return;
      }
      // If another request already refreshed, reuse its token.
      final fresh = sentAuth == 'Bearer ${current.accessToken}' ? await _refresher.refresh(current) : current;

      final retryOptions = options.copyWith(
        headers: {...options.headers, _authHeader: 'Bearer ${fresh.accessToken}'},
        extra: {...options.extra, AuthExtra.retried: true},
      );
      final retried = await _dio.fetch<dynamic>(retryOptions);
      handler.resolve(retried);
    } on DioException catch (e) {
      handler.next(e);
    } on ApiException catch (e) {
      handler.next(DioException(requestOptions: options, response: response, type: DioExceptionType.unknown, error: e));
    } on SessionExpiredException {
      handler.next(err);
    }
  }

  Future<void> _endSessionIfStillCurrent(String sentAuth) async {
    final current = await _storage.read();
    if (current != null && sentAuth == 'Bearer ${current.accessToken}') {
      await _refresher.expireSession();
    }
  }
}
