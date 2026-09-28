import 'dart:convert';
import 'dart:io';

import 'package:evcar_news/features/charging/data/location_service.dart';
import 'package:evcar_news/features/charging/domain/station_query.dart';

/// Responses captured from the real backend running the demo seed (own
/// database, fictional demo rows only) — see docs/decisions/mobile-home-search.md.
Map<String, dynamic> discoveryFixture(String name) =>
    jsonDecode(File('test/features/discovery/fixtures/$name.json').readAsStringSync()) as Map<String, dynamic>;

Map<String, dynamic> copyJson(Map<String, dynamic> json) => jsonDecode(jsonEncode(json)) as Map<String, dynamic>;

/// Location service that never touches the plugin.
class FakeLocationService implements LocationService {
  FakeLocationService({this.access = LocationAccess.denied, this.position});

  LocationAccess access;
  GeoPoint? position;
  int requests = 0;

  @override
  Future<LocationAccess> check() async => access;

  @override
  Future<LocationAccess> request() async {
    requests++;
    return access;
  }

  @override
  Future<GeoPoint?> currentPosition() async => access == LocationAccess.granted ? position : null;

  @override
  Future<bool> openAppSettings() async => true;

  @override
  Future<bool> openLocationSettings() async => true;
}
