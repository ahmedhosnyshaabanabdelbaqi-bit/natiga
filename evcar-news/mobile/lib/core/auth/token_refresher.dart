import 'dart:async';

import '../api/api_exception.dart';
import 'auth_tokens.dart';
import 'session_events.dart';
import 'token_storage.dart';

/// Calls `POST /auth/refresh {refreshToken}` and returns the rotated tokens.
/// Must throw [ApiException] on failure.
typedef RefreshCall = Future<AuthTokens> Function(String refreshToken);

/// Thrown when there is no usable session to refresh.
class SessionExpiredException implements Exception {
  const SessionExpiredException();

  @override
  String toString() => 'SessionExpiredException';
}

/// Single-flight access-token refresh.
///
/// However many requests fail with `401 TOKEN_EXPIRED` at the same time, only
/// one `POST /auth/refresh` is sent; every caller awaits the same future. The
/// refresh token rotates on every call, so a second concurrent refresh with the
/// old token would be treated by the server as token reuse.
///
/// Failure policy (same as the admin client, docs/decisions/admin.md):
///  * refresh rejected (400/401/403) → tokens cleared, [SessionEvent.expired];
///  * network error / timeout → retried right away with the SAME token
///    ([retryDelays]); the server accepts the previous refresh token for a
///    short grace window (AUTH_REFRESH_REUSE_GRACE_SECONDS, 60 s) and answers
///    with the same new token, so a response lost on a mobile network does
///    not sign the user out;
///  * still failing / 5xx → tokens kept, error propagated (user stays signed in).
class TokenRefresher {
  TokenRefresher({
    required this._storage,
    required this._refreshCall,
    required this._events,
    this.retryDelays = defaultRetryDelays,
  });

  /// Pauses before each retry of a refresh that failed on the network.
  /// Together well inside the server's 60 s grace window.
  static const defaultRetryDelays = [Duration(seconds: 1), Duration(seconds: 3), Duration(seconds: 8)];

  final TokenStorage _storage;
  final RefreshCall _refreshCall;
  final SessionEvents _events;
  final List<Duration> retryDelays;

  Future<AuthTokens>? _inFlight;

  /// Number of refresh calls actually sent (for diagnostics/tests).
  int refreshCount = 0;

  bool get isRefreshing => _inFlight != null;

  /// Completes when no refresh is in flight (errors are swallowed). Logout
  /// awaits this so a late refresh cannot re-authenticate a signed-out user.
  Future<void> get idle async {
    final f = _inFlight;
    if (f == null) return;
    try {
      await f;
    } catch (_) {
      // The caller that triggered the refresh handles the error.
    }
  }

  /// Refreshes [current] once, sharing the in-flight refresh if any.
  Future<AuthTokens> refresh(AuthTokens current) {
    final existing = _inFlight;
    if (existing != null) return existing;
    final future = _doRefresh(current);
    _inFlight = future;
    // Clear the slot once settled; errors are observed by callers of [refresh].
    future.then<void>((_) {}, onError: (Object _) {}).whenComplete(() {
      if (identical(_inFlight, future)) _inFlight = null;
    });
    return future;
  }

  Future<AuthTokens> _doRefresh(AuthTokens current) async {
    final rt = current.refreshToken;
    if (rt == null || rt.isEmpty) {
      await expireSession();
      throw const SessionExpiredException();
    }
    for (var attempt = 0; ; attempt++) {
      refreshCount++;
      try {
        final fresh = await _refreshCall(rt);
        await _storage.write(fresh);
        return fresh;
      } on ApiException catch (e) {
        final status = e.statusCode;
        if (status == 400 || status == 401 || status == 403) {
          await expireSession();
          rethrow;
        }
        final transient = e.kind == ApiErrorKind.network || e.kind == ApiErrorKind.timeout;
        if (!transient || attempt >= retryDelays.length) rethrow;
        await Future<void>.delayed(retryDelays[attempt]);
      }
    }
  }

  /// Clears tokens and notifies listeners that the session is over.
  Future<void> expireSession() async {
    await _storage.clear();
    _events.emit(SessionEvent.expired);
  }
}
