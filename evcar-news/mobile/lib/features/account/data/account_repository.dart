import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/api/api_client.dart';
import '../../../core/json/json_readers.dart';
import '../../auth/domain/app_user.dart';
import '../domain/user_session.dart';

/// `/me` endpoints (authenticated).
class AccountRepository {
  AccountRepository(this._api);

  final ApiClient _api;

  Future<AppUser> me() => _api.getData('/me', AppUser.fromData);

  /// PATCH /me. If the server answers without a user body, the profile is
  /// re-read so the app never shows values the server did not confirm.
  Future<AppUser> updateMe({String? displayName, String? locale}) async {
    final body = {'displayName': ?displayName, 'locale': ?locale};
    final updated = await _api.patchData<AppUser?>(
      '/me',
      (data) => data is Map ? AppUser.fromData(data) : null,
      body: body,
    );
    return updated ?? await me();
  }

  Future<List<UserSession>> sessions() => _api.getData(
    '/me/sessions',
    (data) => asJsonList(
      data,
      'sessions',
    ).whereType<Map<dynamic, dynamic>>().map((e) => UserSession.fromJson(asJsonObject(e))).toList(growable: false),
  );

  Future<void> revokeSession(String id) => _api.send('DELETE', '/me/sessions/${Uri.encodeComponent(id)}');

  /// Deletes the account and personal data (`DELETE /me {password}` → 204).
  Future<void> deleteAccount(String password) => _api.send(
    'DELETE',
    '/me',
    body: {'password': password},
    options: Options(contentType: Headers.jsonContentType),
  );
}

final accountRepositoryProvider = Provider<AccountRepository>((ref) => AccountRepository(ref.watch(apiClientProvider)));
