import 'package:evcar_news/core/api/api_exception.dart';
import 'package:evcar_news/core/cache/cache_database.dart';
import 'package:evcar_news/core/cache/cached_fetch.dart';
import 'package:evcar_news/core/cache/json_cache.dart';
import 'package:evcar_news/core/cache/saved_items_store.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  sqfliteFfiInit();

  var now = DateTime.utc(2026, 9, 25, 12);
  DateTime clock() => now;

  late CacheDatabase db;

  setUp(() async {
    now = DateTime.utc(2026, 9, 25, 12);
    db = await CacheDatabase.open(factory: databaseFactoryFfi, path: inMemoryDatabasePath);
  });

  tearDown(() => db.close());

  group('SqfliteJsonCache', () {
    test('put/get keeps JSON types and the saved timestamp', () async {
      final cache = SqfliteJsonCache(db, clock: clock);
      await cache.put('k', {
        'a': 1,
        'b': [true, null, 'x'],
        'c': 1.5,
      }, etag: 'W/"1"');
      final got = await cache.get('k');
      expect(got!.data, {
        'a': 1,
        'b': [true, null, 'x'],
        'c': 1.5,
      });
      expect(got.savedAt, now);
      expect(got.etag, 'W/"1"');
      expect(got.ageAt(now.add(const Duration(hours: 2))), const Duration(hours: 2));
    });

    test('put replaces, remove deletes, clear empties', () async {
      final cache = SqfliteJsonCache(db, clock: clock);
      await cache.put('k', 1);
      await cache.put('k', 2);
      expect((await cache.get('k'))!.data, 2);
      await cache.remove('k');
      expect(await cache.get('k'), isNull);
      await cache.put('a', 1);
      await cache.put('b', 2);
      await cache.clear();
      expect(await cache.get('a'), isNull);
      expect(await cache.get('b'), isNull);
    });

    test('purgeOlderThan removes only old entries', () async {
      final cache = SqfliteJsonCache(db, clock: clock);
      await cache.put('old', 1);
      now = now.add(const Duration(days: 10));
      await cache.put('new', 2);
      expect(await cache.purgeOlderThan(const Duration(days: 7)), 1);
      expect(await cache.get('old'), isNull);
      expect(await cache.get('new'), isNotNull);
    });

    test('keys include language and market', () {
      expect(JsonCache.key('/articles', lang: 'ar', market: 'EG'), '/articles|lang=ar|market=EG');
      expect(JsonCache.key('/articles', lang: 'en'), '/articles|lang=en');
      expect(JsonCache.key('/x', lang: 'en', variant: 'page=2'), '/x|lang=en|page=2');
    });
  });

  group('SqfliteSavedItemsStore', () {
    test('save, get, contains, list newest first, delete, clear', () async {
      final store = SqfliteSavedItemsStore(db, clock: clock);
      await store.save(type: SavedItemType.article, id: 'a1', lang: 'ar', title: 'خبر', data: {'slug': 'a1'});
      now = now.add(const Duration(minutes: 5));
      await store.save(
        type: SavedItemType.carSpecs,
        id: 'v1',
        lang: 'en',
        market: 'EG',
        title: 'Specs',
        data: {
          'range': {'value': 450, 'cycle': 'WLTP'},
        },
      );

      final a = await store.get(SavedItemType.article, 'a1', lang: 'ar');
      expect(a!.title, 'خبر');
      expect(a.savedAt, DateTime.utc(2026, 9, 25, 12));
      expect(await store.contains(SavedItemType.carSpecs, 'v1', lang: 'en', market: 'EG'), isTrue);
      expect(await store.contains(SavedItemType.carSpecs, 'v1', lang: 'en', market: 'SA'), isFalse);

      final all = await store.list();
      expect(all.map((i) => i.id), ['v1', 'a1']);
      expect((await store.list(type: SavedItemType.article)).single.id, 'a1');
      expect(all.first.data['range'], {'value': 450, 'cycle': 'WLTP'});

      await store.delete(SavedItemType.article, 'a1', lang: 'ar');
      expect(await store.get(SavedItemType.article, 'a1', lang: 'ar'), isNull);
      await store.clear();
      expect(await store.list(), isEmpty);
    });

    test('clearing the JSON cache keeps saved items', () async {
      final store = SqfliteSavedItemsStore(db, clock: clock);
      final cache = SqfliteJsonCache(db, clock: clock);
      await store.save(type: SavedItemType.article, id: 'a1', lang: 'ar', title: 't', data: {});
      await cache.put('x', 1);
      await cache.clear();
      expect(await store.list(), hasLength(1));
    });
  });

  test('memory implementations behave like the SQLite ones', () async {
    final cache = MemoryJsonCache(clock: clock);
    await cache.put('k', {'a': 1});
    expect((await cache.get('k'))!.data, {'a': 1});
    now = now.add(const Duration(days: 2));
    expect(await cache.purgeOlderThan(const Duration(days: 1)), 1);

    final store = MemorySavedItemsStore(clock: clock);
    await store.save(type: 'article', id: '1', lang: 'ar', title: 't', data: {'x': 1});
    expect(await store.contains('article', '1', lang: 'ar'), isTrue);
  });

  group('fetchWithCache', () {
    test('network success returns fresh data and caches it', () async {
      final cache = MemoryJsonCache(clock: clock);
      final r = await fetchWithCache<int>(
        cache: cache,
        key: 'k',
        fetch: () async => {'n': 1},
        parse: (j) => (j as Map)['n'] as int,
        clock: clock,
      );
      expect(r.data, 1);
      expect(r.fromCache, isFalse);
      expect((await cache.get('k'))!.data, {'n': 1});
    });

    test('offline falls back to the cached copy with its saved time', () async {
      final cache = MemoryJsonCache(clock: clock);
      await cache.put('k', {'n': 7});
      now = now.add(const Duration(hours: 3));
      final r = await fetchWithCache<int>(
        cache: cache,
        key: 'k',
        fetch: () async => throw const ApiException(kind: ApiErrorKind.network, code: 'NETWORK_ERROR'),
        parse: (j) => (j as Map)['n'] as int,
        clock: clock,
      );
      expect(r.data, 7);
      expect(r.fromCache, isTrue);
      expect(r.savedAt, DateTime.utc(2026, 9, 25, 12));
    });

    test('non-connectivity errors are not hidden by the cache', () async {
      final cache = MemoryJsonCache(clock: clock);
      await cache.put('k', {'n': 7});
      await expectLater(
        fetchWithCache<int>(
          cache: cache,
          key: 'k',
          fetch: () async => throw const ApiException(kind: ApiErrorKind.notFound, code: 'NOT_FOUND', statusCode: 404),
          parse: (j) => (j as Map)['n'] as int,
        ),
        throwsA(isA<ApiException>()),
      );
    });

    test('too-old cache (maxStale) is not used; no cache rethrows', () async {
      final cache = MemoryJsonCache(clock: clock);
      await cache.put('k', {'n': 7});
      now = now.add(const Duration(days: 3));
      Future<CachedResult<int>> run(String key) => fetchWithCache<int>(
        cache: cache,
        key: key,
        fetch: () async => throw const ApiException(kind: ApiErrorKind.timeout, code: 'TIMEOUT'),
        parse: (j) => (j as Map)['n'] as int,
        maxStale: const Duration(days: 1),
        clock: clock,
      );
      await expectLater(run('k'), throwsA(isA<ApiException>()));
      await expectLater(run('missing'), throwsA(isA<ApiException>()));
    });

    test('a malformed response does not overwrite a good cached copy', () async {
      final cache = MemoryJsonCache(clock: clock);
      await cache.put('k', {'n': 7});
      await expectLater(
        fetchWithCache<int>(
          cache: cache,
          key: 'k',
          fetch: () async => {'n': 'not a number'},
          parse: (j) => (j as Map)['n'] as int,
        ),
        throwsA(isA<TypeError>()),
      );
      expect((await cache.get('k'))!.data, {'n': 7});
    });
  });
}
