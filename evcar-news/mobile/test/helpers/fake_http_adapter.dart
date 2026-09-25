import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';

/// Response produced by a [FakeHttpAdapter] route.
class FakeResponse {
  FakeResponse.json(this.status, Object? body, {this.delay = Duration.zero})
    : body = jsonEncode(body),
      contentType = Headers.jsonContentType;

  FakeResponse.text(this.status, this.body, {this.contentType = 'text/html', this.delay = Duration.zero});

  FakeResponse.empty(this.status, {this.delay = Duration.zero}) : body = '', contentType = null;

  /// API error envelope `{error:{code,message,details?,requestId}}`.
  factory FakeResponse.error(int status, String code, {String? message, Object? details}) => FakeResponse.json(status, {
    'error': {'code': code, 'message': ?message, 'details': ?details, 'requestId': 'req-test'},
  });

  final int status;
  final String body;
  final String? contentType;
  final Duration delay;
}

/// Thrown by a handler to simulate a transport failure.
class FakeNetworkError implements Exception {
  const FakeNetworkError();
}

typedef FakeHandler = FutureOr<FakeResponse> Function(RequestOptions request);

/// In-memory transport for Dio: routes are keyed by `'METHOD /path'` (path as
/// passed to Dio, without the base URL). Unmatched requests get 404 unless a
/// [fallback] is set. Every request is recorded in [requests].
class FakeHttpAdapter implements HttpClientAdapter {
  FakeHttpAdapter({Map<String, FakeHandler>? routes, this.fallback}) : routes = routes ?? {};

  final Map<String, FakeHandler> routes;
  FakeHandler? fallback;
  final List<RequestOptions> requests = [];

  void on(String methodAndPath, FakeHandler handler) => routes[methodAndPath] = handler;

  List<RequestOptions> requestsTo(String methodAndPath) =>
      requests.where((r) => '${r.method} ${r.path}' == methodAndPath).toList();

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final key = '${options.method} ${options.path}';
    final handler = routes[key] ?? fallback;
    if (handler == null) {
      return _body(FakeResponse.error(404, 'NOT_FOUND', message: 'No fake route for $key'));
    }
    FakeResponse res;
    try {
      res = await handler(options);
    } on FakeNetworkError {
      throw DioException.connectionError(
        requestOptions: options,
        reason: 'fake network down',
        error: const SocketException('fake network down'),
      );
    }
    if (res.delay > Duration.zero) await Future<void>.delayed(res.delay);
    return _body(res);
  }

  ResponseBody _body(FakeResponse res) => ResponseBody.fromString(
    res.body,
    res.status,
    headers: {
      if (res.contentType != null) Headers.contentTypeHeader: [res.contentType!],
    },
  );

  @override
  void close({bool force = false}) {}
}

/// A contract-shaped user JSON for tests.
Map<String, dynamic> fakeUserJson({
  String id = '0190f5b2-0000-7000-8000-000000000001',
  String email = 'sara@example.com',
  String displayName = 'Sara',
  bool emailVerified = true,
  String locale = 'ar',
}) => {
  'id': id,
  'email': email,
  'displayName': displayName,
  'emailVerified': emailVerified,
  'locale': locale,
  'roles': ['user'],
  'permissions': <String>[],
  'createdAt': '2026-09-01T10:00:00.000Z',
};

/// `data` of a login/refresh response.
Map<String, dynamic> fakeLoginData({String access = 'access-1', String refresh = 'refresh-1', int expiresIn = 900}) => {
  'accessToken': access,
  'accessTokenExpiresIn': expiresIn,
  'refreshToken': refresh,
  'user': fakeUserJson(),
};
