import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'auth_tokens.dart';

/// Persists the session tokens.
abstract interface class TokenStorage {
  Future<AuthTokens?> read();
  Future<void> write(AuthTokens tokens);
  Future<void> clear();
}

/// Stores tokens in the platform keystore/keychain via flutter_secure_storage.
///
/// Values are cached in memory after the first read so the auth interceptor
/// does not hit the keystore on every request.
class SecureTokenStorage implements TokenStorage {
  SecureTokenStorage({FlutterSecureStorage? storage})
    : _storage =
          storage ??
          const FlutterSecureStorage(
            iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
          );

  static const _key = 'evcar.auth.tokens.v1';

  final FlutterSecureStorage _storage;
  bool _loaded = false;
  AuthTokens? _cached;

  @override
  Future<AuthTokens?> read() async {
    if (_loaded) return _cached;
    try {
      final raw = await _storage.read(key: _key);
      _cached = raw == null ? null : AuthTokens.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } on FormatException {
      // Corrupt entry: drop it rather than crash; the user signs in again.
      await _storage.delete(key: _key);
      _cached = null;
    } on TypeError {
      await _storage.delete(key: _key);
      _cached = null;
    }
    _loaded = true;
    return _cached;
  }

  @override
  Future<void> write(AuthTokens tokens) async {
    _cached = tokens;
    _loaded = true;
    await _storage.write(key: _key, value: jsonEncode(tokens.toJson()));
  }

  @override
  Future<void> clear() async {
    _cached = null;
    _loaded = true;
    await _storage.delete(key: _key);
  }
}

/// Non-persistent storage for tests and previews.
class InMemoryTokenStorage implements TokenStorage {
  InMemoryTokenStorage([this._tokens]);

  AuthTokens? _tokens;
  int writes = 0;
  int clears = 0;

  @override
  Future<AuthTokens?> read() async => _tokens;

  @override
  Future<void> write(AuthTokens tokens) async {
    writes++;
    _tokens = tokens;
  }

  @override
  Future<void> clear() async {
    clears++;
    _tokens = null;
  }
}
