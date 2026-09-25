import 'package:evcar_news/app/di/providers.dart';
import 'package:evcar_news/core/api/api_exception.dart';
import 'package:evcar_news/core/auth/auth_tokens.dart';
import 'package:evcar_news/core/auth/device_id_store.dart';
import 'package:evcar_news/core/auth/token_storage.dart';
import 'package:evcar_news/core/cache/json_cache.dart';
import 'package:evcar_news/core/settings/settings_controller.dart';
import 'package:evcar_news/features/auth/domain/auth_state.dart';
import 'package:evcar_news/features/auth/presentation/auth_controller.dart';
import 'package:evcar_news/shared/favorites/favorite_item.dart';
import 'package:evcar_news/shared/favorites/favorites_controller.dart';
import 'package:evcar_news/shared/favorites/favorites_repository.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/fake_http_adapter.dart';

FavoriteItem fav(String id, {FavoriteType type = FavoriteType.article}) =>
    FavoriteItem(key: FavoriteKey(type, id), title: 'Item $id', route: '/news/$id');

class FakeRemote implements FavoritesRemote {
  final server = <String, FavoriteItem>{};
  bool fail = false;
  int adds = 0;

  @override
  Future<void> add(FavoriteItem item) async {
    if (fail) throw const ApiException(kind: ApiErrorKind.network, code: 'NETWORK_ERROR');
    adds++;
    server[item.key.storageKey] = item;
  }

  @override
  Future<List<FavoriteItem>> fetchAll() async {
    if (fail) throw const ApiException(kind: ApiErrorKind.network, code: 'NETWORK_ERROR');
    return server.values.toList();
  }

  @override
  Future<void> remove(FavoriteKey key) async {
    if (fail) throw const ApiException(kind: ApiErrorKind.network, code: 'NETWORK_ERROR');
    server.remove(key.storageKey);
  }
}

Map<String, dynamic> userJson(String id) => {
  'id': id,
  'email': '$id@example.test',
  'displayName': id,
  'emailVerified': true,
  'locale': 'en',
  'roles': ['user'],
  'permissions': <String>[],
  'createdAt': '2026-01-01T00:00:00Z',
};

Future<ProviderContainer> containerWith({FavoritesRemote? remote, AuthTokens? tokens, String userId = 'u1'}) async {
  final sp = await SharedPreferences.getInstance();
  final http = FakeHttpAdapter()
    ..on('GET /me', (_) => FakeResponse.json(200, {'data': userJson(userId)}))
    ..on('POST /auth/logout', (_) => FakeResponse.empty(204))
    ..on('GET /app-config', (_) => FakeResponse.json(503, {}));
  final c = ProviderContainer(
    retry: (_, _) => null,
    overrides: [
      sharedPreferencesProvider.overrideWithValue(sp),
      favoritesRemoteProvider.overrideWithValue(remote),
      httpClientAdapterProvider.overrideWithValue(http),
      apiBaseUrlProvider.overrideWithValue('https://api.test/api/v1'),
      tokenStorageProvider.overrideWithValue(InMemoryTokenStorage(tokens)),
      jsonCacheProvider.overrideWithValue(MemoryJsonCache()),
      deviceIdStoreProvider.overrideWithValue(InMemoryDeviceIdStore('test-device-id-0123456789')),
    ],
  );
  addTearDown(c.dispose);
  return c;
}

Future<void> settle() => Future<void>.delayed(const Duration(milliseconds: 20));

/// Waits (max 2 s) until [condition] holds — auth restore and sync are async.
Future<void> until(bool Function() condition) async {
  for (var i = 0; i < 100 && !condition(); i++) {
    await settle();
  }
  expect(condition(), isTrue);
}

