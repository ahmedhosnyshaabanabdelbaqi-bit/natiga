import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/settings/settings_controller.dart';
import 'favorite_item.dart';

/// Server side of favorites for signed-in users (`/me/favorites`).
///
/// OWNED BY THE FAVORITES FEATURE: implement it against the real backend
/// contract (e.g. `ApiFavoritesRemote` using `apiClientProvider`) and return
/// it from [favoritesRemoteProvider]. Until then favorites stay on the device
/// for everyone (honest: nothing claims to sync).
abstract interface class FavoritesRemote {
  /// Every favorite of the signed-in user (newest first).
  Future<List<FavoriteItem>> fetchAll();

  /// Idempotent: adding an existing favorite is not an error.
  Future<void> add(FavoriteItem item);

  /// Idempotent: removing a missing favorite is not an error.
  Future<void> remove(FavoriteKey key);
}

/// `null` = no server sync available (local only).
final favoritesRemoteProvider = Provider<FavoritesRemote?>((ref) => null);

/// Device storage of favorites (SharedPreferences JSON; small lists only).
class LocalFavoritesStore {
  LocalFavoritesStore(this._prefs);

  static const storageKey = 'favorites.v1';
  static const ownerKey = 'favorites.owner.v1';

  final SharedPreferences _prefs;

  List<FavoriteItem> read() {
    final raw = _prefs.getString(storageKey);
    if (raw == null) return const [];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return const [];
      return [for (final e in decoded) ?FavoriteItem.tryFromJson(e)];
    } on FormatException {
      return const [];
    }
  }

  Future<void> write(List<FavoriteItem> items) =>
      _prefs.setString(storageKey, jsonEncode([for (final i in items) i.toJson()]));

  /// User id the synced (non-local) items belong to.
  String? get owner => _prefs.getString(ownerKey);

  Future<void> setOwner(String? userId) =>
      userId == null ? _prefs.remove(ownerKey) : _prefs.setString(ownerKey, userId);
}

final localFavoritesStoreProvider = Provider<LocalFavoritesStore>(
  (ref) => LocalFavoritesStore(ref.watch(sharedPreferencesProvider)),
);
