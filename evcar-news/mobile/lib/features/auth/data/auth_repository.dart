import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/api/api_client.dart';
import '../../../core/auth/auth_tokens.dart';
import '../../../core/auth/device_id_store.dart';
import '../../../core/json/json_readers.dart';
import '../domain/app_user.dart';

class LoginResult {
  const LoginResult({required this.tokens, required this.user});

  final AuthTokens tokens;
  final AppUser user;
}

/// Public auth endpoints (ARCHITECTURE §4.4.1). All calls skip the bearer
/// token: a 401 here means "wrong credentials", never "refresh the session".
class AuthRepository {
  AuthRepository(this._api, {this._deviceIds});

  final ApiClient _api;
  final DeviceIdStore? _deviceIds;

  /// Header `X-Device-Id` (installation id) for sign-in requests; see [DeviceIdStore].
  Future<Options?> _deviceOptions() async {
    final store = _deviceIds;
    if (store == null) return null;
    try {
      final id = await store.read().timeout(const Duration(seconds: 2));
      return Options(headers: {'X-Device-Id': id});
    } catch (_) {
      // Keystore unavailable: sign in without the device id (still works).
      return null;
    }
  }

  Future<AppUser> register({
    required String email,
    required String password,
    required String displayName,
    required String locale,
  }) {
    return _api.postData(
      '/auth/register',
      AppUser.fromData,
      body: {'email': email, 'password': password, 'displayName': displayName, 'locale': locale},
      skipAuth: true,
    );
  }

  Future<void> verifyEmail(String token) =>
      _api.send('POST', '/auth/verify-email', body: {'token': token}, skipAuth: true);

  Future<void> resendVerification(String email) =>
      _api.send('POST', '/auth/resend-verification', body: {'email': email}, skipAuth: true);

  Future<LoginResult> login({required String email, required String password, String? deviceName}) async {
    return _api.postData(
      '/auth/login',
      (data) {
        final json = asJsonObject(data, 'login');
        return LoginResult(
          tokens: AuthTokens.fromLoginData(json),
          user: AppUser.fromJson(asJsonObject(json['user'], 'user')),
        );
      },
      body: {'email': email, 'password': password, 'deviceName': ?deviceName},
      options: await _deviceOptions(),
      skipAuth: true,
    );
  }

  /// Revokes the session identified by [refreshToken] (best effort).
  Future<void> logout(String? refreshToken) =>
      _api.send('POST', '/auth/logout', body: {'refreshToken': ?refreshToken}, skipAuth: true);

  /// Always "succeeds" from the user's perspective: the server never reveals
  /// whether the account exists (202).
  Future<void> forgotPassword(String email) =>
      _api.send('POST', '/auth/forgot-password', body: {'email': email}, skipAuth: true);

  Future<void> resetPassword({required String token, required String password}) =>
      _api.send('POST', '/auth/reset-password', body: {'token': token, 'password': password}, skipAuth: true);
}

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(ref.watch(apiClientProvider), deviceIds: ref.watch(deviceIdStoreProvider)),
);
