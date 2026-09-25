import 'package:evcar_news/core/app_config/app_config.dart';
import 'package:evcar_news/core/app_config/features.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('maps locations to their feature', () {
    expect(featureForLocation('/news/x'), Features.news);
    expect(featureForLocation('/cars'), Features.cars);
    expect(featureForLocation('/brands/byd'), Features.cars);
    expect(featureForLocation('/cars/byd-seal/tour/t1'), Features.interiorTours);
    expect(featureForLocation('/compare/s/abc'), Features.comparisons);
    expect(featureForLocation('/charging/stations/1'), Features.stations);
    expect(featureForLocation('/charging-logs'), Features.chargingLogs);
    expect(featureForLocation('/services'), Features.servicesDirectory);
    for (final always in ['/', '/account', '/account/profile', '/settings', '/saved', '/auth/login']) {
      expect(featureForLocation(always), isNull, reason: always);
    }
  });

  test('search is available when any searchable content is on', () {
    expect(isLocationEnabled('/search', (_) => false), isFalse);
    expect(isLocationEnabled('/search', (f) => f == Features.stations), isTrue);
  });

  test('home sections of disabled features are hidden, order kept', () {
    final config = AppConfig.fromJson({
      'homeSections': [
        {'key': 'nearby_stations', 'enabled': true, 'order': 2},
        {'key': 'latest_news', 'enabled': true, 'order': 1},
        {'key': 'new_cars', 'enabled': true, 'order': 3},
        {'key': 'interior_tours', 'enabled': false, 'order': 4},
        {'key': 'unknown_section', 'enabled': true, 'order': 5},
      ],
      'features': {'news': true, 'stations': true, 'interiorTours': true},
    });
    expect(visibleHomeSections(config).map((s) => s.key), ['latest_news', 'nearby_stations']);
  });
}
