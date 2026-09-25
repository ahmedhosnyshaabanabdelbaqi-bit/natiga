import 'package:dio/dio.dart';

import '../json/json_readers.dart';
import 'api_exception.dart';
import 'interceptors/auth_interceptor.dart';
import 'paged.dart';

/// Thin typed wrapper over [Dio] that understands the API envelope
/// (`{data}` / `{data, meta}` / `{error}`) and always throws [ApiException].
///
/// Feature repositories use this instead of Dio directly:
/// ```dart
/// final article = await api.getData('/articles/$slug', Article.fromJsonValue);
/// final page = await api.getPage('/articles', Article.fromJson, query: {'page': 1});
/// ```
class ApiClient {
  ApiClient(this.dio);

  final Dio dio;

  static Options _options(Options? options, {bool skipAuth = false}) {
    final o = options ?? Options();
    if (!skipAuth) return o;
    return o.copyWith(extra: {...?o.extra, AuthExtra.skipAuth: true});
  }

  /// GET a single resource and parse `data`.
  Future<T> getData<T>(
    String path,
    T Function(Object? data) parse, {
    Map<String, dynamic>? query,
    Options? options,
    CancelToken? cancelToken,
    bool skipAuth = false,
  }) {
    return _guard(() async {
      final res = await dio.get<Object?>(
        path,
        queryParameters: query,
        options: _options(options, skipAuth: skipAuth),
        cancelToken: cancelToken,
      );
      return parse(unwrapData(res.data));
    });
  }

  /// GET the raw envelope body (for callers that cache the JSON themselves).
  Future<Object?> getJson(
    String path, {
    Map<String, dynamic>? query,
    Options? options,
    CancelToken? cancelToken,
    bool skipAuth = false,
  }) {
    return _guard(() async {
      final res = await dio.get<Object?>(
        path,
        queryParameters: query,
        options: _options(options, skipAuth: skipAuth),
        cancelToken: cancelToken,
      );
      return res.data;
    });
  }

  /// GET a list endpoint and parse `data[]` + `meta`.
  Future<Paged<T>> getPage<T>(
    String path,
    T Function(Map<String, dynamic> item) parseItem, {
    Map<String, dynamic>? query,
    Options? options,
    CancelToken? cancelToken,
    bool skipAuth = false,
  }) {
    return _guard(() async {
      final res = await dio.get<Object?>(
        path,
        queryParameters: query,
        options: _options(options, skipAuth: skipAuth),
        cancelToken: cancelToken,
      );
      return parsePage(res.data, parseItem);
    });
  }

  /// POST and parse `data` of the response.
  Future<T> postData<T>(
    String path,
    T Function(Object? data) parse, {
    Object? body,
    Map<String, dynamic>? query,
    Options? options,
    bool skipAuth = false,
  }) {
    return _guard(() async {
      final res = await dio.post<Object?>(
        path,
        data: body,
        queryParameters: query,
        options: _options(options, skipAuth: skipAuth),
      );
      return parse(unwrapData(res.data));
    });
  }

  /// PATCH and parse `data` of the response.
  Future<T> patchData<T>(String path, T Function(Object? data) parse, {Object? body, Options? options}) {
    return _guard(() async {
      final res = await dio.patch<Object?>(path, data: body, options: options);
      return parse(unwrapData(res.data));
    });
  }

  /// Sends a request whose response body is irrelevant (202/204 endpoints).
  Future<void> send(
    String method,
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    Options? options,
    bool skipAuth = false,
  }) {
    return _guard(() async {
      await dio.request<Object?>(
        path,
        data: body,
        queryParameters: query,
        options: _options(options, skipAuth: skipAuth).copyWith(method: method),
      );
    });
  }

  /// Returns the `data` member of a success envelope.
  static Object? unwrapData(Object? body) {
    if (body is Map && body.containsKey('data')) return body['data'];
    throw ApiException(
      kind: ApiErrorKind.badResponse,
      code: 'BAD_RESPONSE',
      details: 'Response body has no "data" member',
    );
  }

  /// Parses a list envelope `{data: [...], meta: {...}}`.
  static Paged<T> parsePage<T>(Object? body, T Function(Map<String, dynamic> item) parseItem) {
    if (body is! Map) {
      throw const ApiException(kind: ApiErrorKind.badResponse, code: 'BAD_RESPONSE');
    }
    final json = asJsonObject(body);
    final data = json['data'];
    if (data is! List) {
      throw const ApiException(kind: ApiErrorKind.badResponse, code: 'BAD_RESPONSE');
    }
    return Paged(
      items: data.whereType<Map<dynamic, dynamic>>().map((e) => parseItem(asJsonObject(e))).toList(growable: false),
      meta: PageMeta.fromJson(json.objectOrNull('meta')),
    );
  }

  static Future<T> _guard<T>(Future<T> Function() call) async {
    try {
      return await call();
    } on DioException catch (e) {
      throw ApiException.fromDioException(e);
    } on FormatException catch (e) {
      throw ApiException(kind: ApiErrorKind.badResponse, code: 'BAD_RESPONSE', details: e.message);
    } on TypeError catch (e) {
      // A model's fromJson met an unexpected shape.
      throw ApiException(kind: ApiErrorKind.badResponse, code: 'BAD_RESPONSE', details: e.toString());
    }
  }
}
