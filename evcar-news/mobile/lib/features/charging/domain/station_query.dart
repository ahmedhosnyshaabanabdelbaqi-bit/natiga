import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import 'station_models.dart';

/// A geographic rectangle (`bbox=minLng,minLat,maxLng,maxLat`).
@immutable
class GeoBounds {
  const GeoBounds({required this.south, required this.west, required this.north, required this.east});

  final double south;
  final double west;
  final double north;
  final double east;

  /// Clamped to valid coordinates; antimeridian crossing is not supported by
  /// the API, so a box that crosses it is cut at ±180.
  GeoBounds clamped() => GeoBounds(
    south: south.clamp(-90, 90),
    north: north.clamp(-90, 90),
    west: west.clamp(-180, 180),
    east: east.clamp(-180, 180),
  );

  double get centerLat => (south + north) / 2;
  double get centerLng => (west + east) / 2;

  bool contains(double lat, double lng) => lat >= south && lat <= north && lng >= west && lng <= east;

  /// Rounded to 5 decimals (~1 m) so tiny camera jitter does not refetch.
  String toQuery() {
    String f(double v) => v.toStringAsFixed(5);
    final c = clamped();
    return '${f(c.west)},${f(c.south)},${f(c.east)},${f(c.north)}';
  }

  @override
  bool operator ==(Object other) => other is GeoBounds && other.toQuery() == toQuery();

  @override
  int get hashCode => toQuery().hashCode;
}

/// A point on the map with an optional label (user location, chosen city,
/// long-pressed point).
@immutable
class GeoPoint {
  const GeoPoint(this.lat, this.lng);

  final double lat;
  final double lng;

  @override
  bool operator ==(Object other) => other is GeoPoint && other.lat == lat && other.lng == lng;

  @override
  int get hashCode => Object.hash(lat, lng);
}

/// Where the reference point of a search comes from.
enum PlaceKind {
  /// The device location (kept in memory only, never stored).
  device,

  /// A city picked from the list.
  city,

  /// A point the user long-pressed / picked on the map.
  mapPoint,

  /// The market's default city, used until the user chooses anything.
  marketDefault,
}

/// Reference place for distances and "around a point" searches.
@immutable
class SearchPlace {
  const SearchPlace({required this.point, required this.kind, this.label, this.cityId});

  final GeoPoint point;
  final PlaceKind kind;

  /// City name for [PlaceKind.city] / [PlaceKind.marketDefault].
  final String? label;
  final String? cityId;

  @override
  bool operator ==(Object other) =>
      other is SearchPlace && other.point == point && other.kind == kind && other.cityId == cityId;

  @override
  int get hashCode => Object.hash(point, kind, cityId);
}

/// The area a search covers: the visible map rectangle ([bounds]) or a
/// radius around [place].
@immutable
class SearchArea {
  const SearchArea.bounds(GeoBounds this.bounds, {this.place, this.zoom}) : radiusKm = null;

  const SearchArea.around(SearchPlace this.place, {this.radiusKm = defaultRadiusKm}) : bounds = null, zoom = null;

  static const double defaultRadiusKm = 25;

  final GeoBounds? bounds;

  /// Reference place (distance + sort); may be null for a map area search.
  final SearchPlace? place;
  final double? radiusKm;

  /// Map zoom when [bounds] come from the map (clusters under 9).
  final double? zoom;

  bool get isBounds => bounds != null;

  @override
  bool operator ==(Object other) =>
      other is SearchArea &&
      other.bounds == bounds &&
      other.place == place &&
      other.radiusKm == radiusKm &&
      other.zoom?.round() == zoom?.round();

  @override
  int get hashCode => Object.hash(bounds, place, radiusKm, zoom?.round());

  /// Geo part of the query. Coordinates of the reference point are rounded
  /// to 4 decimals (~11 m) — enough for distances, less identifying.
  Map<String, String> toQuery() {
    String r(double v) => v.toStringAsFixed(4);
    final q = <String, String>{};
    if (bounds != null) q['bbox'] = bounds!.toQuery();
    final p = place;
    if (p != null) {
      q['lat'] = r(p.point.lat);
      q['lng'] = r(p.point.lng);
    }
    if (bounds == null && radiusKm != null) q['radiusKm'] = radiusKm!.toStringAsFixed(0);
    return q;
  }
}

/// A car to check connector compatibility for.
@immutable
class CompatVehicle {
  const CompatVehicle.garage({required String this.userVehicleId, required this.name}) : variantId = null;

  const CompatVehicle.catalog({required String this.variantId, required this.name}) : userVehicleId = null;

  final String? userVehicleId;
  final String? variantId;
  final String name;

  Map<String, String> toQuery() => {
    'userVehicleId': ?userVehicleId,
    'vehicleVariantId': ?variantId,
  };

