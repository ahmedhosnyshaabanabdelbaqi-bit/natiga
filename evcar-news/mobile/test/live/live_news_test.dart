// Contract check of the news data layer against a REAL running backend.
//
// Skipped unless EVCAR_LIVE_API is set, so `flutter test` stays hermetic:
//
//   EVCAR_LIVE_API=http://localhost:3000/api/v1 flutter test test/live/live_news_test.dart
//
// Read-only except one anonymous view count (POST /articles/:slug/view).
// Needs at least one published article (e.g. `npm run db:seed:demo`).
import 'dart:io';

import 'package:evcar_news/core/api/api_client.dart';
import 'package:evcar_news/core/api/api_exception.dart';
import 'package:evcar_news/core/api/dio_factory.dart';
import 'package:evcar_news/core/api/interceptors/request_headers_interceptor.dart';
import 'package:evcar_news/core/cache/json_cache.dart';
import 'package:evcar_news/features/news/data/news_repository.dart';
import 'package:evcar_news/features/news/domain/news_query.dart';
import 'package:flutter_test/flutter_test.dart';

final _base = Platform.environment['EVCAR_LIVE_API'];

NewsRepository _repo(String lang) {
  final factory = DioFactory(
    baseUrl: _base!,
    locale: () => RequestLocale(languageCode: lang, marketCode: 'EG'),
    appVersion: () => 'live-test',
  );
  return NewsRepository(
    api: ApiClient(factory.createBare()),
    cache: MemoryJsonCache(),
    locale: () => RequestLocale(languageCode: lang, marketCode: 'EG'),
  );
}

void main() {
  final skip = _base == null ? 'EVCAR_LIVE_API not set' : null;

  for (final lang in ['ar', 'en']) {
    test('list → detail → categories parse against the live API ($lang)', () async {
      final repo = _repo(lang);
      final page = await repo.feedPage(const NewsQuery());
      expect(page.fromCache, isFalse);
      expect(page.data.items, isNotEmpty, reason: 'seed at least one published article');
      final first = page.data.items.first;
      expect(first.requestedLanguage, lang);
      expect(first.shareUrl, startsWith('https://'));

      final detail = await repo.article(first.slug);
      expect(detail.data.id, first.id);
      expect(detail.data.bodyHtml, isNotEmpty);
      // Round trip used for offline saving keeps every field.
      expect(detail.data.toJson()['slug'], first.slug);

      final categories = await repo.categories();
      expect(categories.data, isNotEmpty);

      final strict = await repo.feedPage(const NewsQuery(onlyMyLanguage: true, sort: NewsSort.popular));
      expect(strict.data.items.every((a) => a.language == lang), isTrue);

      await repo.recordView(first.slug);
    }, skip: skip);
  }

  test('unknown slug → 404 ApiException; unknown category → empty page', () async {
    final repo = _repo('en');
    await expectLater(
      repo.article('no-such-article-${DateTime.now().millisecondsSinceEpoch}'),
      throwsA(isA<ApiException>().having((e) => e.kind, 'kind', ApiErrorKind.notFound)),
    );
    final empty = await repo.feedPage(const NewsQuery(category: 'no-such-category'));
    expect(empty.data.items, isEmpty);
  }, skip: skip);
}