/// Lets the auth restore started by a container finish before it is
/// disposed (Riverpod refuses to use a disposed Ref).
Future<void> authSettled(ProviderContainer c) => until(() => c.read(authControllerProvider) is! AuthRestoring);

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('guest favorites are local and survive a restart', () async {
    final c = await containerWith();
    c.listen(favoritesProvider, (_, _) {});
    await authSettled(c);
    expect(c.read(authControllerProvider), isA<AuthGuest>());
    expect(await c.read(favoritesProvider.notifier).toggle(fav('a')), isTrue);
    expect(await c.read(favoritesProvider.notifier).toggle(fav('s1', type: FavoriteType.station)), isTrue);
    expect(c.read(isFavoriteProvider(const FavoriteKey(FavoriteType.article, 'a'))), isTrue);

    final restarted = await containerWith();
    final state = restarted.read(favoritesProvider);
    await authSettled(restarted);
    expect(state.list().map((i) => i.key.id).toSet(), {'a', 's1'});
    expect(state.list(FavoriteType.station).single.localOnly, isTrue);
    expect(state.synced, isFalse);

    expect(await restarted.read(favoritesProvider.notifier).toggle(fav('a')), isFalse);
    expect(restarted.read(favoritesProvider).contains(const FavoriteKey(FavoriteType.article, 'a')), isFalse);
  });

  test('signing in pushes guest favorites to the account and mirrors it; sign-out forgets account items', () async {
    final remote = FakeRemote()..server['article:server'] = fav('server').copyWith(localOnly: false);
    final c = await containerWith(remote: remote);
    c.listen(favoritesProvider, (_, _) {});
    await authSettled(c);
    await c.read(favoritesProvider.notifier).toggle(fav('guest'));
    expect(remote.adds, 0, reason: 'guests never sync');

    // Sign in (tokens + /me).
    await c.read(tokenStorageProvider).write(const AuthTokens(accessToken: 'a', refreshToken: 'r'));
    c.invalidate(authControllerProvider);
    c.read(authControllerProvider);
    await until(() => c.read(authControllerProvider) is AuthSignedIn);
    await until(() => c.read(favoritesProvider).synced);
    final state = c.read(favoritesProvider);
    expect(state.synced, isTrue);
    expect(state.list().map((i) => i.key.id).toSet(), {'guest', 'server'});
    expect(state.list().every((i) => !i.localOnly), isTrue);
    expect(remote.server.keys, containsAll(['article:guest', 'article:server']));

    await c.read(authControllerProvider.notifier).logout();
    await settle();
    expect(c.read(favoritesProvider).items, isEmpty, reason: 'account favorites are not left on a shared device');
  });

  test('a failed server update is reverted and reported', () async {
    final remote = FakeRemote();
    final c = await containerWith(
      remote: remote,
      tokens: const AuthTokens(accessToken: 'a', refreshToken: 'r'),
    );
    c.listen(favoritesProvider, (_, _) {});
    await until(() => c.read(authControllerProvider) is AuthSignedIn);
    await until(() => c.read(favoritesProvider).synced);

    remote.fail = true;
    await expectLater(c.read(favoritesProvider.notifier).toggle(fav('x')), throwsA(isA<ApiException>()));
    expect(c.read(favoritesProvider).contains(const FavoriteKey(FavoriteType.article, 'x')), isFalse);
  });

  test("another account's synced favorites are dropped at start-up", () async {
    SharedPreferences.setMockInitialValues({
      LocalFavoritesStore.ownerKey: 'someone-else',
      LocalFavoritesStore.storageKey: '[{"type":"article","id":"theirs","title":"T","localOnly":false},{"type":"model","id":"mine","title":"M","localOnly":true}]',
    });
    final c = await containerWith();
    expect(c.read(favoritesProvider).list().map((i) => i.key.id), ['mine']);
    await authSettled(c);
  });

  test('malformed stored favorites are ignored', () async {
    SharedPreferences.setMockInitialValues({
      LocalFavoritesStore.storageKey: '[{"type":"unknown","id":"x","title":"T"},{"type":"tour","id":"","title":"T"},3]',
    });
    final c = await containerWith();
    expect(c.read(favoritesProvider).items, isEmpty);
    await authSettled(c);
  });
}
