import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';

/// Broad category of an API failure, used by the UI to pick a state
/// (offline, error, permission, …). The precise server reason is in
/// [ApiException.code].
enum ApiErrorKind {
  /// No connection / DNS failure / connection refused / TLS failure.
  network,

  /// Connect, send or receive timeout.
  timeout,

  /// Request was cancelled by the app.
  cancelled,

  /// 400 (malformed request).
  badRequest,

  /// 401 — includes `TOKEN_EXPIRED` (see [ApiException.isTokenExpired]).
  unauthorized,

  /// 403.
  forbidden,

  /// 404 / 410.
  notFound,

  /// 409 / 412.
  conflict,

  /// 422 `VALIDATION_FAILED` with [ApiException.fieldErrors].
  validation,

  /// 429.
  rateLimited,

  /// 503 `INTEGRATION_NOT_CONFIGURED` — show a "not configured" state.
  notConfigured,

  /// 501 `NOT_IMPLEMENTED`.
  notImplemented,

  /// Other 5xx.
  server,

  /// A 2xx/3xx response whose body does not match the API envelope.
  badResponse,

  /// Anything else (programming errors are not wrapped).
  unknown,
}

/// One entry of `details` for `422 VALIDATION_FAILED`
/// (`[{field: "email", constraints: {isEmail: "…"}}]`).
class FieldError {
  const FieldError({required this.field, required this.constraints});

  /// Dotted path, e.g. `items.0.name`.
  final String field;

  /// constraint name → server message (already localized by the server when
  /// it can be).
  final Map<String, String> constraints;

  List<String> get messages => constraints.values.toList(growable: false);

  @override
  String toString() => 'FieldError($field: $constraints)';
}

/// Typed error for every failed API call.
///
/// Built from the server envelope
/// `{"error": {"code", "message", "details"?, "requestId"}}` (ARCHITECTURE
/// §4.3) or from a transport failure. [message] is the server's localized
/// message when present; UIs fall back to a generic localized text per [kind].
class ApiException implements Exception {
  const ApiException({
    required this.kind,
    required this.code,
    this.statusCode,
    this.message,
    this.details,
    this.requestId,
    this.fieldErrors = const [],
  });

  final ApiErrorKind kind;

  /// Server code (e.g. `VALIDATION_FAILED`, `TOKEN_EXPIRED`) or a client code
  /// (`NETWORK_ERROR`, `TIMEOUT`, `CANCELLED`, `BAD_RESPONSE`, `HTTP_502`).
  final String code;
  final int? statusCode;
  final String? message;
  final Object? details;
  final String? requestId;
  final List<FieldError> fieldErrors;

  static const tokenExpiredCode = 'TOKEN_EXPIRED';
  static const notConfiguredCode = 'INTEGRATION_NOT_CONFIGURED';

  bool get isTokenExpired => statusCode == 401 && code == tokenExpiredCode;

  /// True for failures where showing cached/offline content makes sense.
  bool get isConnectivityProblem => kind == ApiErrorKind.network || kind == ApiErrorKind.timeout;

  /// True when retrying the same request later may succeed.
  bool get isRetryable => isConnectivityProblem || kind == ApiErrorKind.server || kind == ApiErrorKind.rateLimited;

  /// Messages for one field of a `VALIDATION_FAILED` error, joined for display.
  String? fieldMessage(String field) {
    final msgs = [
      for (final f in fieldErrors)
        if (f.field == field) ...f.messages,
    ];
    return msgs.isEmpty ? null : msgs.join('\n');
  }

  /// Builds an exception from an HTTP status and (possibly non-JSON) body.
  factory ApiException.fromResponse({required int? statusCode, Object? body, String? requestIdHeader}) {
    final envelope = _decodeEnvelope(body);
    final err = envelope?['error'];
    String? code;
    String? message;
    Object? details;
    String? requestId = requestIdHeader;
    if (err is Map) {
      final c = err['code'];
      if (c is String && c.isNotEmpty) code = c;
      final m = err['message'];
      if (m is String && m.isNotEmpty) message = m;
      details = err['details'];
      final r = err['requestId'];
      if (r is String && r.isNotEmpty) requestId = r;
    }
    final status = statusCode;
    final kind = _kindFor(status, code);
    code ??= status == null ? 'BAD_RESPONSE' : (status >= 200 && status < 400 ? 'BAD_RESPONSE' : 'HTTP_$status');
    return ApiException(
      kind: kind,
      code: code,
      statusCode: status,
      message: message,
      details: details,
      requestId: requestId,
      fieldErrors: code == 'VALIDATION_FAILED' ? _parseFieldErrors(details) : const [],
    );
  }

