// Contract check of the mobile networking stack against a REAL running backend.
//
// Skipped unless EVCAR_LIVE_API is set, so `flutter test` stays hermetic:
//
//   EVCAR_LIVE_API=http://localhost:3000/api/v1 \
//   EVCAR_LIVE_EMAIL=owner@example.com EVCAR_LIVE_PASSWORD='…' \
//   flutter test test/live
//
// The e-mail/password pair must belong to a verified account (e.g. the owner
// created with `npm run create-owner`). Nothing is written except one session
// (logged out at the end) and a locale change that is reverted.
import 'dart:io';

import 'package:evcar_news/core/api/api_client.dart';
import 'package:evcar_news/core/api/api_exception.dart';
import 'package:evcar_news/core/api/dio_factory.dart';
import 'package:evcar_news/core/api/interceptors/request_headers_interceptor.dart';
import 'package:evcar_news/core/app_config/app_config.dart';
import 'package:evcar_news/core/auth/session_events.dart';
import 'package:evcar_news/core/auth/token_refresher.dart';
import 'package:evcar_news/core/auth/token_storage.dart';
import 'package:evcar_news/core/json/json_readers.dart';
import 'package:evcar_news/features/account/data/account_repository.dart';
import 'package:evcar_news/features/auth/data/auth_repository.dart';
import 'package:flutter_test/flutter_test.dart';

final _base = Platform.environment['EVCAR_LIVE_API'];
final _email = Platform.environment['EVCAR_LIVE_EMAIL'];
final _password = Platform.environment['EVCAR_LIVE_PASSWORD'];

class _Stack {
  _Stack({String lang = 'ar'}) {
    final factory = DioFactory(
      baseUrl: _base!,
      locale: () => RequestLocale(languageCode: lang, marketCode: 'EG'),
      appVersion: () => 'live-test',
    );
    refresher = TokenRefresher(
      storage: storage,
      refreshCall: factory.refreshCallFor(factory.createBare()),
      events: SessionEvents(),
    );
    api = ApiClient(factory.createAuthenticated(storage: storage, refresher: refresher));
    auth = AuthRepository(api);
    account = AccountRepository(api);
  }

  final storage = InMemoryTokenStorage();
  late final TokenRefresher refresher;
  late final ApiClient api;
  late final AuthRepository auth;
  late final AccountRepository account;
}

Future<ApiException> _apiError(Future<Object?> Function() call) async {
  try {
    await call();
  } on ApiException catch (e) {
    return e;
  }
  fail('expected an ApiException');
}

void main() {
  final skipAll = _base == null ? 'EVCAR_LIVE_API is not set' : null;
  final skipAuth = skipAll ?? (_email == null || _password == null ? 'EVCAR_LIVE_EMAIL/PASSWORD not set' : null);

  test('GET /app-config parses into AppConfig with the §4.4.1 fields', () async {
    final s = _Stack();
    final json = await s.api.getData('/app-config', (d) => asJsonObject(d, 'app-config'), skipAuth: true);
    final config = AppConfig.fromJson(json);
    expect(config.branding.appName, isNotEmpty);
    expect(config.languages, containsAll(['ar', 'en']));
    expect(config.markets.map((m) => m.code), contains(config.defaultMarket));
    final eg = config.markets.firstWhere((m) => m.code == 'EG');
    expect(eg.currency, 'EGP');
    expect(config.homeSections, isNotEmpty);
    expect(config.features, isNotEmpty);
    // Server forces tripPlanner/assistant off while their providers are unconfigured.
    expect(json['features'], isA<Map<String, dynamic>>());
    expect(json['map'], containsPair('configured', isA<bool>()));
  }, skip: skipAll);

  test('localized INVALID_CREDENTIALS error envelope (ar and en)', () async {
    final ar = await _apiError(
      () => _Stack().auth.login(email: 'nobody-live-test@example.com', password: 'wrong-password-1'),
    );
    expect(ar.statusCode, 401);
    expect(ar.code, 'INVALID_CREDENTIALS');
    expect(ar.message, contains('البريد'));
    expect(ar.requestId, isNotEmpty);
    final en = await _apiError(
      () => _Stack(lang: 'en').auth.login(email: 'nobody-live-test@example.com', password: 'wrong-password-1'),
    );
    expect(en.message, contains('password'));
  }, skip: skipAll);

  test('422 VALIDATION_FAILED details map to field errors', () async {
    final e = await _apiError(
      () => _Stack(lang: 'en').auth.register(email: 'not-an-email', password: 'x', displayName: '', locale: 'en'),
    );
    expect(e.statusCode, 422);
    expect(e.code, 'VALIDATION_FAILED');
    // DTO validation runs first (shape), the password policy second.
    expect(e.fieldErrors.map((f) => f.field).toSet(), containsAll(['email', 'displayName']));
    final policy = await _apiError(
      () => _Stack(lang: 'en').auth.register(
        email: 'live-test-${DateTime.now().millisecondsSinceEpoch}@example.com',
        password: 'password',
        displayName: 'Live Test',
        locale: 'en',
      ),
    );
    expect(policy.statusCode, 422);
    expect(policy.fieldErrors.single.field, 'password');
  }, skip: skipAll);

  test('login → /me → sessions → rotated refresh → PATCH /me → logout', () async {
    final s = _Stack();
    final login = await s.auth.login(email: _email!, password: _password!, deviceName: 'flutter live test');
    expect(login.tokens.refreshToken, isNotNull, reason: 'mobile gets the refresh token in the body');
    expect(login.tokens.accessTokenExpiresAt, isNotNull);
    expect(login.user.email, _email!.toLowerCase());
    expect(login.user.emailVerified, isTrue);
    await s.storage.write(login.tokens);

    final me = await s.account.me();
    expect(me.id, login.user.id);
    expect(me.roles, isNotEmpty);

    final sessions = await s.account.sessions();
    final current = sessions.where((x) => x.current).toList();
    expect(current, hasLength(1));
    expect(current.single.deviceName, 'flutter live test');
    expect(current.single.clientType, 'mobile');

    final rotated = await s.refresher.refresh(login.tokens);
    expect(rotated.refreshToken, isNot(login.tokens.refreshToken));
    expect(rotated.accessToken, isNot(login.tokens.accessToken));
    expect((await s.storage.read())?.refreshToken, rotated.refreshToken);

    final original = me.locale;
    final changed = await s.account.updateMe(locale: original == 'ar' ? 'en' : 'ar');
    expect(changed.locale, original == 'ar' ? 'en' : 'ar');
    final restored = await s.account.updateMe(locale: original);
    expect(restored.locale, original);

    await s.auth.logout(rotated.refreshToken);
    final afterLogout = await _apiError(() => s.refresher.refresh(rotated));
    expect(afterLogout.statusCode, 401);
    expect(await s.storage.read(), isNull, reason: 'a rejected refresh clears the stored tokens');
  }, skip: skipAuth);
}
