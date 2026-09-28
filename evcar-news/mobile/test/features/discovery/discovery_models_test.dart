import 'package:evcar_news/core/api/api_client.dart';
import 'package:evcar_news/features/cars/domain/catalog_models.dart';
import 'package:evcar_news/features/charging/domain/station_models.dart';
import 'package:evcar_news/features/compare/domain/comparison_models.dart';
import 'package:evcar_news/features/encyclopedia/data/encyclopedia_repository.dart';
import 'package:evcar_news/features/encyclopedia/domain/encyclopedia_models.dart';
import 'package:evcar_news/features/favorites/data/api_favorites_remote.dart';
import 'package:evcar_news/features/home/domain/home_models.dart';
import 'package:evcar_news/features/news/domain/article.dart';
import 'package:evcar_news/features/search/domain/search_models.dart';
import 'package:evcar_news/features/services_directory/data/services_repository.dart';
import 'package:evcar_news/features/services_directory/domain/service_models.dart';
import 'package:evcar_news/features/services_directory/presentation/widgets/service_widgets.dart';
import 'package:evcar_news/features/tours/domain/tour_models.dart';
import 'package:evcar_news/shared/favorites/favorite_item.dart';
import 'package:flutter_test/flutter_test.dart';

import 'discovery_fixtures.dart';

