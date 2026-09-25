import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:evcar_news/core/api/api_client.dart';
import 'package:evcar_news/core/api/api_exception.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/fake_http_adapter.dart';

void main() {
  group('ApiException.fromResponse', () {
    test('parses the error envelope', () {
      final e = ApiException.fromResponse(
        statusCode: 404,
        body: {
          'error': {'code': 'ARTICLE_NOT_FOUND', 'message': 'الخبر غير موجود', 'requestId': 'r-1'},
        },
      );
      expect(e.kind, ApiErrorKind.notFound);
      expect(e.code, 'ARTICLE_NOT_FOUND');
      expect(e.message, 'الخبر غير موجود');
      expect(e.requestId, 'r-1');
      expect(e.statusCode, 404);
    });

    test('422 VALIDATION_FAILED exposes field errors', () {
      final e = ApiException.fromResponse(
        statusCode: 422,
        body: {
          'error': {
            'code': 'VALIDATION_FAILED',
            'message': 'Some fields are invalid.',
            'details': [
              {
                'field': 'email',
                'constraints': {'isEmail': 'email must be an email'},
              },
              {
                'field': 'password',
                'constraints': {'minLength': 'too short', 'matches': 'needs a digit'},
              },
              {
                'field': 'items.0.name',
                'constraints': {'isNotEmpty': 'required'},
              },
              'garbage',
            ],
            'requestId': 'r-2',
          },
        },
      );
      expect(e.kind, ApiErrorKind.validation);
      expect(e.fieldErrors, hasLength(3));
      expect(e.fieldMessage('email'), 'email must be an email');
      expect(e.fieldMessage('password'), 'too short\nneeds a digit');
      expect(e.fieldMessage('items.0.name'), 'required');
      expect(e.fieldMessage('displayName'), isNull);
    });

    test('401 TOKEN_EXPIRED is recognised', () {
      final e = ApiException.fromResponse(
        statusCode: 401,
        body: {
          'error': {'code': 'TOKEN_EXPIRED', 'message': 'expired', 'requestId': 'r'},
        },
      );
      expect(e.kind, ApiErrorKind.unauthorized);
      expect(e.isTokenExpired, isTrue);
      final other = ApiException.fromResponse(
        statusCode: 401,
        body: {
          'error': {'code': 'UNAUTHORIZED', 'requestId': 'r'},
        },
      );
      expect(other.isTokenExpired, isFalse);
    });

    test('503 INTEGRATION_NOT_CONFIGURED maps to notConfigured (not retryable)', () {
      final e = ApiException.fromResponse(
        statusCode: 503,
        body: {
          'error': {
            'code': 'INTEGRATION_NOT_CONFIGURED',
            'details': {'integration': 'routing'},
            'requestId': 'r',
          },
        },
      );
      expect(e.kind, ApiErrorKind.notConfigured);
      expect(e.details, {'integration': 'routing'});
      expect(e.isRetryable, isFalse);
    });

    test('non-JSON error bodies (proxy HTML) fall back to HTTP_<status>', () {
      final e = ApiException.fromResponse(statusCode: 502, body: '<html>Bad gateway</html>');
      expect(e.kind, ApiErrorKind.server);
      expect(e.code, 'HTTP_502');
      expect(e.message, isNull);
      expect(e.isRetryable, isTrue);
    });

    test('JSON given as string or bytes is decoded', () {
      final json = jsonEncode({
        'error': {'code': 'RATE_LIMITED', 'message': 'slow down', 'requestId': 'r'},
      });
      final fromString = ApiException.fromResponse(statusCode: 429, body: json);
      final fromBytes = ApiException.fromResponse(statusCode: 429, body: utf8.encode(json));
      for (final e in [fromString, fromBytes]) {
        expect(e.kind, ApiErrorKind.rateLimited);
        expect(e.code, 'RATE_LIMITED');
        expect(e.message, 'slow down');
      }
    });

    test('request id header is used when the body has none', () {
      final e = ApiException.fromResponse(statusCode: 500, body: null, requestIdHeader: 'hdr-1');
      expect(e.requestId, 'hdr-1');
      expect(e.kind, ApiErrorKind.server);
    });
  });

  group('ApiException.fromDioException', () {
    final ro = RequestOptions(path: '/x');

    test('transport failures', () {
      expect(
        ApiException.fromDioException(DioException.connectionError(requestOptions: ro, reason: 'x')).kind,
        ApiErrorKind.network,
      );
      expect(
        ApiException.fromDioException(DioException.connectionTimeout(requestOptions: ro, timeout: Duration.zero)).kind,
        ApiErrorKind.timeout,
      );
      expect(
        ApiException.fromDioException(DioException.receiveTimeout(requestOptions: ro, timeout: Duration.zero)).kind,
        ApiErrorKind.timeout,
      );
      expect(
        ApiException.fromDioException(DioException.requestCancelled(requestOptions: ro, reason: 'x')).kind,
        ApiErrorKind.cancelled,
      );
      expect(
        ApiException.fromDioException(DioException(requestOptions: ro, error: const SocketException('down'))).kind,
        ApiErrorKind.network,
      );
    });

    test('bad responses are parsed from the envelope', () {
      final e = ApiException.fromDioException(
        DioException.badResponse(
          statusCode: 403,
          requestOptions: ro,
          response: Response(
            requestOptions: ro,
            statusCode: 403,
            data: {
              'error': {'code': 'FORBIDDEN', 'message': 'nope', 'requestId': 'r'},
            },
          ),
        ),
      );
      expect(e.kind, ApiErrorKind.forbidden);
      expect(e.message, 'nope');
    });

    test('an ApiException wrapped in a DioException is returned as is', () {
      const inner = ApiException(kind: ApiErrorKind.server, code: 'X');
      expect(ApiException.fromDioException(DioException(requestOptions: ro, error: inner)), same(inner));
    });
  });

  group('ApiClient envelope handling', () {
    late FakeHttpAdapter adapter;
    late ApiClient api;

    setUp(() {
      adapter = FakeHttpAdapter();
      final dio = Dio(BaseOptions(baseUrl: 'https://api.test/api/v1'))..httpClientAdapter = adapter;
      api = ApiClient(dio);
    });

    test('getData unwraps data', () async {
      adapter.on(
        'GET /thing',
        (_) => FakeResponse.json(200, {
          'data': {'id': 'a'},
        }),
      );
      final v = await api.getData('/thing', (d) => (d as Map)['id']);
      expect(v, 'a');
    });

    test('getPage parses items and meta', () async {
      adapter.on(
        'GET /things',
        (_) => FakeResponse.json(200, {
          'data': [
            {'id': 'a'},
            {'id': 'b'},
          ],
          'meta': {'page': 1, 'pageSize': 2, 'total': 5, 'totalPages': 3},
        }),
      );
      final page = await api.getPage('/things', (j) => j['id'] as String);
      expect(page.items, ['a', 'b']);
      expect(page.meta.total, 5);
      expect(page.meta.hasMore, isTrue);
    });

    test('missing data member is a badResponse ApiException', () async {
      adapter.on('GET /thing', (_) => FakeResponse.json(200, {'id': 'a'}));
      await expectLater(
        api.getData('/thing', (d) => d),
        throwsA(isA<ApiException>().having((e) => e.kind, 'kind', ApiErrorKind.badResponse)),
      );
    });

    test('HTTP errors and network errors become ApiException', () async {
      adapter.on('GET /missing', (_) => FakeResponse.error(404, 'NOT_FOUND', message: 'غير موجود'));
      adapter.on('GET /down', (_) => throw const FakeNetworkError());
      await expectLater(
        api.getData('/missing', (d) => d),
        throwsA(
          isA<ApiException>()
              .having((e) => e.kind, 'kind', ApiErrorKind.notFound)
              .having((e) => e.message, 'message', 'غير موجود'),
        ),
      );
      await expectLater(
        api.getData('/down', (d) => d),
        throwsA(isA<ApiException>().having((e) => e.isConnectivityProblem, 'offline', isTrue)),
      );
    });

    test('a parser TypeError becomes badResponse (never crashes the UI)', () async {
      adapter.on('GET /thing', (_) => FakeResponse.json(200, {'data': 42}));
      await expectLater(
        api.getData('/thing', (d) => (d as Map)['id']),
        throwsA(isA<ApiException>().having((e) => e.kind, 'kind', ApiErrorKind.badResponse)),
      );
    });
  });
}
