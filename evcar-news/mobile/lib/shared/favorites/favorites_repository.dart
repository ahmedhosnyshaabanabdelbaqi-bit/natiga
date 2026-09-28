import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../app/di/providers.dart';
import '../../core/app_config/app_config_controller.dart';
import '../../core/app_config/features.dart';
import '../../core/settings/settings_controller.dart';
import '../../features/favorites/data/api_favorites_remote.dart';
import 'favorite_item.dart';

/// Why the server did not take a guest favorite during [FavoritesRemote.merge].
enum MergeSkipReason {
  /// The target no longer exists / is not public: dropped from the device.
  notFound,

  /// The account holds the maximum (1000): kept on the device only.
  limitReached,
}

/// Result of pushing device favorites to the account.
class FavoritesMergeResult {
  const FavoritesMergeResult({this.added = 0, this.alreadyPresent = 0, this.skipped = const {}});

  final int added;
  final int alreadyPresent;

  /// Keys the server refused, with the reason.
  final Map<FavoriteKey, MergeSkipReason> skipped;
}

/// Server side of favorites for signed-in users (`/me/favorites`).
///
/// Implemented by `ApiFavoritesRemote` (features/favorites) and provided by
/// [favoritesRemoteProvider] while the `favorites` feature flag is on.
abstract interface class FavoritesRemote {
  /// Every favorite of the signed-in user (newest first).
  Future<List<FavoriteItem>> fetchAll();

  /// Idempotent: adding an existing favorite is not an error.
  Future<void> add(FavoriteItem item);

  /// Idempotent: removing a missing favorite is not an error.
  Future<void> remove(FavoriteKey key);

  /// Pushes device-only (guest) favorites to the account in bulk
  /// (`POST /me/favorites/merge`); duplicates are ignored by the server.
  Future<FavoritesMergeResult> merge(List<FavoriteItem> items);
}

/// `null` = no server sync available (local only): the favorites feature is
/// switched off on the server, so nothing claims to sync.
final favoritesRemoteProvider = Provider<FavoritesRemote?>((ref) {
  final enabled = ref.watch(appConfigProvider.select((c) => c.isFeatureEnabled(Features.favorites)));
  if (!enabled) return null;
  return ApiFavoritesRemote(ref.watch(apiClientProvider));
});

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
