import 'dart:io';
import 'dart:typed_data';

import 'package:evcar_news/app/di/providers.dart';
import 'package:evcar_news/core/auth/device_id_store.dart';
import 'package:evcar_news/core/auth/token_storage.dart';
import 'package:evcar_news/core/cache/cache_database.dart';
import 'package:evcar_news/core/cache/json_cache.dart';
import 'package:evcar_news/core/cache/saved_items_store.dart';
import 'package:evcar_news/core/connectivity/connectivity_service.dart';
import 'package:evcar_news/core/settings/settings_controller.dart';
import 'package:evcar_news/features/news/application/news_providers.dart';
import 'package:evcar_news/features/news/data/offline_image_store.dart';
import 'package:evcar_news/features/news/data/saved_articles_repository.dart';
import 'package:evcar_news/features/news/domain/article.dart';
import 'package:evcar_news/features/news/domain/news_query.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import '../../helpers/fake_http_adapter.dart';
import 'news_fixtures.dart';

final _png = Uint8List.fromList([0x89, 0x50, 0x4E, 0x47, 1, 2, 3, 4]);

void main() {
  sqfliteFfiInit();

  group('SavedArticlesRepository (SQLite + files)', () {
    late CacheDatabase db;
    late Directory dir;
    var now = DateTime.utc(2026, 9, 25, 9);
    final downloads = <String>[];

    setUp(() async {
      now = DateTime.utc(2026, 9, 25, 9);
      downloads.clear();
      db = await CacheDatabase.open(factory: databaseFactoryFfi, path: inMemoryDatabasePath);
      dir = await Directory.systemTemp.createTemp('news_offline_test');
    });

    tearDown(() async {
      await db.close();
      if (dir.existsSync()) await dir.delete(recursive: true);
    });

    SavedArticlesRepository repo({Set<String> failing = const {}}) => SavedArticlesRepository(
      store: SqfliteSavedItemsStore(db, clock: () => now),
      images: FileOfflineImageStore(
        directory: dir,
        download: (url) async {
          downloads.add(url);
          if (failing.contains(url)) throw const SocketException('down');
          return _png;
        },
      ),
    );

    test('saves full JSON + images and loads them back with savedAt', () async {
      final r = repo();
      final article = ArticleDetail.fromData(detailJson());
      final saved = await r.save(article, lang: 'en');
      expect(saved.savedAt, now);
      expect(saved.imageUrls, hasLength(2));
      expect(saved.allImagesSaved, isTrue);
      expect(dir.listSync().whereType<File>(), hasLength(2));

      // A fresh repository (app restart) reads the same copy.
      final list = await repo().list();
      expect(list, hasLength(1));
      expect(list.single.savedAt, DateTime.utc(2026, 9, 25, 9));
      expect(list.single.article.toJson(), article.toJson());

      final found = await repo().find('test-article', lang: 'ar');
      expect(found?.article.id, article.id, reason: 'another language copy is still returned');
      final images = await repo().localImages(found!);
      expect(
        images.keys,
        containsAll(<String>['https://media.test/a/w1600.webp', 'https://media.test/body/w960.webp']),
      );
      expect(images.values.first, isA<FileImage>());
    });

    test('image failures keep the article saved and are reported', () async {
      final r = repo(failing: {'https://media.test/body/w960.webp'});
      final saved = await r.save(ArticleDetail.fromData(detailJson()), lang: 'en');
      expect(saved.imageUrls, ['https://media.test/a/w1600.webp']);
      expect(saved.imagesExpected, 2);
      expect(saved.allImagesSaved, isFalse);
      expect((await r.list()).single.allImagesSaved, isFalse);
    });

    test('newest first; remove deletes JSON and images no other article uses', () async {
      final r = repo();
      await r.save(ArticleDetail.fromData(detailJson()), lang: 'en');
      now = now.add(const Duration(hours: 1));
      await r.save(
        ArticleDetail.fromData(detailJson(id: 'other-id', slug: 'other', title: 'Other test')),
        lang: 'en',
      );
      expect((await r.list()).map((s) => s.article.slug), ['other', 'test-article']);

      // Both articles share the same image URLs in the fixture: removing one keeps the files.
      await r.remove('other-id');
      expect(dir.listSync().whereType<File>(), hasLength(2));
      await r.remove('11111111-1111-4111-8111-111111111111');
      expect(await r.list(), isEmpty);
      expect(dir.listSync().whereType<File>(), isEmpty);
    });

    test('non-https image URLs are never downloaded', () async {
      final store = FileOfflineImageStore(directory: dir, download: (url) async => _png);
      expect(await store.save('ftp://media.test/a.webp'), isFalse);
      expect(await store.save('javascript:alert(1)'), isFalse);
    });
  });

  group('articleViewProvider / feed offline behaviour', () {
    late FakeHttpAdapter http;
    late ProviderContainer container;
    late MemorySavedItemsStore saved;
    var online = true;

    setUp(() async {
      online = true;
      SharedPreferences.setMockInitialValues({'settings.language': 'en'});
      final prefs = await SharedPreferences.getInstance();
      http = FakeHttpAdapter();
      http.on('GET /articles/test-article', (_) {
        if (!online) throw const FakeNetworkError();
        return FakeResponse.json(200, {'data': detailJson()});
      });
      http.on('GET /articles', (req) {
        if (!online) throw const FakeNetworkError();
        final page = req.queryParameters['page'];
        return FakeResponse.json(
          200,
          page == 2
              ? pageJson([summaryJson(id: 'p2', slug: 'page-two')], page: 2, totalPages: 2)
              : pageJson([summaryJson(), summaryJson()], totalPages: 2),
        );
      });
      saved = MemorySavedItemsStore();
      container = ProviderContainer(
        retry: (_, _) => null,
        overrides: [
          sharedPreferencesProvider.overrideWithValue(prefs),
          httpClientAdapterProvider.overrideWithValue(http),
          apiBaseUrlProvider.overrideWithValue('https://api.test/api/v1'),
          jsonCacheProvider.overrideWithValue(MemoryJsonCache()),
          savedItemsStoreProvider.overrideWithValue(saved),
          offlineImageDownloaderProvider.overrideWithValue((url) async => _png),
          deviceLocalesProvider.overrideWithValue(const [Locale('en')]),
          tokenStorageProvider.overrideWithValue(InMemoryTokenStorage()),
          deviceIdStoreProvider.overrideWithValue(InMemoryDeviceIdStore('test-device')),
          connectivityServiceProvider.overrideWithValue(FakeConnectivityService(online: true)),
        ],
      );
      addTearDown(container.dispose);
    });

    test('online → live; offline with a saved copy → the saved copy with its images', () async {
      final sub = container.listen(articleViewProvider('test-article'), (_, _) {});
      final live = await container.read(articleViewProvider('test-article').future);
      expect(live.origin, ArticleOrigin.live);
      expect(http.requestsTo('GET /articles/test-article').single.headers['Accept-Language'], 'en');

      await container.read(savedArticlesProvider.notifier).save(live.article);
      expect(container.read(isArticleSavedProvider(live.article.id)), isTrue);
      sub.close();

      online = false;
      container.invalidate(articleViewProvider('test-article'));
      final offline = await container.read(articleViewProvider('test-article').future);
      // The automatic cache is older than the explicit save → saved copy wins.
      expect(offline.origin, ArticleOrigin.saved);
      expect(offline.savedAt, isNotNull);
      expect(offline.isOfflineCopy, isTrue);
      expect(offline.localImages.keys, contains('https://media.test/a/w1600.webp'));
      expect(offline.article.title, 'Test article title');
    });

    test('a saved copy is refreshed when the live article changed (e.g. a correction)', () async {
      final sub = container.listen(articleViewProvider('test-article'), (_, _) {});
      final live = await container.read(articleViewProvider('test-article').future);
      await container.read(savedArticlesProvider.notifier).save(live.article);
      sub.close();

      http.on(
        'GET /articles/test-article',
        (_) => FakeResponse.json(200, {
          'data': detailJson(
            updatedAt: '2026-09-25T15:00:00.000Z',
            corrections: [
              {'id': 'c9', 'kind': 'correction', 'note': 'Test correction', 'correctedAt': '2026-09-25T15:00:00Z'},
            ],
          ),
        }),
      );
      container.invalidate(articleViewProvider('test-article'));
      final sub2 = container.listen(articleViewProvider('test-article'), (_, _) {});
      await container.read(articleViewProvider('test-article').future);
      for (var i = 0; i < 20; i++) {
        await Future<void>.delayed(Duration.zero);
      }
      final savedCopy = container.read(savedArticlesProvider).value!.single;
      expect(savedCopy.article.corrections.single.note, 'Test correction');
      sub2.close();
    });

    test('offline without any copy → connectivity error', () async {
      online = false;
      await expectLater(container.read(articleViewProvider('test-article').future), throwsA(anything));
    });

    test('feed: pagination appends and dedupes; offline serves the cached first page', () async {
      const q = NewsQuery();
      final sub = container.listen(newsFeedProvider(q), (_, _) {});
      final first = await container.read(newsFeedProvider(q).future);
      expect(first.items, hasLength(1), reason: 'duplicate ids are dropped');
      expect(first.hasMore, isTrue);
      await container.read(newsFeedProvider(q).notifier).loadMore();
      final next = container.read(newsFeedProvider(q)).value!;
      expect(next.items.map((a) => a.slug), ['test-article', 'page-two']);
      expect(next.hasMore, isFalse);

      online = false;
      container.invalidate(newsFeedProvider(q));
      final cached = await container.read(newsFeedProvider(q).future);
      expect(cached.fromCache, isTrue);
      expect(cached.hasMore, isFalse, reason: 'an offline copy cannot be continued');
      expect(cached.items.single.slug, 'test-article');
      sub.close();
    });

    test('load-more failure is kept inline and retry works', () async {
      const q = NewsQuery(type: 'review');
      final sub = container.listen(newsFeedProvider(q), (_, _) {});
      await container.read(newsFeedProvider(q).future);
      online = false;
      await container.read(newsFeedProvider(q).notifier).loadMore();
      var s = container.read(newsFeedProvider(q)).value!;
      expect(s.loadMoreError, isNotNull);
      expect(s.items, hasLength(1));
      online = true;
      await container.read(newsFeedProvider(q).notifier).loadMore();
      s = container.read(newsFeedProvider(q)).value!;
      expect(s.loadMoreError, isNull);
      expect(s.items, hasLength(2));
      expect(http.requestsTo('GET /articles').first.queryParameters['type'], 'review');
      sub.close();
    });
  });
}
