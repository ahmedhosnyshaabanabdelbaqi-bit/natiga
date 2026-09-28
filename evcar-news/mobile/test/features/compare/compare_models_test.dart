import 'package:dio/dio.dart';
import 'package:evcar_news/core/api/api_client.dart';
import 'package:evcar_news/core/api/interceptors/request_headers_interceptor.dart';
import 'package:evcar_news/core/cache/json_cache.dart';
import 'package:evcar_news/features/compare/data/compare_repository.dart';
import 'package:evcar_news/features/compare/domain/comparison_models.dart';
import 'package:evcar_news/features/compare/domain/picker_models.dart';
import 'package:evcar_news/features/compare/domain/recommendation_models.dart';
import 'package:evcar_news/shared/compare_tray.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/fake_http_adapter.dart';
import 'compare_fixtures.dart';

ComparisonData _result([Map<String, dynamic>? body]) =>
    ComparisonData.fromData((body ?? compareFixture('compute_detailed_en'))['data']);

Metric _metric(ComparisonData r, String key) => r.groups.expand((g) => g.metrics).firstWhere((m) => m.key == key);

const _tray = [
  CompareSelection(variantId: bevId, modelYear: 2025, marketCode: 'EG', title: 'BEV'),
  CompareSelection(variantId: phevId, modelYear: 2025, marketCode: 'EG', title: 'PHEV'),
];

