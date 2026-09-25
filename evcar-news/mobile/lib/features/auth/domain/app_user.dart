import 'package:flutter/foundation.dart';

import '../../../core/json/json_readers.dart';

/// `user` from the API contract (ARCHITECTURE §4.4.1):
/// `{id,email,displayName,emailVerified,locale,roles[],permissions[],createdAt}`.
@immutable
class AppUser {
  const AppUser({
    required this.id,
    required this.email,
    required this.displayName,
    required this.emailVerified,
    required this.locale,
    this.roles = const [],
    this.permissions = const [],
    this.createdAt,
  });

  final String id;
  final String email;
  final String displayName;
  final bool emailVerified;
  final String locale;
  final List<String> roles;
  final List<String> permissions;
  final DateTime? createdAt;

  /// Cosmetic only — the server enforces permissions.
  bool can(String permission) => permissions.contains(permission);

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
    id: json.requireString('id'),
    email: json.requireString('email'),
    displayName: json.stringOrNull('displayName') ?? '',
    emailVerified: json.boolOr('emailVerified', false),
    locale: json.stringOrNull('locale') ?? 'ar',
    roles: json.stringList('roles'),
    permissions: json.stringList('permissions'),
    createdAt: json.dateTimeOrNull('createdAt'),
  );

  /// Accepts `data` of `GET /me` (the user) or of register (`{user}`).
  static AppUser fromData(Object? data) {
    final json = asJsonObject(data, 'user');
    final nested = json['user'];
    return AppUser.fromJson(nested is Map ? asJsonObject(nested, 'user') : json);
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'email': email,
    'displayName': displayName,
    'emailVerified': emailVerified,
    'locale': locale,
    'roles': roles,
    'permissions': permissions,
    if (createdAt != null) 'createdAt': createdAt!.toUtc().toIso8601String(),
  };

  AppUser copyWith({String? displayName, String? locale, bool? emailVerified}) => AppUser(
    id: id,
    email: email,
    displayName: displayName ?? this.displayName,
    emailVerified: emailVerified ?? this.emailVerified,
    locale: locale ?? this.locale,
    roles: roles,
    permissions: permissions,
    createdAt: createdAt,
  );

  @override
  bool operator ==(Object other) =>
      other is AppUser &&
      other.id == id &&
      other.email == email &&
      other.displayName == displayName &&
      other.emailVerified == emailVerified &&
      other.locale == locale &&
      listEquals(other.roles, roles) &&
      listEquals(other.permissions, permissions);

  @override
  int get hashCode => Object.hash(id, email, displayName, emailVerified, locale);
}
