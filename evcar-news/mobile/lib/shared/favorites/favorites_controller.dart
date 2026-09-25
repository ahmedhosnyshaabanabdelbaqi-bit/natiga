import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/domain/auth_state.dart';
import '../../features/auth/presentation/auth_controller.dart';
import 'favorite_item.dart';
import 'favorites_repository.dart';

/// Favorites of this device / account.
@immutable
class FavoritesState {
  const FavoritesState({this.items = const {}, this.synced = false, this.syncing = false, this.syncError});

  /// By [FavoriteKey.storageKey].
  final Map<String, FavoriteItem> items;

  /// True when the list mirrors the signed-in account (server sync active).
  final bool synced;
  final bool syncing;

  /// Last sync failure (the local list is still shown).
  final Object? syncError;

  bool contains(FavoriteKey key) => items.containsKey(key.storageKey);

  /// Newest first, optionally of one type.
  List<FavoriteItem> list([FavoriteType? type]) {
    final out = [
      for (final i in items.values)
        if (type == null || i.key.type == type) i,
    ];
    out.sort((a, b) => (b.savedAt ?? DateTime(0)).compareTo(a.savedAt ?? DateTime(0)));
    return out;
  }

  FavoritesState copyWith({
    Map<String, FavoriteItem>? items,
    bool? synced,
    bool? syncing,
    Object? Function()? syncError,
  }) => FavoritesState(
    items: items ?? this.items,
    synced: synced ?? this.synced,
    syncing: syncing ?? this.syncing,
    syncError: syncError == null ? this.syncError : syncError(),
  );
}

/// Local for guests; synced with the account when signed in and a
/// [FavoritesRemote] is available:
///
/// * sign-in → favorites saved as a guest are added to the account, then the
///   account's list replaces the local one;
/// * toggle while signed in → optimistic, reverted (and rethrown) if the
///   server refuses or is unreachable;
/// * sign-out → the account's favorites are removed from this device
///   (privacy on shared phones); guest favorites never leave the device
///   unless the user signs in.
class FavoritesController extends Notifier<FavoritesState> {
  LocalFavoritesStore get _store => ref.read(localFavoritesStoreProvider);
  FavoritesRemote? get _remote => ref.read(favoritesRemoteProvider);

  @override
  FavoritesState build() {
    final store = ref.watch(localFavoritesStoreProvider);
    ref.watch(favoritesRemoteProvider);
    final auth = ref.read(authControllerProvider);
    var items = store.read();

    // Synced items of another account (or of a session that ended while the
    // app was closed) must not be shown.
    final userId = auth.user?.id;
    if (store.owner != null && store.owner != userId) {
      items = [
        for (final i in items)
          if (i.localOnly) i,
      ];
      unawaited(store.write(items));
      unawaited(store.setOwner(null));
    }

    ref.listen<AuthState>(authControllerProvider, (previous, next) {
      if (next is AuthSignedIn && previous is! AuthSignedIn) {
        unawaited(sync());
      } else if (next is AuthGuest && previous is AuthSignedIn) {
        unawaited(_forgetAccountItems());
      }
    });
    if (auth is AuthSignedIn && _remote != null) {
      Future.microtask(sync);
    }
    return FavoritesState(items: {for (final i in items) i.key.storageKey: i});
  }

  bool isFavorite(FavoriteKey key) => state.contains(key);

  /// Adds or removes [item]; returns whether it is a favorite afterwards.
  /// Throws the server error (after reverting) when sync fails.
  Future<bool> toggle(FavoriteItem item) async {
    final key = item.key.storageKey;
    final before = state.items;
    final removing = before.containsKey(key);
    final signedIn = ref.read(authControllerProvider) is AuthSignedIn;
    final remote = signedIn ? _remote : null;

    final next = Map<String, FavoriteItem>.of(before);
    if (removing) {
      next.remove(key);
    } else {
      next[key] = item.copyWith(localOnly: remote == null, savedAt: item.savedAt ?? DateTime.now().toUtc());
    }
    state = state.copyWith(items: next);
    await _persist();

    if (remote != null) {
      try {
        if (removing) {
          await remote.remove(item.key);
        } else {
          await remote.add(next[key]!);
        }
      } catch (_) {
        if (ref.mounted) {
          state = state.copyWith(items: before);
          await _persist();
        }
        rethrow;
      }
    }
    return !removing;
  }

  /// Pushes device-only favorites to the account, then mirrors the account.
  Future<void> sync() async {
    final remote = _remote;
    final auth = ref.read(authControllerProvider);
    if (remote == null || auth is! AuthSignedIn || state.syncing) return;
    state = state.copyWith(syncing: true, syncError: () => null);
    try {
      for (final item in state.items.values.where((i) => i.localOnly).toList()) {
        await remote.add(item);
      }
      final server = await remote.fetchAll();
      if (!ref.mounted) return;
      state = FavoritesState(
        items: {for (final i in server) i.key.storageKey: i.copyWith(localOnly: false)},
        synced: true,
      );
      await _store.setOwner(auth.user.id);
      await _persist();
    } catch (e) {
      if (ref.mounted) state = state.copyWith(syncing: false, syncError: () => e);
    }
  }

  Future<void> _forgetAccountItems() async {
    state = FavoritesState(
      items: {
        for (final e in state.items.entries)
          if (e.value.localOnly) e.key: e.value,
      },
    );
    await _store.setOwner(null);
    await _persist();
  }

  Future<void> _persist() => _store.write(state.items.values.toList());
}

final favoritesProvider = NotifierProvider<FavoritesController, FavoritesState>(FavoritesController.new);

/// Convenience: whether one target is a favorite (rebuilds only for it).
final isFavoriteProvider = Provider.family<bool, FavoriteKey>(
  (ref, key) => ref.watch(favoritesProvider.select((s) => s.contains(key))),
);