void main() {
  group('home', () {
    test('parses every section of the captured /home with typed items, in server order', () {
      final feed = HomeFeed.fromData(ApiClient.unwrapData(discoveryFixture('home_nearby_en')));
      expect(feed.sections.map((s) => s.key), [
        'top_story',
        'latest_news',
        'interior_tours',
        'new_cars',
        'featured_comparisons',
        'reviews',
        'nearby_stations',
        'charging_guides',
      ]);
      HomeSection s(String k) => feed.sections.firstWhere((x) => x.key == k);
      expect(s('top_story').itemsOf<ArticleSummary>(), hasLength(1));
      expect(s('interior_tours').itemsOf<TourCard>(), hasLength(1));
      expect(s('new_cars').itemsOf<CarSummary>(), hasLength(1));
      expect(s('featured_comparisons').itemsOf<SavedComparison>(), hasLength(1));
      expect(s('nearby_stations').itemsOf<StationListItem>().single.distanceM, 10914);
      expect(s('charging_guides').itemsOf<EncyclopediaEntrySummary>().single.review.reviewed, isTrue);
      expect(s('latest_news').state, HomeSectionState.empty);
      expect(s('interior_tours').browse!.route, '/tours');
      expect(s('nearby_stations').browse!.route, '/charging?view=list');
      expect(s('reviews').browse!.route, '/news?type=review');
      // Every item of the real response parses (nothing silently dropped).
      final raw = (discoveryFixture('home_nearby_en')['data'] as Map)['sections'] as List;
      for (final r in raw.cast<Map<String, dynamic>>()) {
        expect(s(r['key'] as String).items.length, (r['items'] as List).length, reason: r['key'] as String);
      }
    });

    test('guest home without a point asks for location', () {
      final feed = HomeFeed.fromData(ApiClient.unwrapData(discoveryFixture('home_en')));
      final nearby = feed.sections.firstWhere((s) => s.key == 'nearby_stations');
      expect(nearby.state, HomeSectionState.locationRequired);
      expect(nearby.items, isEmpty);
    });

    test('sections are sorted by order; unknown item types and malformed sections are dropped', () {
      final feed = HomeFeed.fromData({
        'sections': [
          {'key': 'b', 'order': 2, 'title': 'B', 'itemType': 'article', 'state': 'ok', 'items': []},
          {'key': 'x', 'order': 0, 'title': 'X', 'itemType': 'podcast', 'state': 'ok', 'items': []},
          {
            'key': 'a',
            'order': 1,
            'title': 'A',
            'itemType': 'car',
            'state': 'weird',
            'items': [42, 'x'],
          },
          'junk',
        ],
      });
      expect(feed.sections.map((s) => s.key), ['a', 'b']);
      expect(feed.sections.first.state, HomeSectionState.unavailable);
      expect(feed.sections.first.items, isEmpty);
    });

    test('the offline copy never contains location-derived stations', () {
      final stripped = stripLocationFromHomeJson(discoveryFixture('home_nearby_en'));
      final feed = HomeFeed.fromData(ApiClient.unwrapData(stripped));
      final nearby = feed.sections.firstWhere((s) => s.key == 'nearby_stations');
      expect(nearby.items, isEmpty);
      expect(nearby.state, HomeSectionState.locationRequired);
      // Other sections are untouched.
      expect(feed.sections.firstWhere((s) => s.key == 'top_story').items, hasLength(1));
    });
  });

  group('search', () {
    test('parses captured grouped results, highlights and routes', () {
      final r = SearchResults.fromData(ApiClient.unwrapData(discoveryFixture('search_en')));
      expect(r.groups.map((g) => g.type), SearchGroupTypes.all);
      expect(r.totalHits, 4);
      final stations = r.group('stations')!;
      expect(stations.items, hasLength(2));
      final hit = stations.items.first;
      expect(hit.isDemo, isTrue);
      expect(hit.route, '/charging/stations/d0000000-0000-4000-8000-000000000031');
      expect(hit.titleHighlights, contains(const HighlightRange(1, 5)));
      expect(r.group('encyclopedia')!.items.single.route, '/encyclopedia/demo-encyclopedia-entry');
      expect(r.nonEmptyGroups.map((g) => g.type), containsAll(['stations', 'encyclopedia', 'services']));
    });

    test('Arabic query results parse too', () {
      final r = SearchResults.fromData(ApiClient.unwrapData(discoveryFixture('search_ar')));
      expect(r.totalHits, greaterThan(0));
      expect(r.nonEmptyGroups.expand((g) => g.items).every((h) => h.title.isNotEmpty), isTrue);
    });

    test('suggestions: entity suggestions open the item', () {
      final data = discoveryFixture('suggest_en')['data'] as List;
      final s = [for (final e in data) ?SearchSuggestion.tryParse(e)];
      expect(s, hasLength(3));
      final service = s.firstWhere((x) => x.type == 'service');
      expect(service.isEntity, isTrue);
      expect(service.route, '/services/demo-service-centre');
    });

    test('highlight runs clamp bad ranges and merge overlaps (never throw)', () {
      expect(highlightRuns('Tesla', const [HighlightRange(0, 3)]), [('Tes', true), ('la', false)]);
      expect(highlightRuns('abc', const [HighlightRange(-2, 1), HighlightRange(1, 99)]), [('abc', true)]);
      expect(highlightRuns('abcdef', const [HighlightRange(1, 3), HighlightRange(2, 4)]), [
        ('a', false),
        ('bcd', true),
        ('ef', false),
      ]);
      expect(highlightRuns('abc', const [HighlightRange(5, 9), HighlightRange(2, 2)]), [('abc', false)]);
      // Arabic: UTF-16 offsets index the Dart string directly.
      expect(highlightRuns('بي واي دي', const [HighlightRange(0, 2)]).first, ('بي', true));
    });
  });

  group('encyclopedia', () {
    test('captured list and detail parse; electrical category carries the safety notice', () {
      final page = parseEncyclopediaPage(discoveryFixture('encyclopedia_list_en'));
      final e = page.items.single;
      expect(e.slug, 'demo-encyclopedia-entry');
      expect(e.category.key, 'connectors');
      expect(e.isElectrical, isTrue);
      expect(e.review.label, 'Reviewed by a technical specialist');
      final detail = EncyclopediaEntryDetail.fromData(ApiClient.unwrapData(discoveryFixture('encyclopedia_entry_en')));
      expect(detail.safetyNotice, contains('qualified'));
      expect(detail.bodyHtml, contains('<p>'));
      final cats = parseEncyclopediaCategories(discoveryFixture('encyclopedia_categories_ar'));
      expect(cats, isNotEmpty);
      expect(cats.map((c) => c.sortOrder ?? 0).toList(), orderedEquals([...cats.map((c) => c.sortOrder ?? 0)]..sort()));
    });

    test('a zero reading time is not shown as information', () {
      final e = EncyclopediaEntrySummary.tryParse({
        'id': 'e1',
        'slug': 's',
        'title': 'T',
        'category': {'key': 'k'},
        'readingMinutes': 0,
      })!;
      expect(e.readingMinutes, isNull);
      expect(e.review.reviewed, isFalse);
    });
  });

  group('services directory', () {
    test('captured list + detail parse; unknown hours stay unknown', () {
      final page = parseServicesPage(discoveryFixture('services_list_en'));
      final p = page.items.single;
      expect(p.isDemo, isTrue);
      expect(p.contact.verified, isFalse);
      expect(p.contact.label, 'Contact details have not been verified');
      expect(p.openNow, ServiceOpenState.unknown);
      expect(page.sponsored, isEmpty);
      final d = ServiceProvider.tryParse(ApiClient.unwrapData(discoveryFixture('service_detail_en')))!;
      expect(d.timezone, 'Africa/Cairo');
      final fri = d.openingHours!.firstWhere((h) => h.day == 'fri');
      expect(fri.windows, isNull, reason: 'null = unknown, never "closed"');
      expect(d.openingHours!.firstWhere((h) => h.day == 'mon').windows!.single.start, '08:00');
      expect(parseServiceTypes(discoveryFixture('services_types_ar')), hasLength(6));
    });

    test('the sponsored slot only accepts entries that are really labelled sponsored', () {
      final body = copyJson(discoveryFixture('services_list_en'));
      final item = copyJson((body['data'] as List).first as Map<String, dynamic>);
      final sponsored = {...item, 'id': 'sp1', 'isSponsored': true, 'sponsorLabel': 'Sponsored'};
      (body['meta'] as Map)['sponsored'] = [item, sponsored];
      final page = parseServicesPage(body);
      expect(page.sponsored.map((p) => p.id), ['sp1']);
    });

    test('contact links: tel keeps +, Arabic digits, https-only website, wa.me', () {
      expect(telUri('+20 (2) 1234-5678'), 'tel:+20212345678');
      expect(telUri('٠١٠١٢٣٤٥٦٧٨'), 'tel:01012345678');
      expect(telUri('--'), isNull);
      expect(whatsAppUri('+20 100 000 0000'), 'https://wa.me/201000000000');
      expect(safeWebsite('http://example.test'), isNull);
      expect(safeWebsite('javascript:alert(1)'), isNull);
      expect(safeWebsite('https://example.test/x'), 'https://example.test/x');
      expect(mailUri('a@b.test'), 'mailto:a@b.test');
      expect(mailUri('nope'), isNull);
      expect(serviceEntryLabel('battery_check'), 'Battery check');
      expect(serviceEntryLabel('فحص البطارية'), 'فحص البطارية');
    });

    test('near-me point is rounded before it leaves the device and never cached', () {
      const f = ServiceFilters(lat: 30.044421, lng: 31.235712, openNow: true);
      final q = f.toQuery(page: 1, pageSize: 20);
      expect(q['lat'], '30.044');
      expect(q['lng'], '31.236');
      expect(q['openNow'], 'true');
      expect(f.cacheKey, isNot(contains('30.0')));
    });
  });

  group('favorites', () {
    test('captured /me/favorites views map to items with routes', () {
      final data = discoveryFixture('favorites_list_en')['data'] as List;
      final items = [for (final e in data) ?parseFavoriteView(e as Map<String, dynamic>)];
      expect(items, hasLength(4));
      FavoriteItem of(FavoriteType t) => items.firstWhere((i) => i.key.type == t);
      expect(of(FavoriteType.article).route, '/news/demo-sample-article');
      expect(of(FavoriteType.comparison).route, '/compare/s/demo-cmp-0001');
      expect(of(FavoriteType.station).route, startsWith('/charging/stations/'));
      // A tour needs its car's slug, which the view does not carry.
      expect(of(FavoriteType.tour).route, isNull);
      expect(items.every((i) => i.isDemo && i.available && !i.localOnly), isTrue);
    });

    test('availability and demo flags survive device storage', () {
      const item = FavoriteItem(key: FavoriteKey(FavoriteType.model, 'm1'), title: 'T', available: false, isDemo: true);
      final back = FavoriteItem.tryFromJson(item.toJson())!;
      expect(back.available, isFalse);
      expect(back.isDemo, isTrue);
      // Older entries without the fields stay available.
      expect(FavoriteItem.tryFromJson({'type': 'model', 'id': 'm2', 'title': 'x'})!.available, isTrue);
    });
  });
}
