import 'dart:async';

import 'package:evcar_news/core/api/api_client.dart';
import 'package:evcar_news/core/api/api_exception.dart';
import 'package:evcar_news/core/api/dio_factory.dart';
import 'package:evcar_news/core/api/interceptors/request_headers_interceptor.dart';
import 'package:evcar_news/core/auth/auth_tokens.dart';
import 'package:evcar_news/core/auth/session_events.dart';
import 'package:evcar_news/core/auth/token_refresher.dart';
import 'package:evcar_news/core/auth/token_storage.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/fake_http_adapter.dart';

class _Setup {
  _Setup({AuthTokens? initial}) : storage = InMemoryTokenStorage(initial) {
    final factory = DioFactory(
      baseUrl: 'https://api.test/api/v1',
      locale: () => const RequestLocale(languageCode: 'ar', marketCode: 'EG'),
      adapter: adapter,
      timeout: null,
    );
    refresher = TokenRefresher(
      storage: storage,
      refreshCall: factory.refreshCallFor(factory.createBare()),
      events: events,
      retryDelays: const [Duration.zero, Duration.zero],
    );
    events.stream.listen(expiredEvents.add);
    api = ApiClient(factory.createAuthenticated(storage: storage, refresher: refresher));
  }

  final adapter = FakeHttpAdapter();
  final InMemoryTokenStorage storage;
  final events = SessionEvents();
  final expiredEvents = <SessionEvent>[];
  late final TokenRefresher refresher;
  late final ApiClient api;

  /// Protected endpoint: 200 only with the given access token, otherwise
  /// 401 TOKEN_EXPIRED.
  void protectedRoute(String path, {required String validToken}) {
    adapter.on('GET $path', (r) {
      if (r.headers['Authorization'] == 'Bearer $validToken') {
        return FakeResponse.json(200, {
          'data': {'ok': true, 'path': path},
        });
      }
      return FakeResponse.error(401, 'TOKEN_EXPIRED', message: 'expired');
    });
  }
}

const _old = AuthTokens(accessToken: 'old-access', refreshToken: 'refresh-1');

