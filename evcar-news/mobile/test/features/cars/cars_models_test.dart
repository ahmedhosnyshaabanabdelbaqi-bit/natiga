import 'package:evcar_news/app/di/providers.dart';
import 'package:evcar_news/core/api/api_exception.dart';
import 'package:evcar_news/core/auth/device_id_store.dart';
import 'package:evcar_news/core/auth/token_storage.dart';
import 'package:evcar_news/core/cache/json_cache.dart';
import 'package:evcar_news/core/cache/saved_items_store.dart';
import 'package:evcar_news/core/settings/settings_controller.dart';
import 'package:evcar_news/features/cars/data/cars_repository.dart';
import 'package:evcar_news/features/cars/domain/cars_query.dart';
import 'package:evcar_news/features/cars/domain/catalog_models.dart';
import 'package:evcar_news/features/cars/domain/variant_sheet.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/fake_http_adapter.dart';
import 'cars_fixtures.dart';

void main() {
  group('parsing (real API shapes, demo seed)', () {
    test('catalog card keeps ranges per cycle and the local price type', () {
      final page = parseCarsPage(fixture('cars'));
      expect(page.items, hasLength(1));
      final car = page.items.single;
      expect(car.slug, demoCarSlug);
      expect(car.isDemo, isTrue);
      expect(car.hasTour, isTrue);
      expect(car.powertrainTypes, ['BEV', 'PHEV']);
      expect(car.headlineRange!.cycle, 'WLTP');
      expect(car.headlineRange!.rangeType, 'electric');
      expect(car.ranges.where((r) => r.rangeType == 'total'), hasLength(1));
      expect(car.priceFrom!.amount.amount, '1500000.00');
      expect(car.priceFrom!.amount.currency, 'EGP');
      expect(car.priceFrom!.priceType, 'official_msrp');
      expect(page.currencyCode, 'EGP');
      expect(page.meta.total, 1);
    });

    test('model page: generations → years → trims, tours per trim', () {
      final car = CarDetail.fromData(fixture('car')['data']);
      expect(car.availableInMarket, isTrue);
      expect(car.yearOptions.single.year.year, 2025);
      expect(car.allVariants.map((v) => v.id), [demoBevId, demoPhevId]);
      expect(car.defaultVariantId, demoBevId);
      final phev = car.variantById(demoPhevSlug)!;
      expect(phev.currentPrice, isNull, reason: 'no price → null, never 0');
      expect(phev.keyFacts.dcPeakKw, isNull);
      expect(car.tours.forVariant(demoBevId).single.id, demoTourId);
      expect(car.tours.forVariant(demoPhevId), isEmpty);
      expect(car.relatedArticles.single.isDemo, isTrue);
    });

    test('model page in a market without trims', () {
      final car = CarDetail.fromData(fixture('car_sa')['data']);
      expect(car.availableInMarket, isFalse);
      expect(car.allVariants, isEmpty);
      expect(car.defaultVariantId, isNull);
      expect(car.availableMarkets.single.code, 'EG');
    });

    test('variant sheet: provenance, nulls, charging with SoC window, price history', () {
      final s = VariantSheet.fromData(fixture('variant')['data']);
      expect(s.market.code, 'EG');
      expect(s.market.offered, isTrue);
      expect(s.keyFacts.usableBatteryKwh!.value, 60);
      expect(s.keyFacts.usableBatteryKwh!.provenance.reliability, 'unverified');
      expect(s.keyFacts.usableBatteryKwh!.provenance.source!.title, 'Demo data (fictional)');
      expect(s.keyFacts.accel0100S, isNull);
      expect(s.ranges.single.cycle, 'WLTP');
      expect(s.chargingTimes.single.fromSoc, 10);
      expect(s.chargingTimes.single.toSoc, 80);
      expect(s.chargingTimes.single.chargerPowerKw, 150);
      expect(s.chargingCurves.single.points.first.socPercent, 10);
      expect(s.inlets.map((i) => i.currentType), ['AC', 'DC']);
      expect(s.currentPrice!.inMarketCurrency, isTrue);
      expect(s.priceHistory, isNotEmpty);
      expect(s.currentPrice!.effectiveFrom, DateTime(2025));
      final battery = s.specGroups.firstWhere((g) => g.key == 'battery');
      expect(battery.items.firstWhere((i) => i.key == 'battery.chemistry').point, isNull);
      final v2l = s.specGroups.firstWhere((g) => g.key == 'charging').items.firstWhere((i) => i.key == 'charging.v2l');
      expect(v2l.point!.value, isTrue);
      final hp = s.specGroups
          .firstWhere((g) => g.key == 'performance')
          .items
          .firstWhere((i) => i.key == 'performance.power_hp');
      expect(hp.point!.derived, isTrue);
      expect(s.tours.tours.single.seatScenes.map((e) => e.position), ['driver', 'rear']);
    });

    test('variant sheet in a market where the trim is not sold', () {
      final s = VariantSheet.fromData(fixture('variant_sa')['data']);
      expect(s.market.offered, isFalse);
      expect(s.market.availability, 'not_listed');
      expect(s.currentPrice, isNull);
      expect(s.priceHistory, isEmpty);
      expect(s.inlets, isEmpty);
    });

    test('PHEV sheet keeps electric and total ranges apart', () {
      final s = VariantSheet.fromData(fixture('variant_phev')['data']);
      expect(s.powertrainType, 'PHEV');
      expect(s.ranges.map((r) => r.rangeType).toSet(), {'electric', 'total'});
      expect(s.tours.tours, isEmpty);
    });

    test('malformed items are skipped, not fatal', () {
      final json = copyJson(fixture('cars'));
      (json['data'] as List).add({'id': 'broken'});
      (json['data'] as List).add('nonsense');
      expect(parseCarsPage(json).items, hasLength(1));
      expect(DataPoint.tryParse({'value': null}), isNull);
      expect(
        CarPrice.tryParse({
          'amount': {'amount': 'x', 'currency': 'EGP'},
          'priceType': 'dealer',
        }),
        isNull,
      );
      expect(parseCalendarDate('2025-03-09'), DateTime(2025, 3, 9));
    });

    test('reference tours come after exact tours', () {
      const info = ToursInfo(
        tours: [
          TourSummary(id: 'ref', variantId: 'v', isReferenceForSimilarTrim: true),
          TourSummary(id: 'exact', variantId: 'v'),
          TourSummary(id: 'other', variantId: 'w'),
        ],
      );
      expect(info.forVariant('v').map((t) => t.id), ['exact', 'ref']);
    });
  });

  group('CarsQuery', () {
    test('a minimum range is always sent with its cycle', () {
      final q = const CarsQuery().copyWith(minRangeKm: () => 400, rangeCycle: 'EPA');
      final p = q.toQueryParameters();
      expect(p['minRange'], 400);
      expect(p['rangeCycle'], 'EPA');
      expect(q.activeCount, 1);
    });

    test('range sort sends the cycle; defaults send nothing extra', () {
      expect(const CarsQuery(sort: CarSort.rangeDesc).toQueryParameters()['rangeCycle'], 'WLTP');
      final p = const CarsQuery().toQueryParameters();
      expect(p.keys.toSet(), {'page', 'pageSize'});
    });

    test('filters, equality and cache key', () {
      final a = const CarsQuery().copyWith(
        powertrains: {'PHEV', 'BEV'},
        bodies: {'suv'},
        minPrice: () => 1000000,
        maxPrice: () => 2000000,
        minSeats: () => 7,
        sort: CarSort.priceAsc,
      );
      final p = a.toQueryParameters(page: 2);
      expect(p['powertrain'], 'BEV,PHEV');
      expect(p['body'], 'suv');
      expect(p['minPrice'], '1000000');
      expect(p['maxPrice'], '2000000');
      expect(p['minSeats'], 7);
      expect(p['sort'], 'price_asc');
      expect(p['page'], 2);
      expect(a.activeCount, 5);
      final b = const CarsQuery().copyWith(
        powertrains: {'BEV', 'PHEV'},
        bodies: {'suv'},
        minPrice: () => 1000000,
        maxPrice: () => 2000000,
        minSeats: () => 7,
        sort: CarSort.priceAsc,
      );
      expect(a, b);
      expect(a.hashCode, b.hashCode);
      expect(a.cacheKey, b.cacheKey);
      expect(a.cleared().activeCount, 0);
    });
  });

  group('CarsRepository', () {
    late FakeHttpAdapter http;
    late ProviderContainer container;
    late MemorySavedItemsStore saved;
    var online = true;

    setUp(() async {
      online = true;
      SharedPreferences.setMockInitialValues({'settings.language': 'en'});
      final prefs = await SharedPreferences.getInstance();
      http = FakeHttpAdapter();
      http.on('GET /variants/$demoBevSlug', (req) {
        if (!online) throw const FakeNetworkError();
        return FakeResponse.json(200, fixture(req.queryParameters['market'] == 'SA' ? 'variant_sa' : 'variant'));
      });
      http.on('GET /cars/$demoCarSlug', (req) {
        if (!online) throw const FakeNetworkError();
        return FakeResponse.json(200, fixture(req.queryParameters['market'] == 'SA' ? 'car_sa' : 'car'));
      });
      saved = MemorySavedItemsStore();
      container = ProviderContainer(
        overrides: [
          sharedPreferencesProvider.overrideWithValue(prefs),
          httpClientAdapterProvider.overrideWithValue(http),
          apiBaseUrlProvider.overrideWithValue('https://api.test/api/v1'),
          jsonCacheProvider.overrideWithValue(MemoryJsonCache()),
          savedItemsStoreProvider.overrideWithValue(saved),
          deviceLocalesProvider.overrideWithValue(const [Locale('en')]),
          tokenStorageProvider.overrideWithValue(InMemoryTokenStorage()),
          deviceIdStoreProvider.overrideWithValue(InMemoryDeviceIdStore('test-device')),
        ],
      );
      addTearDown(container.dispose);
    });

    test('the page market is sent explicitly', () async {
      final repo = container.read(carsRepositoryProvider);
      final sa = await repo.car(demoCarSlug, market: 'SA');
      expect(sa.data.availableInMarket, isFalse);
      expect(http.requestsTo('GET /cars/$demoCarSlug').last.queryParameters['market'], 'SA');
      final v = await repo.variant(demoBevSlug, market: 'SA');
      expect(v.sheet.market.offered, isFalse);
      expect(http.requestsTo('GET /variants/$demoBevSlug').last.queryParameters['market'], 'SA');
    });

    test('offline: automatic cache first, then the saved copy with its date', () async {
      final repo = container.read(carsRepositoryProvider);
      final live = await repo.variant(demoBevSlug, market: 'EG');
      expect(live.origin, SheetOrigin.live);

      online = false;
      final cached = await repo.variant(demoBevSlug, market: 'EG');
      expect(cached.origin, SheetOrigin.cache);
      expect(cached.savedAt, isNotNull);

      // Saved copy survives when the automatic cache is gone.
      final at = await repo.saveSheet(live);
      await container.read(jsonCacheProvider).clear();
      final fromSaved = await repo.variant(demoBevSlug, market: 'EG');
      expect(fromSaved.origin, SheetOrigin.saved);
      expect(fromSaved.savedAt, at);
      expect(fromSaved.sheet.id, demoBevId);
      expect((await saved.list(type: SavedItemType.carSpecs)).single.market, 'EG');

      // Another market has no copy → the connectivity error surfaces.
      await expectLater(
        repo.variant(demoBevSlug, market: 'AE'),
        throwsA(isA<ApiException>().having((e) => e.isConnectivityProblem, 'offline', isTrue)),
      );

      await repo.removeSavedSheet(demoBevId, market: 'EG');
      expect(await repo.savedAt(demoBevId, market: 'EG'), isNull);
    });
  });
}