  /// Maps any [DioException] to an [ApiException].
  factory ApiException.fromDioException(DioException e) {
    final inner = e.error;
    if (inner is ApiException) return inner;
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.transformTimeout:
        return const ApiException(kind: ApiErrorKind.timeout, code: 'TIMEOUT');
      case DioExceptionType.cancel:
        return const ApiException(kind: ApiErrorKind.cancelled, code: 'CANCELLED');
      case DioExceptionType.connectionError:
        return const ApiException(kind: ApiErrorKind.network, code: 'NETWORK_ERROR');
      case DioExceptionType.badCertificate:
        return const ApiException(kind: ApiErrorKind.network, code: 'BAD_CERTIFICATE');
      case DioExceptionType.badResponse:
        final r = e.response;
        return ApiException.fromResponse(
          statusCode: r?.statusCode,
          body: r?.data,
          requestIdHeader: r?.headers.value('x-request-id'),
        );
      case DioExceptionType.unknown:
        if (inner is SocketException || inner is HttpException || inner is HandshakeException) {
          return const ApiException(kind: ApiErrorKind.network, code: 'NETWORK_ERROR');
        }
        if (inner is FormatException) {
          return const ApiException(kind: ApiErrorKind.badResponse, code: 'BAD_RESPONSE');
        }
        final r = e.response;
        if (r != null) {
          return ApiException.fromResponse(statusCode: r.statusCode, body: r.data);
        }
        return ApiException(kind: ApiErrorKind.unknown, code: 'UNKNOWN', message: null, details: inner?.toString());
    }
  }

  /// Wraps an arbitrary error thrown while calling the API.
  factory ApiException.from(Object error) {
    if (error is ApiException) return error;
    if (error is DioException) return ApiException.fromDioException(error);
    if (error is SocketException) {
      return const ApiException(kind: ApiErrorKind.network, code: 'NETWORK_ERROR');
    }
    if (error is FormatException) {
      return ApiException(kind: ApiErrorKind.badResponse, code: 'BAD_RESPONSE', details: error.message);
    }
    return ApiException(kind: ApiErrorKind.unknown, code: 'UNKNOWN', details: error.toString());
  }

  static Map<String, dynamic>? _decodeEnvelope(Object? body) {
    Object? decoded = body;
    if (body is List<int>) {
      try {
        decoded = utf8.decode(body);
      } on FormatException {
        return null;
      }
    }
    if (decoded is String) {
      final trimmed = decoded.trim();
      if (!trimmed.startsWith('{')) return null;
      try {
        decoded = jsonDecode(trimmed);
      } on FormatException {
        return null;
      }
    }
    if (decoded is Map<String, dynamic>) return decoded;
    if (decoded is Map) return decoded.map((k, v) => MapEntry(k.toString(), v));
    return null;
  }

  static ApiErrorKind _kindFor(int? status, String? code) {
    if (code == notConfiguredCode) return ApiErrorKind.notConfigured;
    if (code == 'VALIDATION_FAILED') return ApiErrorKind.validation;
    if (code == 'NOT_IMPLEMENTED') return ApiErrorKind.notImplemented;
    if (status == null) return ApiErrorKind.badResponse;
    if (status >= 200 && status < 400) return ApiErrorKind.badResponse;
    switch (status) {
      case 400:
        return ApiErrorKind.badRequest;
      case 401:
        return ApiErrorKind.unauthorized;
      case 403:
        return ApiErrorKind.forbidden;
      case 404:
      case 410:
        return ApiErrorKind.notFound;
      case 409:
      case 412:
        return ApiErrorKind.conflict;
      case 422:
        return ApiErrorKind.validation;
      case 429:
        return ApiErrorKind.rateLimited;
      case 501:
        return ApiErrorKind.notImplemented;
    }
    if (status >= 500) return ApiErrorKind.server;
    return ApiErrorKind.badRequest;
  }

  static List<FieldError> _parseFieldErrors(Object? details) {
    if (details is! List) return const [];
    final out = <FieldError>[];
    for (final item in details) {
      if (item is! Map) continue;
      final field = item['field'];
      if (field is! String) continue;
      final raw = item['constraints'];
      final constraints = <String, String>{};
      if (raw is Map) {
        raw.forEach((k, v) {
          if (v != null) constraints[k.toString()] = v.toString();
        });
      }
      out.add(FieldError(field: field, constraints: constraints));
    }
    return List.unmodifiable(out);
  }

  @override
  String toString() =>
      'ApiException($code, status: $statusCode, kind: ${kind.name}'
      '${message != null ? ', message: $message' : ''}'
      '${requestId != null ? ', requestId: $requestId' : ''})';
}
