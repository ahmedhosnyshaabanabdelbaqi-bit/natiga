import 'dart:async';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/di/providers.dart';
import '../../../core/api/api_exception.dart';
import '../../../core/auth/session_events.dart';
import '../../../core/json/json_readers.dart';
import '../../account/data/account_repository.dart';
import '../data/auth_repository.dart';
import '../domain/app_user.dart';
import '../domain/auth_state.dart';

/// Owns the session: restore at startup, sign in/out, profile updates,
/// account deletion, and reacting to server-side session expiry.
class AuthController extends Notifier<AuthState> {
  /// Saved profile for offline startup (not secret; tokens live in secure
  /// storage).
  static const userCacheKey = 'auth.user';

  AuthRepository get _auth => ref.read(authRepositoryProvider);
  AccountRepository get _account => ref.read(accountRepositoryProvider);

  @override
  AuthState build() {
    final sub = ref.watch(sessionEventsProvider).stream.listen((event) {
      if (event == SessionEvent.expired) unawaited(_onSessionExpired());
    });
    ref.onDispose(sub.cancel);
    Timer.run(() => unawaited(restore()));
    return const AuthRestoring();
  }

  /// Validates stored tokens with `GET /me`. Safe to call again (retry).
  Future<void> restore() async {
    final tokens = await ref.read(tokenStorageProvider).read();
    if (!ref.mounted) return;
    if (tokens == null) {
      state = const AuthGuest();
      return;
    }
    try {
      final user = await _account.me();
      await _cacheUser(user);
      if (ref.mounted) state = AuthSignedIn(user);
    } on ApiException catch (e) {
      if (!ref.mounted) return;
      if (e.kind == ApiErrorKind.unauthorized || e.kind == ApiErrorKind.forbidden) {
        await ref.read(tokenStorageProvider).clear();
        await ref.read(jsonCacheProvider).remove(userCacheKey);
        if (ref.mounted) state = const AuthGuest();
        return;
      }
      final cached = await _cachedUser();
      if (!ref.mounted) return;
      state = cached != null ? AuthSignedIn(cached, offline: true) : AuthRestoring(error: e);
    }
  }

  /// Signs in and stores the tokens. Throws [ApiException] (e.g. 401 with a
  /// localized message for wrong credentials, 422 with field errors).
  Future<AppUser> login({required String email, required String password}) async {
    final result = await _auth.login(email: email.trim(), password: password, deviceName: _deviceName());
    await ref.read(tokenStorageProvider).write(result.tokens);
    await _cacheUser(result.user);
    if (ref.mounted) state = AuthSignedIn(result.user);
    return result.user;
  }

  /// Signs out locally even if the server call fails (offline logout).
  Future<void> logout() async {
    final refresher = ref.read(tokenRefresherProvider);
    // A refresh that is still running could otherwise store new tokens
    // after we cleared them.
    await refresher.idle;
    final storage = ref.read(tokenStorageProvider);
    final tokens = await storage.read();
    try {
      await _auth.logout(tokens?.refreshToken);
    } on ApiException {
      // Best effort: the local session ends regardless.
    }
    await storage.clear();
    await ref.read(jsonCacheProvider).remove(userCacheKey);
    if (ref.mounted) state = const AuthGuest();
  }

  /// Re-reads the profile (e.g. after verifying the email).
  Future<void> refreshUser() async {
    if (!state.isSignedIn) return;
    final user = await _account.me();
    await _cacheUser(user);
    if (ref.mounted) state = AuthSignedIn(user);
  }

  Future<void> updateProfile({String? displayName, String? locale}) async {
    final user = await _account.updateMe(displayName: displayName, locale: locale);
    await _cacheUser(user);
    if (ref.mounted) state = AuthSignedIn(user);
  }

  /// Deletes the account on the server, then all local session data.
  Future<void> deleteAccount(String password) async {
    await _account.deleteAccount(password);
    await ref.read(tokenStorageProvider).clear();
    await ref.read(jsonCacheProvider).remove(userCacheKey);
    if (ref.mounted) state = const AuthGuest();
  }

  /// Clears the one-time "session expired" flag after it was shown.
  void acknowledgeSessionExpired() {
    final s = state;
    if (s is AuthGuest && s.sessionExpired) state = const AuthGuest();
  }

  Future<void> _onSessionExpired() async {
    await ref.read(jsonCacheProvider).remove(userCacheKey);
    if (!ref.mounted) return;
    // Only notify when a session was actually active.
    state = state.isSignedIn ? const AuthGuest(sessionExpired: true) : const AuthGuest();
  }

  Future<void> _cacheUser(AppUser user) => ref.read(jsonCacheProvider).put(userCacheKey, user.toJson());

  Future<AppUser?> _cachedUser() async {
    final entry = await ref.read(jsonCacheProvider).get(userCacheKey);
    if (entry == null) return null;
    try {
      return AppUser.fromJson(asJsonObject(entry.data));
    } on FormatException {
      return null;
    }
  }

  static String _deviceName() {
    try {
      if (Platform.isAndroid) return 'EV Car News · Android';
      if (Platform.isIOS) return 'EV Car News · iOS';
    } on UnsupportedError {
      // Platform is unavailable on web; the app does not target web.
    }
    return 'EV Car News';
  }
}

final authControllerProvider = NotifierProvider<AuthController, AuthState>(AuthController.new);