void main() {
  group('ComparisonData parsing (real demo responses)', () {
    test('cars, groups in §7 order, disclosure and not-available label', () {
      final r = _result();
      expect(r.cars.map((c) => c.key), [bevKey, phevKey]);
      expect(r.cars.first.modelYear, 2025);
      expect(r.cars.first.market.code, 'EG');
      expect(r.cars.first.isDemo, isTrue);
      expect(r.groups.map((g) => g.key), [
        'price',
        'range',
        'battery',
        'consumption',
        'charging',
        'performance',
        'space',
        'safety',
        'warranty',
        'features',
      ]);
      expect(r.sponsored, isFalse);
      expect(r.disclosure, contains('never change'));
      expect(r.notAvailableLabel, 'Not available');
      expect(r.summary.winsByCar.map((w) => w.wins), [2, 0]);
      expect(r.warnings.map((w) => w.code), containsAll(['MIXED_POWERTRAINS', 'DEMO_DATA']));
    });

    test('missing values stay null (never 0) and keep their status', () {
      final r = _result();
      final dc = _metric(r, 'charging.dc_time');
      final phev = dc.valueFor(phevKey)!;
      expect(phev.status, ValueStatus.missing);
      expect(phev.value, isNull);
      expect(phev.isPresent, isFalse);
      final bev = dc.valueFor(bevKey)!;
      expect(bev.value, 30);
      expect(bev.condition!.socWindow, '10–80%');
      expect(bev.condition!.chargerPowerKw, 150);
      final total = _metric(r, 'range.total');
      expect(total.valueFor(bevKey)!.status, ValueStatus.notApplicable);
      expect(total.comparability, Comparability.notApplicable);
    });

    test('winners are marked only when the API names them on a comparable row with present values', () {
      final r = _result();
      expect(_metric(r, 'range.electric').markedWinners, {bevKey});
      expect(_metric(r, 'charging.dc_time').markedWinners, isEmpty, reason: 'missing data');
      expect(_metric(r, 'battery.usable_kwh').markedWinners, isEmpty, reason: 'battery direction none');

      final body = copyJson(compareFixture('compute_detailed_en'));
      // A server bug must never produce a winner on a non-comparable row.
      final range = metricIn(body, 'range.electric')..['comparability'] = 'not_comparable_cycles';
      expect(range['winners'], [bevKey]);
      expect(_metric(_result(body), 'range.electric').markedWinners, isEmpty);
      // …nor for a car whose value is missing.
      final dc = metricIn(body, 'charging.dc_time')
        ..['comparability'] = 'comparable'
        ..['outcome'] = 'winner'
        ..['winners'] = [phevKey];
      expect(dc['winners'], [phevKey]);
      expect(_metric(_result(body), 'charging.dc_time').markedWinners, isEmpty);
    });

    test('unknown enum values fall back safely', () {
      final body = copyJson(compareFixture('compute_detailed_en'));
      metricIn(body, 'range.electric')
        ..['comparability'] = 'something_new'
        ..['outcome'] = 'maybe';
      final m = _metric(_result(body), 'range.electric');
      expect(m.comparability, Comparability.unknown);
      expect(m.outcome, Outcome.noWinner);
      expect(m.markedWinners, isEmpty);
    });

    test('"present" without a value is shown as missing', () {
      final body = copyJson(compareFixture('compute_detailed_en'));
      final values = metricIn(body, 'range.electric')['values'] as List;
      (values.first as Map)['value'] = null;
      final v = _metric(_result(body), 'range.electric').valueFor(bevKey)!;
      expect(v.status, ValueStatus.missing);
    });

    test('summary view keeps key rows, differences-only hides equal rows, empty groups drop out', () {
      final r = _result();
      final all = r.visibleGroups(summary: false, differencesOnly: false).expand((g) => g.metrics).toList();
      final summary = r.visibleGroups(summary: true, differencesOnly: false).expand((g) => g.metrics).toList();
      final diff = r.visibleGroups(summary: false, differencesOnly: true).expand((g) => g.metrics).toList();
      expect(all.length, r.summary.metricsTotal);
      expect(summary.every((m) => m.isKey), isTrue);
      expect(summary.length, lessThan(all.length));
      expect(diff.every((m) => m.isDifferent), isTrue);
      expect(diff.map((m) => m.key), isNot(contains('performance.drive_type')));
      expect(all.map((m) => m.key), contains('performance.drive_type'));
      // The server's own summary+differences view has the same rows.
      final server = ComparisonData.fromData(compareFixture('compute_summary_diff_en')['data']);
      final local = r.visibleGroups(summary: true, differencesOnly: true);
      expect(
        local.expand((g) => g.metrics).map((m) => m.key).toList(),
        server.groups.expand((g) => g.metrics).map((m) => m.key).toList(),
      );
    });

    test('Arabic response parses with Arabic labels', () {
      final r = _result(compareFixture('compute_detailed_ar'));
      expect(r.notAvailableLabel, 'غير متوفر');
      expect(r.groups.first.label, isNot('Price'));
    });

    test('a result without cars is rejected', () {
      final body = copyJson(compareFixture('compute_detailed_en'));
      (body['data'] as Map)['cars'] = <Object>[];
      expect(() => _result(body), throwsFormatException);
    });
  });

  group('saved / shared comparisons', () {
    test('guest create response and shared result', () {
      final created = SavedComparison.fromData(compareFixture('create_guest_en')['data']);
      expect(created.shareId, guestShareId);
      expect(created.shareUrl, 'https://evcar.news/compare/$guestShareId');
      expect(created.kind, 'shared');
      expect(created.saved, isFalse);
      expect(created.reused, isFalse);
      expect(created.items.map((i) => i.variantId), [bevId, phevId]);

      final shared = SharedComparison.fromData(compareFixture('shared_en')['data']);
      expect(shared.result, isNotNull);
      expect(shared.unavailableItems, isEmpty);
    });

    test('result null when fewer than two trims remain', () {
      final body = copyJson(compareFixture('shared_en'));
      final data = body['data'] as Map<String, dynamic>;
      data['result'] = null;
      data['unavailableItems'] = [((data['comparison'] as Map)['items'] as List).first];
      final shared = SharedComparison.fromData(data);
      expect(shared.result, isNull);
      expect(shared.unavailableItems.single.variantId, bevId);
    });

    test('featured list is curated', () {
      final list = [for (final c in compareFixture('featured_en')['data'] as List) SavedComparison.tryParse(c)!];
      expect(list.single.isCurated, isTrue);
      expect(list.single.isDemo, isTrue);
    });
  });

  group('pickers', () {
    test('each level parses with its extra fields', () {
      final variants = PickerPage.fromData(compareFixture('pickers_variants')['data'], expected: PickerLevel.variant);
      expect(variants.level, PickerLevel.variant);
      expect(variants.items.map((i) => i.powertrainType), ['BEV', 'PHEV']);
      expect(variants.items.first.modelYear, 2025);
      expect(variants.items.first.markets.single.code, 'EG');
      final years = PickerPage.fromData(compareFixture('pickers_years')['data'], expected: PickerLevel.year);
      expect(years.items.single.year, 2025);
      final markets = PickerPage.fromData(compareFixture('pickers_markets')['data'], expected: PickerLevel.market);
      expect(markets.items.single.currencyCode, 'EGP');
      expect(markets.items.single.availability, 'available');
    });

    test('query picks the deepest level and always sends market + scope', () {
      expect(const PickerQuery(market: 'EG').toQueryParameters(), {'market': 'EG', 'scope': 'market'});
      expect(const PickerQuery(brand: 'b', market: 'EG').level, PickerLevel.model);
      expect(const PickerQuery(brand: 'b', model: 'm', market: 'EG').toQueryParameters(), {
        'model': 'm',
        'market': 'EG',
        'scope': 'market',
      });
      expect(
        const PickerQuery(brand: 'b', model: 'm', year: 2025, market: 'SA', allMarkets: true).toQueryParameters(),
        {'model': 'm', 'year': 2025, 'market': 'SA', 'scope': 'all'},
      );
      const trims = PickerQuery(brand: 'b', model: 'm', year: 2025, variant: 'v', market: 'EG');
      expect(trims.level, PickerLevel.market);
      expect(trims.toQueryParameters(), {'variant': 'v', 'market': 'EG', 'scope': 'market'});
    });
  });

  group('recommendations', () {
    test('no decisive recommendation: explanation, missing data and suggestions', () {
      final r = RecommendationResult.fromData(compareFixture('recommend_en')['data']);
      expect(r.decision.decisive, isFalse);
      expect(r.decision.reason, 'no_comparable_candidates');
      expect(r.topPick, isNull);
      expect(r.ranked, isEmpty);
      expect(r.notRanked.map((n) => n.reason), ['price_not_available', 'missing_data']);
      expect(r.notRanked.last.missingData.map((m) => m.factor), ['space', 'performance']);
      expect(r.factorAvailability.where((f) => f.suggestion != null).map((f) => f.factor), [
        RecFactor.space,
        RecFactor.performance,
      ]);
      expect(r.weights.map((w) => w.source).toSet(), {'default', 'usage'});
      expect(r.sponsored, isFalse);
      expect(r.budget!.currency, 'EGP');
    });

    test('ranked car with contributions and reasons; top pick only when decisive', () {
      final r = RecommendationResult.fromData(compareFixture('recommend_ranked_en')['data']);
      expect(r.decision.decisive, isFalse);
      expect(r.topPick, isNull);
      final first = r.ranked.single;
      expect(first.rank, 1);
      expect(first.score, 100);
      expect(first.car.marketCode, 'EG');
      expect(first.contributions.map((c) => c.factor), contains('range'));
      expect(first.reasons.first.code, 'RANGE_COVERS_DAYS');

      final body = copyJson(compareFixture('recommend_ranked_en'));
      ((body['data'] as Map)['decision'] as Map)
        ..['decisive'] = true
        ..['topPickKey'] = bevKey;
      expect(RecommendationResult.fromData(body['data']).topPick?.car.variantId, bevId);
    });

    test('input JSON: rounding, optional filters, weights only when customised', () {
      const input = RecommendationInput(
        budget: 1500000.456,
        dailyKm: 42.25,
        longTripsPerMonth: 2,
        homeCharging: false,
        seatsNeeded: 5,
      );
      expect(input.toJson(), {
        'budget': 1500000.46,
        'dailyKm': 42.3,
        'longTripsPerMonth': 2,
        'homeCharging': false,
        'seatsNeeded': 5,
        'powertrains': ['BEV', 'EREV', 'PHEV'],
      });
      final custom = input.copyWith(bodyTypes: {'suv'}, weights: () => {RecFactor.price: 5, RecFactor.range: 0});
      final json = custom.toJson();
      expect(json['bodyTypes'], ['suv']);
      expect((json['weights'] as Map)['price'], 5);
      expect((json['weights'] as Map)['space'], 0, reason: 'unset factors are sent as 0');
      expect(custom.weightsValid, isTrue);
      expect(input.copyWith(weights: () => {RecFactor.price: 0}).weightsValid, isFalse);
    });
  });

  group('CompareRepository', () {
    late FakeHttpAdapter adapter;
    late MemoryJsonCache cache;
    late CompareRepository repo;
    var online = true;

    setUp(() {
      online = true;
      adapter = FakeHttpAdapter();
      cache = MemoryJsonCache();
      final dio = Dio(BaseOptions(baseUrl: 'https://api.test/api/v1'))..httpClientAdapter = adapter;
      repo = CompareRepository(
        api: ApiClient(dio),
        cache: cache,
        locale: () => const RequestLocale(languageCode: 'en', marketCode: 'EG'),
      );
      adapter.on('POST /comparisons/compute', (_) {
        if (!online) throw const FakeNetworkError();
        return FakeResponse.json(200, compareFixture('compute_detailed_en'));
      });
    });

    test('compute sends trim + model year + market for every car, detailed view', () async {
      final res = await repo.compute(_tray);
      expect(res.fromCache, isFalse);
      final body = adapter.requestsTo('POST /comparisons/compute').single.data as Map;
      expect(body['items'], [
        {'variantId': bevId, 'modelYear': 2025, 'market': 'EG'},
        {'variantId': phevId, 'modelYear': 2025, 'market': 'EG'},
      ]);
      expect(body['view'], 'detailed');
      expect(body['differencesOnly'], isFalse);
    });

    test('offline: the last result of the same cars comes from the cache with its date', () async {
      await repo.compute(_tray);
      online = false;
      final res = await repo.compute(_tray);
      expect(res.fromCache, isTrue);
      expect(res.data.cars.length, 2);
      // Another selection has no cached copy → the error surfaces.
      await expectLater(repo.compute(_tray.reversed.toList()), throwsA(anything));
    });

    test('create posts the same items; recommend posts the wizard answers', () async {
      adapter
        ..on('POST /comparisons', (_) => FakeResponse.json(201, compareFixture('create_guest_en')))
        ..on('POST /recommendations', (_) => FakeResponse.json(200, compareFixture('recommend_en')));
      final c = await repo.create(_tray);
      expect(c.shareId, guestShareId);
      expect((adapter.requestsTo('POST /comparisons').single.data as Map)['items'], hasLength(2));
      final r = await repo.recommend(
        const RecommendationInput(budget: 2e6, dailyKm: 60, longTripsPerMonth: 2, homeCharging: true, seatsNeeded: 4),
      );
      expect(r.decision.decisive, isFalse);
      expect((adapter.requestsTo('POST /recommendations').single.data as Map)['homeCharging'], isTrue);
    });
  });
}