void main() {
  test('adds bearer, language, market and client headers', () async {
    final s = _Setup(initial: _old);
    s.adapter.on('GET /me', (_) => FakeResponse.json(200, {'data': fakeUserJson()}));
    await s.api.getData('/me', (d) => d);
    final h = s.adapter.requests.single.headers;
    expect(h['Authorization'], 'Bearer old-access');
    expect(h['Accept-Language'], 'ar');
    expect(h['X-Market'], 'EG');
    expect(h['X-Client-Type'], 'mobile');
  });

  test('concurrent 401 TOKEN_EXPIRED responses trigger exactly one refresh (single-flight)', () async {
    final s = _Setup(initial: _old);
    for (var i = 0; i < 5; i++) {
      s.protectedRoute('/me/item$i', validToken: 'new-access');
    }
    s.adapter.on('POST /auth/refresh', (r) {
      return FakeResponse.json(200, {
        'data': fakeLoginData(access: 'new-access', refresh: 'refresh-2'),
      }, delay: const Duration(milliseconds: 30));
    });

    final results = await Future.wait([
      for (var i = 0; i < 5; i++) s.api.getData('/me/item$i', (d) => (d as Map)['path']),
    ]);

    expect(results, ['/me/item0', '/me/item1', '/me/item2', '/me/item3', '/me/item4']);
    final refreshes = s.adapter.requestsTo('POST /auth/refresh');
    expect(refreshes, hasLength(1), reason: 'one refresh for all concurrent 401s');
    expect(s.refresher.refreshCount, 1);
    expect(refreshes.single.data, {'refreshToken': 'refresh-1'});
    expect(refreshes.single.headers.containsKey('Authorization'), isFalse);
    final stored = await s.storage.read();
    expect(stored!.accessToken, 'new-access');
    expect(stored.refreshToken, 'refresh-2');
    expect(stored.accessTokenExpiresAt, isNotNull);
    expect(s.expiredEvents, isEmpty);
  });

  test('a request sent while a refresh is running waits for the new token', () async {
    final s = _Setup(initial: _old);
    s.protectedRoute('/me/a', validToken: 'new-access');
    s.protectedRoute('/me/b', validToken: 'new-access');
    final gate = Completer<void>();
    s.adapter.on('POST /auth/refresh', (r) async {
      await gate.future;
      return FakeResponse.json(200, {'data': fakeLoginData(access: 'new-access', refresh: 'refresh-2')});
    });

    final first = s.api.getData('/me/a', (d) => d);
    // Let the first request fail and start the refresh.
    while (!s.refresher.isRefreshing) {
      await Future<void>.delayed(const Duration(milliseconds: 1));
    }
    final second = s.api.getData('/me/b', (d) => d);
    gate.complete();
    await Future.wait([first, second]);

    final bRequests = s.adapter.requestsTo('GET /me/b');
    expect(bRequests, hasLength(1), reason: 'no 401 round-trip for the queued request');
    expect(bRequests.single.headers['Authorization'], 'Bearer new-access');
    expect(s.refresher.refreshCount, 1);
  });

  test('rejected refresh clears tokens, emits expired once, and surfaces 401', () async {
    final s = _Setup(initial: _old);
    s.protectedRoute('/me/a', validToken: 'never');
    s.protectedRoute('/me/b', validToken: 'never');
    s.adapter.on('POST /auth/refresh', (_) => FakeResponse.error(401, 'UNAUTHORIZED', message: 'revoked'));

    final outcomes = await Future.wait([
      s.api.getData('/me/a', (d) => d).then<Object?>((v) => v, onError: (Object e) => e),
      s.api.getData('/me/b', (d) => d).then<Object?>((v) => v, onError: (Object e) => e),
    ]);

    for (final o in outcomes) {
      expect(o, isA<ApiException>().having((e) => e.statusCode, 'status', 401));
    }
    expect(s.adapter.requestsTo('POST /auth/refresh'), hasLength(1));
    expect(await s.storage.read(), isNull);
    await Future<void>.delayed(Duration.zero);
    expect(s.expiredEvents, [SessionEvent.expired]);
  });

  test('network failure during refresh keeps the session and reports offline', () async {
    final s = _Setup(initial: _old);
    s.protectedRoute('/me/a', validToken: 'new-access');
    s.adapter.on('POST /auth/refresh', (_) => throw const FakeNetworkError());

    await expectLater(
      s.api.getData('/me/a', (d) => d),
      throwsA(isA<ApiException>().having((e) => e.kind, 'kind', ApiErrorKind.network)),
    );
    expect((await s.storage.read())!.refreshToken, 'refresh-1');
    expect(s.expiredEvents, isEmpty);
    // Retried promptly (inside the server's grace window) before giving up.
    expect(s.adapter.requestsTo('POST /auth/refresh'), hasLength(3));
  });

  test('a lost refresh response is retried with the same token and the session survives', () async {
    final s = _Setup(initial: _old);
    s.protectedRoute('/me/a', validToken: 'new-access');
    var calls = 0;
    final sentTokens = <Object?>[];
    s.adapter.on('POST /auth/refresh', (r) {
      sentTokens.add((r.data as Map<String, dynamic>?)?['refreshToken']);
      calls++;
      // The server rotated, but the response never reached the phone.
      if (calls == 1) throw const FakeNetworkError();
      // Retry with the previous token inside the grace window → same new token.
      return FakeResponse.json(200, {'data': fakeLoginData(access: 'new-access')});
    });

    final res = await s.api.getData('/me/a', (d) => d);
    expect(res, containsPair('ok', true));
    expect(sentTokens, ['refresh-1', 'refresh-1']);
    expect((await s.storage.read())!.accessToken, 'new-access');
    expect(s.expiredEvents, isEmpty);
  });

  test('a second TOKEN_EXPIRED after the retry is surfaced, never looped', () async {
    final s = _Setup(initial: _old);
    s.adapter.on('GET /me/a', (_) => FakeResponse.error(401, 'TOKEN_EXPIRED'));
    s.adapter.on('POST /auth/refresh', (_) => FakeResponse.json(200, {'data': fakeLoginData(access: 'new-access')}));

    await expectLater(
      s.api.getData('/me/a', (d) => d),
      throwsA(isA<ApiException>().having((e) => e.isTokenExpired, 'tokenExpired', isTrue)),
    );
    expect(s.adapter.requestsTo('GET /me/a'), hasLength(2));
    expect(s.refresher.refreshCount, 1);
  });

  test('other 401s on authenticated requests end the session without refreshing', () async {
    final s = _Setup(initial: _old);
    s.adapter.on('GET /me', (_) => FakeResponse.error(401, 'UNAUTHORIZED', message: 'session revoked'));

    await expectLater(s.api.getData('/me', (d) => d), throwsA(isA<ApiException>()));
    expect(s.adapter.requestsTo('POST /auth/refresh'), isEmpty);
    expect(await s.storage.read(), isNull);
    await Future<void>.delayed(Duration.zero);
    expect(s.expiredEvents, [SessionEvent.expired]);
  });

  test('skipAuth requests carry no token and a 401 does not refresh', () async {
    final s = _Setup(initial: _old);
    s.adapter.on('POST /auth/login', (_) => FakeResponse.error(401, 'INVALID_CREDENTIALS', message: 'wrong'));

    await expectLater(
      s.api.postData('/auth/login', (d) => d, body: {'email': 'a@b.c', 'password': 'x'}, skipAuth: true),
      throwsA(isA<ApiException>().having((e) => e.code, 'code', 'INVALID_CREDENTIALS')),
    );
    expect(s.adapter.requests.single.headers.containsKey('Authorization'), isFalse);
    expect(s.adapter.requestsTo('POST /auth/refresh'), isEmpty);
    expect(await s.storage.read(), isNotNull, reason: 'wrong password must not sign the user out');
  });

  test('no refresh token → session expires immediately without calling the server', () async {
    final s = _Setup(initial: const AuthTokens(accessToken: 'old-access'));
    s.protectedRoute('/me/a', validToken: 'new-access');

    await expectLater(s.api.getData('/me/a', (d) => d), throwsA(isA<ApiException>()));
    expect(s.adapter.requestsTo('POST /auth/refresh'), isEmpty);
    expect(await s.storage.read(), isNull);
  });
}
