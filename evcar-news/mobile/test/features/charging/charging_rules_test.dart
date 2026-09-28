import 'package:evcar_news/features/charging/data/directions.dart';
import 'package:evcar_news/features/charging/data/stations_repository.dart';
import 'package:evcar_news/features/charging/domain/city_presets.dart';
import 'package:evcar_news/features/charging/domain/station_models.dart';
import 'package:evcar_news/features/charging/domain/station_query.dart';
import 'package:evcar_news/features/charging/domain/station_status.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

import 'charging_fixtures.dart';

ConnectorAvailability _reading(
  String freshness, {
  String status = 'available',
  DateTime? observedAt,
  DateTime? expiresAt,
}) => ConnectorAvailability(
  status: AvailabilityStatus.parse(status),
  freshness: AvailabilityFreshness.parse(freshness),
  observedAt: observedAt,
  expiresAt: expiresAt,
  source: 'test-provider',
);

StationHours _hours(Map<String, List<TimeWindow>?> days, {String tz = 'Africa/Cairo', bool? always}) => StationHours(
  timezone: tz,
  isAlwaysOpen: always,
  weekly: [
    for (final d in ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
      if (days.containsKey(d)) DaySchedule(d, days[d]),
  ],
);

void main() {
  final now = DateTime.utc(2026, 9, 25, 12);

  group('connector availability (live / expired / none)', () {
    test('live and not expired → the provider status', () {
      final a = _reading('live', observedAt: now.subtract(const Duration(minutes: 2)), expiresAt: now.add(const Duration(minutes: 8)));
      expect(connectorAvailability(a, now: now), AvailabilityDisplay.available);
      expect(
        connectorAvailability(_reading('live', status: 'occupied', expiresAt: now.add(const Duration(minutes: 1))), now: now),
        AvailabilityDisplay.occupied,
      );
      expect(
        connectorAvailability(_reading('live', status: 'out_of_order', expiresAt: now.add(const Duration(minutes: 1))), now: now),
        AvailabilityDisplay.outOfOrder,
      );
    });

    test('a live reading that expired on screen becomes uncertain, never available', () {
      final a = _reading('live', observedAt: now.subtract(const Duration(minutes: 20)), expiresAt: now.subtract(const Duration(seconds: 1)));
      expect(connectorAvailability(a, now: now), AvailabilityDisplay.uncertain);
      // Exactly at expiry is already expired.
      expect(connectorAvailability(_reading('live', expiresAt: now), now: now), AvailabilityDisplay.uncertain);
      // A "live" reading without an expiry is not trusted.
      expect(connectorAvailability(_reading('live'), now: now), AvailabilityDisplay.uncertain);
    });

    test('server-expired → uncertain; none → unknown; future-dated → unknown', () {
      expect(connectorAvailability(_reading('expired'), now: now), AvailabilityDisplay.uncertain);
      expect(connectorAvailability(_reading('none'), now: now), AvailabilityDisplay.unknown);
      expect(connectorAvailability(ConnectorAvailability.none, now: now), AvailabilityDisplay.unknown);
      final future = _reading('live', observedAt: now.add(const Duration(hours: 1)), expiresAt: now.add(const Duration(hours: 2)));
      expect(connectorAvailability(future, now: now), AvailabilityDisplay.unknown);
    });

    test('a saved (offline) copy never shows a live status', () {
      final a = _reading('live', expiresAt: now.add(const Duration(minutes: 8)));
      expect(connectorAvailability(a, now: now, offlineCopy: true), AvailabilityDisplay.notLive);
    });

    test('unknown provider words stay unknown', () {
      expect(AvailabilityStatus.parse('charging-ish'), AvailabilityStatus.unknown);
      expect(OperationalStatus.parse(null), OperationalStatus.unknown);
      expect(OpenState.parse('maybe'), OpenState.unknown);
    });
  });

  group('station availability', () {
    final live = now.add(const Duration(minutes: 5));
    test('available when at least one connector is live-available', () {
      expect(
        stationAvailability([_reading('live', expiresAt: live), _reading('none')], now: now),
        AvailabilityDisplay.available,
      );
    });

    test('occupied / out of order only when every connector is live', () {
      expect(
        stationAvailability([
          _reading('live', status: 'occupied', expiresAt: live),
          _reading('live', status: 'out_of_order', expiresAt: live),
        ], now: now),
        AvailabilityDisplay.occupied,
      );
      expect(
        stationAvailability([_reading('live', status: 'out_of_order', expiresAt: live)], now: now),
        AvailabilityDisplay.outOfOrder,
      );
      expect(
        stationAvailability([_reading('live', status: 'occupied', expiresAt: live), _reading('none')], now: now),
        AvailabilityDisplay.unknown,
      );
    });

    test('expired readings → uncertain; no data → unknown; offline → not live', () {
      expect(stationAvailability([_reading('expired'), _reading('none')], now: now), AvailabilityDisplay.uncertain);
      expect(stationAvailability([_reading('none')], now: now), AvailabilityDisplay.unknown);
      expect(stationAvailability(const [], now: now), AvailabilityDisplay.unknown);
      expect(
        stationAvailability([_reading('live', expiresAt: live)], now: now, offlineCopy: true),
        AvailabilityDisplay.notLive,
      );
    });

    test('the demo station (expired "available" reading) is uncertain, not available', () {
      final d = StationDetail.fromData(chargingFixture('detail_en')['data']);
      expect(d.allConnectors.first.availability.providerStatus, 'available');
      expect(stationAvailability([for (final c in d.allConnectors) c.availability], now: now), AvailabilityDisplay.uncertain);
    });
  });

  group('list availability', () {
    const live = AvailabilitySummary(status: AvailabilityStatus.available, availableConnectors: 1, liveConnectors: 2);
    test('fresh list result shows the status', () {
      expect(listItemAvailability(live, now: now, fetchedAt: now), AvailabilityDisplay.available);
    });
    test('older than the TTL → uncertain until refreshed', () {
      expect(
        listItemAvailability(live, now: now, fetchedAt: now.subtract(listAvailabilityTtl + const Duration(seconds: 1))),
        AvailabilityDisplay.uncertain,
      );
    });
    test('no live connectors → unknown; offline copy → not live', () {
      expect(listItemAvailability(AvailabilitySummary.unknown, now: now, fetchedAt: now), AvailabilityDisplay.unknown);
      expect(
        listItemAvailability(
          const AvailabilitySummary(status: AvailabilityStatus.available, liveConnectors: 0),
          now: now,
          fetchedAt: now,
        ),
        AvailabilityDisplay.unknown,
      );
      expect(listItemAvailability(live, now: now, fetchedAt: now, offlineCopy: true), AvailabilityDisplay.notLive);
    });
  });

  group('open now (station time zone)', () {
    const day = [TimeWindow('08:00', '22:00')];
    final week = {for (final d in ['mon', 'tue', 'wed', 'thu', 'sat', 'sun']) d: day, 'fri': <TimeWindow>[]};

    test('always open / no schedule / unknown zone', () {
      expect(evaluateOpenNow(const StationHours(isAlwaysOpen: true), now), OpenState.open);
      expect(evaluateOpenNow(const StationHours(timezone: 'Africa/Cairo'), now), OpenState.unknown);
      expect(evaluateOpenNow(_hours(week, tz: 'Not/AZone'), now), OpenState.unknown);
    });

    test('Cairo summer time (UTC+3): 20:59 UTC is 23:59 local → closed', () {
      // Thursday 2026-09-24.
      expect(evaluateOpenNow(_hours(week), DateTime.utc(2026, 9, 24, 18, 59)), OpenState.open); // 21:59
      expect(evaluateOpenNow(_hours(week), DateTime.utc(2026, 9, 24, 19, 0)), OpenState.closed); // 22:00
      expect(evaluateOpenNow(_hours(week), DateTime.utc(2026, 9, 24, 5, 0)), OpenState.open); // 08:00
      expect(evaluateOpenNow(_hours(week), DateTime.utc(2026, 9, 24, 4, 59)), OpenState.closed); // 07:59
    });

    test('Cairo winter time (UTC+2) and Riyadh (UTC+3, no DST)', () {
      // Thursday 2026-12-03.
      expect(evaluateOpenNow(_hours(week), DateTime.utc(2026, 12, 3, 19, 59)), OpenState.open); // 21:59 Cairo
      expect(evaluateOpenNow(_hours(week), DateTime.utc(2026, 12, 3, 20, 0)), OpenState.closed); // 22:00 Cairo
      expect(evaluateOpenNow(_hours(week), DateTime.utc(2026, 12, 3, 5, 59)), OpenState.closed); // 07:59 Cairo
      expect(evaluateOpenNow(_hours(week), DateTime.utc(2026, 12, 3, 6, 0)), OpenState.open); // 08:00 Cairo
      expect(evaluateOpenNow(_hours(week, tz: 'Asia/Riyadh'), DateTime.utc(2026, 12, 3, 18, 59)), OpenState.open); // 21:59
      expect(evaluateOpenNow(_hours(week, tz: 'Asia/Riyadh'), DateTime.utc(2026, 12, 3, 19, 0)), OpenState.closed); // 22:00
    });

    test('empty day = closed, missing day = unknown', () {
      // Friday 2026-09-25 12:00 UTC = 15:00 Cairo.
      expect(evaluateOpenNow(_hours(week), now), OpenState.closed);
      expect(evaluateOpenNow(_hours({'mon': day}), now), OpenState.unknown);
      expect(evaluateOpenNow(_hours({'fri': null}), now), OpenState.unknown);
    });

    test('windows past midnight and 24:00', () {
      final late = {'thu': const [TimeWindow('18:00', '02:00')], 'fri': <TimeWindow>[]};
      // Friday 01:30 Cairo (UTC+3) = Thursday 22:30 UTC.
      expect(evaluateOpenNow(_hours(late), DateTime.utc(2026, 9, 24, 22, 30)), OpenState.open);
      expect(evaluateOpenNow(_hours(late), DateTime.utc(2026, 9, 24, 23, 30)), OpenState.closed); // 02:30
      final allDay = {'fri': const [TimeWindow('00:00', '24:00')]};
      expect(evaluateOpenNow(_hours(allDay), now), OpenState.open);
    });

    test('server value is used when fresh, local evaluation when stale or offline', () {
      final hours = StationHours(
        timezone: 'Africa/Cairo',
        weekly: _hours(week).weekly,
        openNow: OpenNowInfo(state: OpenState.open, evaluatedAt: now),
      );
      expect(effectiveOpenNow(hours, now: now), OpenState.open); // server says open
      expect(effectiveOpenNow(hours, now: now, offlineCopy: true), OpenState.closed); // Friday → closed
      expect(effectiveOpenNow(hours, now: now.add(const Duration(minutes: 10))), OpenState.closed);
    });
  });

  group('parsing real API responses', () {
    test('list', () {
      final page = StationSearchPage.fromBody(chargingFixture('list_en'));
      expect(page.items, hasLength(2));
      final s = page.items.first;
      expect(s.isDemo, isTrue);
      expect(s.maxPowerKw, 150);
      expect(s.currentTypes, [CurrentType.ac, CurrentType.dc]);
      expect(s.openNow, OpenState.open);
      expect(s.availability.availableConnectors, isNull, reason: 'no live data is null, never 0');
      expect(s.city, isNull);
      expect(page.liveAvailability.configured, isFalse);
      expect(page.truncated, isFalse);
      expect(page.hasMore, isFalse);
    });

    test('malformed list rows are skipped, not fatal', () {
      final json = copyJson(chargingFixture('list_en'));
      (json['data'] as List).add({'id': 'x', 'name': 'No coords'});
      (json['data'] as List).add('junk');
      expect(StationSearchPage.fromBody(json).items, hasLength(2));
    });

    test('detail with hours, tariffs, source, availability', () {
      final d = StationDetail.fromData(chargingFixture('detail_en')['data']);
      expect(d.name, contains('DEMO'));
      expect(d.hours.isAlwaysOpen, isTrue);
      expect(d.hours.openNow.reason, 'always_open');
      expect(d.points.single.connectors, hasLength(2));
      expect(d.maxPowerKw, 150);
      expect(d.tariffs.single.elements.first.price!.amount, '5.0000');
      expect(d.tariffs.single.elements.last.graceMinutes, 15);
      expect(d.tariffs.single.taxIncluded, isNull);
      expect(d.source.providers.single.provider, 'demo');
      expect(d.availability.liveProviderConfigured, isFalse);
      expect(d.community.isEmpty, isTrue);
      expect(d.address.display, contains('not a real place'));

      final d2 = StationDetail.fromData(chargingFixture('detail2_ar')['data']);
      expect(d2.hours.weekly!.firstWhere((x) => x.day == 'fri').windows, isEmpty);
      expect(d2.hours.openNow.opensAt, isNotNull);
      expect(d2.amenities.map((a) => a.code), containsAll(['restroom', 'cafe']));
    });

    test('community section is dated and separate', () {
      final c = StationDetail.fromData(chargingFixture('detail_community_en')['data']).community;
      expect(c.recentCheckins.single.createdAt.isUtc, isTrue);
      expect(c.recentCheckins.single.connectorName, 'CCS2 (Combo 2)');
      expect(c.successRate30d, isNull);
      expect(c.recentReports.single.status, 'open');
    });

    test('meta and clusters', () {
      final m = StationMeta.fromData(chargingFixture('meta_ar')['data']);
      expect(m.connectorTypes.length, greaterThanOrEqualTo(7));
      expect(m.connectorTypes.firstWhere((c) => c.code == 'ccs2').supportsDc, isTrue);
      expect(m.reportTypes.firstWhere((r) => r.code == 'other').requiresDetails, isTrue);
      expect(m.checkinOutcomes, isNotEmpty);
      final clusters = StationCluster.listFromBody(chargingFixture('clusters'));
      expect(clusters.single.count, 2);
      expect(clusters.single.stationId, isNull);
    });
  });

  group('queries and privacy', () {
    test('filters → API query', () {
      final f = StationFilters(
        query: ' cairo ',
        connectorTypes: const {'type2', 'ccs2'},
        current: CurrentType.dc,
        minPowerKw: 50,
        openNow: true,
        publicOnly: true,
        amenities: const {'wifi', 'cafe'},
        operatorNames: const {'Some operator'},
        vehicle: const CompatVehicle.garage(userVehicleId: 'uv-1', name: 'My car'),
      );
      expect(f.toQuery(), {
        'q': 'cairo',
        'connectorTypes': 'ccs2,type2',
        'current': 'DC',
        'minPowerKw': '50',
        'openNow': 'true',
        'access': 'public',
        'amenities': 'cafe,wifi',
        'userVehicleId': 'uv-1',
      });
      expect(f.activeCount, 10);
      expect(f.cleared().query, ' cairo ');
      expect(f.cleared().activeCount, 0);
      expect(StationFilters.empty.isEmpty, isTrue);
    });

    test('operator filter is applied on the device', () {
      final page = StationSearchPage.fromBody(chargingFixture('list_en'));
      const f = StationFilters(operatorNames: {'Nobody'});
      expect(page.items.where(f.matchesLocally), isEmpty);
    });

    test('area query rounds the reference point', () {
      const place = SearchPlace(point: GeoPoint(30.044412345, 31.235712345), kind: PlaceKind.device);
      expect(const SearchArea.around(place).toQuery(), {'lat': '30.0444', 'lng': '31.2357', 'radiusKm': '25'});
      const bounds = GeoBounds(south: 29.9, west: 31.1, north: 30.1, east: 31.4);
      final q = const SearchArea.bounds(bounds, place: place).toQuery();
      expect(q['bbox'], '31.10000,29.90000,31.40000,30.10000');
      expect(q.containsKey('radiusKm'), isFalse);
    });

    test('cached payloads never keep distances or the search centre', () {
      final stripped = stripLocation(chargingFixture('list_en')) as Map;
      expect((stripped['data'] as List).every((e) => (e as Map)['distanceM'] == null), isTrue);
      expect((stripped['meta'] as Map)['center'], isNull);
      final detail = stripLocation(chargingFixture('detail_en')) as Map;
      expect((detail['data'] as Map)['distanceM'], isNull);
    });

    test('cache key does not contain the reference point', () {
      const a = SearchPlace(point: GeoPoint(30.1, 31.2), kind: PlaceKind.device);
      const b = SearchPlace(point: GeoPoint(30.2, 31.3), kind: PlaceKind.device);
      const bounds = GeoBounds(south: 29.9, west: 31.1, north: 30.1, east: 31.4);
      expect(
        StationsRepository.searchCacheVariant(const SearchArea.bounds(bounds, place: a), StationFilters.empty),
        StationsRepository.searchCacheVariant(const SearchArea.bounds(bounds, place: b), StationFilters.empty),
      );
    });

    test('haversine distance', () {
      // 0.009° of latitude ≈ 1 km.
      expect(haversineMeters(30, 31, 30.009, 31), closeTo(1000.8, 2));
    });

    test('city presets cover the launch markets', () {
      for (final m in ['EG', 'SA', 'AE']) {
        expect(citiesFor(m).first.marketCode, m);
        expect(defaultCityFor(m).marketCode, m);
      }
      expect(cityById('eg-cairo')!.nameAr, 'القاهرة');
    });
  });

  group('directions', () {
    test('android offers the system chooser (geo:) first, then apps', () {
      final o = directionsOptions(lat: 30.0444, lng: 31.2357, label: 'X (1)', platform: TargetPlatform.android);
      expect(o.first.app, NavigationApp.systemChooser);
      expect(o.first.uri.scheme, 'geo');
      expect(o.first.uri.toString(), startsWith('geo:30.044400,31.235700?q=30.044400,31.235700'));
      expect(o.map((x) => x.app), containsAll([NavigationApp.googleMaps, NavigationApp.waze]));
      expect(o.firstWhere((x) => x.app == NavigationApp.googleMaps).fallback!.host, 'www.google.com');
    });

    test('iOS uses Apple Maps, web preview a web map', () {
      final ios = directionsOptions(lat: 1, lng: 2, platform: TargetPlatform.iOS);
      expect(ios.first.app, NavigationApp.appleMaps);
      expect(ios.first.uri.host, 'maps.apple.com');
      final web = directionsOptions(lat: 1, lng: 2, platform: TargetPlatform.android, webPreview: true);
      expect(web.single.app, NavigationApp.webMap);
    });

    test('falls back when the app is missing', () async {
      final opened = <Uri>[];
      Future<bool> launch(Uri u) async {
        opened.add(u);
        return u.scheme == 'https';
      }

      final o = directionsOptions(lat: 1, lng: 2, platform: TargetPlatform.android)
          .firstWhere((x) => x.app == NavigationApp.googleMaps);
      expect(await openDirections(launch, o), isTrue);
      expect(opened.map((u) => u.scheme), ['google.navigation', 'https']);
    });
  });
}
