import '../json/json_readers.dart';

/// Access + refresh token pair for the mobile client.
///
/// Mobile receives the refresh token in the JSON body (web clients get it as
/// an httpOnly cookie instead — ARCHITECTURE §4.4.1) and keeps it only in
/// secure storage.
class AuthTokens {
  const AuthTokens({required this.accessToken, this.refreshToken, this.accessTokenExpiresAt});

  final String accessToken;
  final String? refreshToken;
  final DateTime? accessTokenExpiresAt;

  /// Parses the `data` object of `POST /auth/login` and `POST /auth/refresh`:
  /// `{accessToken, accessTokenExpiresIn, refreshToken?, user}`.
  ///
  /// [previousRefreshToken] is kept when the server does not return a new one.
  factory AuthTokens.fromLoginData(Map<String, dynamic> data, {DateTime? now, String? previousRefreshToken}) {
    final expiresIn = data.intOrNull('accessTokenExpiresIn');
    final issuedAt = (now ?? DateTime.now()).toUtc();
    return AuthTokens(
      accessToken: data.requireString('accessToken'),
      refreshToken: data.stringOrNull('refreshToken') ?? previousRefreshToken,
      accessTokenExpiresAt: expiresIn == null ? null : issuedAt.add(Duration(seconds: expiresIn)),
    );
  }

  factory AuthTokens.fromJson(Map<String, dynamic> json) => AuthTokens(
    accessToken: json.requireString('accessToken'),
    refreshToken: json.stringOrNull('refreshToken'),
    accessTokenExpiresAt: json.dateTimeOrNull('accessTokenExpiresAt'),
  );

  Map<String, dynamic> toJson() => {
    'accessToken': accessToken,
    if (refreshToken != null) 'refreshToken': refreshToken,
    if (accessTokenExpiresAt != null) 'accessTokenExpiresAt': accessTokenExpiresAt!.toUtc().toIso8601String(),
  };

  @override
  String toString() => 'AuthTokens(expiresAt: $accessTokenExpiresAt, hasRefresh: ${refreshToken != null})';
}
