import 'package:flutter/foundation.dart';

import '../../../core/json/json_readers.dart';

/// One signed-in device from `GET /me/sessions`. Parsed defensively: only
/// `id` is required; unknown fields are ignored.
@immutable
class UserSession {
  const UserSession({
    required this.id,
    this.deviceName,
    this.userAgent,
    this.ip,
    this.clientType,
    this.createdAt,
    this.lastUsedAt,
    this.expiresAt,
    this.current = false,
  });

  final String id;
  final String? deviceName;
  final String? userAgent;
  final String? ip;

  /// `mobile` | `web`.
  final String? clientType;
  final DateTime? createdAt;
  final DateTime? lastUsedAt;
  final DateTime? expiresAt;

  /// True for the session making the request (if the server reports it).
  final bool current;

  factory UserSession.fromJson(Map<String, dynamic> json) => UserSession(
    id: json.requireString('id'),
    deviceName: json.stringOrNull('deviceName'),
    userAgent: json.stringOrNull('userAgent'),
    ip: json.stringOrNull('ip'),
    clientType: json.stringOrNull('clientType'),
    createdAt: json.dateTimeOrNull('createdAt'),
    lastUsedAt: json.dateTimeOrNull('lastUsedAt'),
    expiresAt: json.dateTimeOrNull('expiresAt'),
    current: json.boolOrNull('current') ?? json.boolOrNull('isCurrent') ?? false,
  );
}