  @override
  bool operator ==(Object other) =>
      other is CompatVehicle && other.userVehicleId == userVehicleId && other.variantId == variantId;

  @override
  int get hashCode => Object.hash(userVehicleId, variantId);
}

/// Station filters (sheet + `/charging/filters`).
@immutable
class StationFilters {
  const StationFilters({
    this.query = '',
    this.connectorTypes = const {},
    this.current,
    this.minPowerKw,
    this.openNow = false,
    this.publicOnly = false,
    this.operatorNames = const {},
    this.amenities = const {},
    this.vehicle,
  });

  /// Text search on name / address / city.
  final String query;
  final Set<String> connectorTypes;
  final CurrentType? current;

  /// Only connectors with a KNOWN power ≥ this value.
  final double? minPowerKw;
  final bool openNow;
  final bool publicOnly;
  /// Operators, matched by name on the loaded results (the list endpoint
  /// returns operator names but not ids, so this filter is applied on the
  /// device and is not sent to the server).
  final Set<String> operatorNames;
  final Set<String> amenities;

  /// "Compatible with my car" (only compatible stations are listed).
  final CompatVehicle? vehicle;

  static const empty = StationFilters();

  /// Power presets offered in the UI (kW).
  static const powerPresets = <double>[7, 22, 50, 100, 150];

  /// Number of active filters, excluding the text query.
  int get activeCount =>
      connectorTypes.length +
      (current != null ? 1 : 0) +
      (minPowerKw != null ? 1 : 0) +
      (openNow ? 1 : 0) +
      (publicOnly ? 1 : 0) +
      operatorNames.length +
      amenities.length +
      (vehicle != null ? 1 : 0);

  bool get isEmpty => activeCount == 0 && query.trim().isEmpty;

  StationFilters copyWith({
    String? query,
    Set<String>? connectorTypes,
    CurrentType? Function()? current,
    double? Function()? minPowerKw,
    bool? openNow,
    bool? publicOnly,
    Set<String>? operatorNames,
    Set<String>? amenities,
    CompatVehicle? Function()? vehicle,
  }) => StationFilters(
    query: query ?? this.query,
    connectorTypes: connectorTypes ?? this.connectorTypes,
    current: current != null ? current() : this.current,
    minPowerKw: minPowerKw != null ? minPowerKw() : this.minPowerKw,
    openNow: openNow ?? this.openNow,
    publicOnly: publicOnly ?? this.publicOnly,
    operatorNames: operatorNames ?? this.operatorNames,
    amenities: amenities ?? this.amenities,
    vehicle: vehicle != null ? vehicle() : this.vehicle,
  );

  /// Every filter removed, the text search kept ("Clear filters").
  StationFilters cleared() => StationFilters(query: query);

  /// Query parameters (sorted lists so equal filters give equal cache keys).
  Map<String, String> toQuery() {
    String join(Set<String> s) => (s.toList()..sort()).join(',');
    final q = <String, String>{};
    final text = query.trim();
    if (text.isNotEmpty) q['q'] = text;
    if (connectorTypes.isNotEmpty) q['connectorTypes'] = join(connectorTypes);
    if (current != null) q['current'] = current!.apiValue;
    if (minPowerKw != null) q['minPowerKw'] = minPowerKw!.toStringAsFixed(0);
    if (openNow) q['openNow'] = 'true';
    if (publicOnly) q['access'] = 'public';
    if (amenities.isNotEmpty) q['amenities'] = join(amenities);
    if (vehicle != null) q.addAll(vehicle!.toQuery());
    return q;
  }

  /// Whether [s] passes the device-side filters ([operatorNames]).
  bool matchesLocally(StationListItem s) => operatorNames.isEmpty || operatorNames.contains(s.operatorName);

  @override
  bool operator ==(Object other) =>
      other is StationFilters && mapEquals(other.toQuery(), toQuery()) && setEquals(other.operatorNames, operatorNames);

  @override
  int get hashCode => Object.hash(
    Object.hashAllUnordered(toQuery().entries.map((e) => '${e.key}=${e.value}')),
    Object.hashAllUnordered(operatorNames),
  );
}

/// Great-circle distance in metres (haversine, mean Earth radius). Used only
/// to recompute distances client-side for saved (offline) results — the live
/// API returns geodesic distances.
double haversineMeters(double lat1, double lng1, double lat2, double lng2) {
  const r = 6371008.8;
  double rad(double d) => d * math.pi / 180;
  final dLat = rad(lat2 - lat1);
  final dLng = rad(lng2 - lng1);
  final a =
      math.sin(dLat / 2) * math.sin(dLat / 2) +
      math.cos(rad(lat1)) * math.cos(rad(lat2)) * math.sin(dLng / 2) * math.sin(dLng / 2);
  return 2 * r * math.asin(math.min(1, math.sqrt(a)));
}
