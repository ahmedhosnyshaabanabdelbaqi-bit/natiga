import 'dart:convert';

import 'package:evcar_news/features/news/application/reader_settings.dart';
import 'package:evcar_news/features/news/data/news_repository.dart';
import 'package:evcar_news/features/news/data/offline_image_store.dart';
import 'package:evcar_news/features/news/data/saved_articles_repository.dart';
import 'package:evcar_news/features/news/domain/article.dart';
import 'package:evcar_news/features/news/domain/news_query.dart';
import 'package:evcar_news/features/news/presentation/article_detail_screen.dart' show articleShareUrl;
import 'package:evcar_news/features/news/presentation/widgets/news_links.dart';
import 'package:flutter_test/flutter_test.dart';

import 'news_fixtures.dart';

void main() {
  group('ArticleSummary.tryParse', () {
    test('parses the full contract shape', () {
      final a = ArticleSummary.tryParse(summaryJson(coverImage: coverJson(), eventDate: '2026-09-20'))!;
      expect(a.slug, 'test-article');
      expect(a.category?.name, 'Charging');
      expect(a.tags.single.slug, 'fast-charging');
      expect(a.coverImage?.credit, 'Test Photographer');
      expect(a.coverImage?.variants, hasLength(3));
      expect(a.authorName, 'Test Author');
      expect(a.publishedAt, DateTime.utc(2026, 9, 24, 10));
      expect(a.eventDate, DateTime(2026, 9, 20, 12));
      expect(a.readingMinutes, 4);
      expect(a.shareUrl, 'https://evcar.news/n/test-article');
    });

    test('missing optional fields stay null / empty — never 0 or invented', () {
      final a = ArticleSummary.tryParse({'slug': 's', 'title': 'T'})!;
      expect(a.id, 's');
      expect(a.summary, isNull);
      expect(a.category, isNull);
      expect(a.tags, isEmpty);
      expect(a.coverImage, isNull);
      expect(a.authorName, isNull);
      expect(a.publishedAt, isNull);
      expect(a.eventDate, isNull);
      expect(a.readingMinutes, isNull);
      expect(a.isSponsored, isFalse);
      expect(a.isDemo, isFalse);
      expect(a.shareUrl, isNull);
    });

    test('wrong types and junk values are ignored, not crashing', () {
      final a = ArticleSummary.tryParse({
        'slug': 'x',
        'title': 'T',
        'readingMinutes': 0,
        'category': 'not-an-object',
        'tags': [
          {'slug': 'ok', 'name': 'Ok'},
          {'slug': ''},
          42,
        ],
        'coverImage': {'url': '  '},
        'author': {'name': ''},
        'eventDate': '20-09-2026',
        'publishedAt': 'yesterday',
        'isDemo': 'true',
      })!;
      expect(a.readingMinutes, isNull, reason: '0 minutes means unknown, not "0 min read"');
      expect(a.category, isNull);
      expect(a.tags.map((t) => t.slug), ['ok']);
      expect(a.coverImage, isNull);
      expect(a.authorName, isNull);
      expect(a.eventDate, isNull);
      expect(a.publishedAt, isNull);
      expect(a.isDemo, isTrue);
    });

    test('requires slug and title', () {
      expect(ArticleSummary.tryParse({'title': 'T'}), isNull);
      expect(ArticleSummary.tryParse({'slug': 's', 'title': '  '}), isNull);
      expect(ArticleSummary.tryParse('nope'), isNull);
    });
  });

  group('ArticleDetail', () {
    test('parses detail fields and survives a JSON round trip (offline copy)', () {
      final d = ArticleDetail.fromData(
        detailJson(
          corrections: [
            {
              'id': 'c1',
              'kind': 'update',
              'note': 'Test note',
              'noteLanguage': 'en',
              'correctedAt': '2026-09-25T08:00:00Z',
            },
            {'id': 'c2', 'kind': 'correction'}, // no note → skipped
          ],
        ),
      );
      expect(d.bodyHtml, contains('First paragraph'));
      expect(d.source?.attribution, 'Test attribution text');
      expect(d.corrections.single.kind, 'update');
      expect(d.relatedArticles.single.slug, 'related-one');
      expect(d.relatedVehicles.single.type, 'model');
      expect(d.relatedVehicles.single.modelYear, isNull);
      expect(d.marketMatch, isTrue);

      final again = ArticleDetail.fromData(jsonDecode(jsonEncode(d.toJson())));
      expect(again.toJson(), d.toJson());
      expect(again.eventDate, d.eventDate);
      expect(again.coverImage?.credit, 'Test Photographer');
    });

    test('minimal detail: defaults are safe', () {
      final d = ArticleDetail.fromData({'slug': 's', 'title': 'T'});
      expect(d.bodyHtml, '');
      expect(d.source, isNull);
      expect(d.corrections, isEmpty);
      expect(d.relatedArticles, isEmpty);
      expect(d.relatedVehicles, isEmpty);
      expect(d.marketMatch, isTrue);
      expect(d.allowComments, isFalse);
    });

    test('empty source object is dropped; unknown vehicle types skipped', () {
      final d = ArticleDetail.fromData({
        'slug': 's',
        'title': 'T',
        'source': {'name': null, 'url': null, 'attribution': null},
        'relatedVehicles': [
          {'type': 'boat', 'slug': 'b', 'name': 'B'},
        ],
      });
      expect(d.source, isNull);
      expect(d.relatedVehicles, isEmpty);
    });

    test('fromData throws FormatException without slug/title', () {
      expect(() => ArticleDetail.fromData({'id': 'x'}), throwsFormatException);
    });
  });

  test('parseNewsPage skips malformed items and reads meta', () {
    final page = parseNewsPage({
      'data': [
        summaryJson(),
        {'title': 'no slug'},
        'junk',
      ],
      'meta': {'page': 1, 'pageSize': 20, 'total': 45, 'totalPages': 3},
    });
    expect(page.items, hasLength(1));
    expect(page.hasMore, isTrue);
    expect(() => parseNewsPage({'data': 'x'}), throwsFormatException);
  });

  test('parseCategories sorts by sortOrder and skips invalid rows', () {
    final list = parseCategories({
      'data': [
        {'id': '2', 'slug': 'b', 'name': 'B', 'sortOrder': 2},
        {'id': '1', 'slug': 'a', 'name': 'A', 'sortOrder': 1, 'articleCount': 0},
        {'id': '3', 'name': 'no slug'},
      ],
    });
    expect(list.map((c) => c.slug), ['a', 'b']);
    expect(list.first.articleCount, 0, reason: 'a real 0 from the server is kept');
  });

  test('ArticleImage.urlFor picks the smallest sufficient variant', () {
    final img = ArticleImage.tryParse(coverJson())!;
    expect(img.urlFor(400), 'https://media.test/a/w480.webp');
    expect(img.urlFor(900), 'https://media.test/a/w960.webp');
    expect(img.urlFor(5000), 'https://media.test/a/w1600.webp');
    expect(img.aspectRatio, closeTo(16 / 9, 0.001));
  });

  test('parseCalendarDate', () {
    expect(parseCalendarDate('2026-02-03'), DateTime(2026, 2, 3, 12));
    expect(parseCalendarDate('2026-13-01'), isNull);
    expect(parseCalendarDate(null), isNull);
  });

  test('NewsQuery → query parameters', () {
    const q = NewsQuery(
      category: 'charging',
      type: 'review',
      sort: NewsSort.popular,
      allMarkets: true,
      onlyMyLanguage: true,
    );
    expect(q.toQueryParameters(page: 2, pageSize: 20), {
      'page': 2,
      'pageSize': 20,
      'category': 'charging',
      'type': 'review',
      'sort': 'popular',
      'allMarkets': 'true',
      'languageMode': 'strict',
    });
    expect(const NewsQuery().toQueryParameters(page: 1, pageSize: 20), {'page': 1, 'pageSize': 20});
    expect(q.activeFilterCount, 4);
    expect(q, q.copyWith());
    expect(q.copyWith(category: () => null).category, isNull);
  });

  group('links', () {
    test('video embeds map to public watch pages', () {
      final yt = parseVideoEmbed('https://www.youtube-nocookie.com/embed/abcDEF12345?start=30&rel=0')!;
      expect(yt.provider, 'YouTube');
      expect(yt.watchUrl, 'https://www.youtube.com/watch?v=abcDEF12345&t=30s');
      expect(parseVideoEmbed('https://player.vimeo.com/video/123456?dnt=1')!.watchUrl, 'https://vimeo.com/123456');
      expect(parseVideoEmbed('https://evil.test/embed/abcDEF12345'), isNull);
      expect(parseVideoEmbed('http://www.youtube-nocookie.com/embed/abcDEF12345'), isNull);
      expect(parseVideoEmbed('https://www.youtube.com/watch?v=abcDEF12345'), isNull);
    });

    test('evcar.news links open in the app; others do not', () {
      expect(inAppRouteForLink(Uri.parse('https://evcar.news/n/some-slug')), '/news/some-slug');
      expect(inAppRouteForLink(Uri.parse('https://www.evcar.news/cars/model-x')), '/cars/model-x');
      expect(inAppRouteForLink(Uri.parse('https://evcar.news/about')), isNull);
      expect(inAppRouteForLink(Uri.parse('https://evcar.news.evil.test/n/x')), isNull);
      expect(inAppRouteForLink(Uri.parse('https://other.test/n/x')), isNull);
    });

    test('share URL: server link when on the share host, else built', () {
      final a = ArticleSummary.tryParse(summaryJson())!;
      expect(articleShareUrl(a, 'https://evcar.news'), 'https://evcar.news/n/test-article');
      final evil = ArticleSummary.tryParse({...summaryJson(), 'shareUrl': 'https://evil.test/n/x'})!;
      expect(articleShareUrl(evil, 'https://evcar.news'), 'https://evcar.news/n/test-article');
      final none = ArticleSummary.tryParse({...summaryJson(), 'shareUrl': null})!;
      expect(articleShareUrl(none, 'https://evcar.news'), 'https://evcar.news/n/test-article');
    });
  });

  test('ReaderSettings.fromJson clamps and falls back', () {
    expect(ReaderSettings.fromJson(null), const ReaderSettings());
    final s = ReaderSettings.fromJson({'fontScale': 9, 'lineSpacing': 'relaxed', 'theme': 'dark'});
    expect(s.fontScale, ReaderSettings.maxScale);
    expect(s.lineSpacing, ReaderLineSpacing.relaxed);
    expect(s.theme, ReaderTheme.dark);
    expect(ReaderSettings.fromJson({'lineSpacing': 'x', 'theme': 3}), const ReaderSettings());
  });

  test('articleImageUrls collects cover + inline images once', () {
    final d = ArticleDetail.fromData(detailJson());
    expect(articleImageUrls(d), ['https://media.test/a/w1600.webp', 'https://media.test/body/w960.webp']);
  });

  test('offlineImageFileName is stable and distinct', () {
    final a = offlineImageFileName('https://media.test/a.webp');
    expect(a, offlineImageFileName('https://media.test/a.webp'));
    expect(a, isNot(offlineImageFileName('https://media.test/b.webp')));
    expect(a, matches(RegExp(r'^[0-9a-f]{16}\.img$')));
  });
}
