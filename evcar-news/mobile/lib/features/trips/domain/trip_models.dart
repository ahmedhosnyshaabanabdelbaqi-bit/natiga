import 'package:flutter/foundation.dart';

import '../../../core/json/json_readers.dart';

/// A trip end point.
@immutable
class TripPoint {
  const TripPoint({required this.lat, required this.lng, this.label});

  final double lat;
  final double lng;
  final String? label;

  Map<String, Object?> toJson() => {'lat': lat, 'lng': lng, if (label != null && label!.isNotEmpty) 'label': label};

  static TripPoint? tryParse(Map<String, dynamic>? j) {
    if (j == null) return null;
    final lat = j.doubleOrNull('lat');
    final lng = j.doubleOrNull('lng');
    if (lat == null || lng == null) return null;
    return TripPoint(lat: lat, lng: lng, label: j.stringOrNull('label'));
  }
}

/// `POST /trips/plan` body (backend-personal.md §7). Exactly one of
/// [userVehicleId] / [variantId].
@immutable
class TripPlanRequest {
  const TripPlanRequest({
    required this.origin,
    required this.destination,
    this.userVehicleId,
    this.variantId,
    required this.currentSocPercent,
    required this.minArrivalSocPercent,
    this.departureAt,
    this.save = false,
    this.title,
    this.assumptions = const {},
  });

  final TripPoint origin;
  final TripPoint destination;
  final String? userVehicleId;
  final String? variantId;
  final num currentSocPercent;
  final num minArrivalSocPercent;
  final DateTime? departureAt;
  final bool save;
  final String? title;

  /// Optional overrides: consumptionKwhPer100km, batteryUsableKwh,
  /// consumptionMarginPercent, chargeToSocPercent, corridorKm, efficiency,
  /// electricityPricePerKwh (+ currency, priceDate).
  final Map<String, Object?> assumptions;

  Map<String, Object?> toJson() => {
    'origin': origin.toJson(),
    'destination': destination.toJson(),
    'userVehicleId': ?userVehicleId,
    'variantId': ?variantId,
    'currentSocPercent': currentSocPercent,
    'minArrivalSocPercent': minArrivalSocPercent,
    if (departureAt != null) 'departureAt': departureAt!.toUtc().toIso8601String(),
    if (save) 'save': true,
    if (save && title != null && title!.trim().isNotEmpty) 'title': title!.trim(),
    if (assumptions.isNotEmpty) 'assumptions': assumptions,
  };
}

@immutable
class MinutesRange {
  const MinutesRange(this.low, this.high);

  final double low;
  final double high;

  static MinutesRange? tryParse(Map<String, dynamic>? j) {
    if (j == null) return null;
    final lo = j.doubleOrNull('low');
    final hi = j.doubleOrNull('high');
    return lo == null || hi == null ? null : MinutesRange(lo, hi);
  }
}

@immutable
class TripStation {
  const TripStation({
    required this.id,
    required this.name,
    required this.lat,
    required this.lng,
    this.address,
    this.city,
    this.connectorType,
    this.currentType,
    this.maxUsablePowerKw,
    this.operationalStatus,
    this.accessType,
    this.accessRestrictions,
    required this.openAtEta,
    this.openingHoursText,
    required this.availabilityStatus,
    required this.availabilityFreshness,
    this.availabilityObservedAt,
    this.statusConfidence,
  });

  final String id;
  final String name;
  final double lat;
  final double lng;
  final String? address;
  final String? city;
  final String? connectorType;
  final String? currentType;
  final double? maxUsablePowerKw;
  final String? operationalStatus;
  final String? accessType;
  final String? accessRestrictions;

  /// open | closed | unknown.
  final String openAtEta;
  final String? openingHoursText;

  /// available | occupied | out_of_order | unknown (at planning time only).
  final String availabilityStatus;

  /// live | expired | none.
  final String availabilityFreshness;
  final DateTime? availabilityObservedAt;
  final String? statusConfidence;

  factory TripStation.fromJson(Map<String, dynamic> j) {
    final s = j.objectOrNull('station') ?? j;
    final conn = j.objectOrNull('connector') ?? const <String, dynamic>{};
    final type = conn.objectOrNull('type');
    final av = j.objectOrNull('availabilityNow') ?? const <String, dynamic>{};
    return TripStation(
      id: s.stringOrNull('id') ?? '',
      name: s.stringOrNull('name') ?? '',
      lat: s.doubleOrNull('lat') ?? 0,
      lng: s.doubleOrNull('lng') ?? 0,
      address: s.stringOrNull('address'),
      city: s.stringOrNull('city'),
      connectorType: type?.stringOrNull('name') ?? type?.stringOrNull('code'),
      currentType: conn.stringOrNull('currentType'),
      maxUsablePowerKw: conn.doubleOrNull('maxUsablePowerKw'),
      operationalStatus: j.stringOrNull('operationalStatus'),
      accessType: j.stringOrNull('accessType'),
      accessRestrictions: j.stringOrNull('accessRestrictions'),
      openAtEta: j.stringOrNull('openAtEta') ?? 'unknown',
      openingHoursText: j.stringOrNull('openingHoursText'),
      availabilityStatus: av.stringOrNull('status') ?? 'unknown',
      availabilityFreshness: av.stringOrNull('freshness') ?? 'none',
      availabilityObservedAt: av.dateTimeOrNull('observedAt'),
      statusConfidence: j.stringOrNull('statusConfidence'),
    );
  }
}

@immutable
class TripStop {
  const TripStop({
    required this.index,
    required this.station,
    this.positionKm,
    this.detourKm,
    this.etaEarliest,
    this.etaLatest,
    this.arrivalSocPercent,
    this.departureSocPercent,
    this.chargeKwh,
    this.chargeMinutes,
    this.chargeMinutesRange,
    this.chargeMethod,
    this.alternative,
    this.notes = const [],
  });

  final int index;
  final TripStation station;
  final double? positionKm;
  final double? detourKm;
  final DateTime? etaEarliest;
  final DateTime? etaLatest;
  final double? arrivalSocPercent;
  final double? departureSocPercent;
  final double? chargeKwh;
  final double? chargeMinutes;
  final MinutesRange? chargeMinutesRange;
  final String? chargeMethod;
  final TripStation? alternative;
  final List<String> notes;

  factory TripStop.fromJson(Map<String, dynamic> j) {
    final eta = j.objectOrNull('etaAt');
    final alt = j.objectOrNull('alternative');
    return TripStop(
      index: j.intOrNull('index') ?? 0,
      station: TripStation.fromJson(j),
      positionKm: j.doubleOrNull('positionKm'),
      detourKm: j.doubleOrNull('detourKm'),
      etaEarliest: eta?.dateTimeOrNull('earliest'),
      etaLatest: eta?.dateTimeOrNull('latest'),
      arrivalSocPercent: j.doubleOrNull('arrivalSocPercent'),
      departureSocPercent: j.doubleOrNull('departureSocPercent'),
      chargeKwh: j.doubleOrNull('chargeKwh'),
      chargeMinutes: j.doubleOrNull('chargeMinutes'),
      chargeMinutesRange: MinutesRange.tryParse(j.objectOrNull('chargeMinutesRange')),
      chargeMethod: j.stringOrNull('chargeMethod'),
      alternative: alt == null ? null : TripStation.fromJson(alt),
      notes: j.stringList('notes'),
    );
  }
}

@immutable
class TripLeg {
  const TripLeg({
    required this.index,
    this.distanceKm,
    this.durationMinutes,
    this.energyKwh,
    this.departureSocPercent,
    this.arrivalSocPercent,
  });

  final int index;
  final double? distanceKm;
  final double? durationMinutes;
  final double? energyKwh;
  final double? departureSocPercent;
  final double? arrivalSocPercent;

  factory TripLeg.fromJson(Map<String, dynamic> j) => TripLeg(
    index: j.intOrNull('index') ?? 0,
    distanceKm: j.doubleOrNull('distanceKm'),
    durationMinutes: j.doubleOrNull('durationMinutes'),
    energyKwh: j.doubleOrNull('energyKwh'),
    departureSocPercent: j.doubleOrNull('departureSocPercent'),
    arrivalSocPercent: j.doubleOrNull('arrivalSocPercent'),
  );
}

@immutable
class TripAssumption {
  const TripAssumption({required this.key, required this.label, this.value, this.unit, required this.origin, this.note});

  final String key;
  final String label;
  final Object? value;
  final String? unit;
  final String origin;
  final String? note;

  factory TripAssumption.fromJson(Map<String, dynamic> j) => TripAssumption(
    key: j.stringOrNull('key') ?? '',
    label: j.stringOrNull('label') ?? j.stringOrNull('key') ?? '',
    value: j['value'],
    unit: j.stringOrNull('unit'),
    origin: j.stringOrNull('origin') ?? 'user',
    note: j.stringOrNull('note'),
  );
}

@immutable
class TripPlan {
  const TripPlan({
    required this.routingProvider,
    this.routingAttribution,
    this.vehicleName,
    this.origin,
    this.destination,
    this.departureAt,
    this.distanceKm,
    this.driveMinutes,
    this.chargingMinutes,
    this.totalMinutes,
    required this.stopCount,
    this.energyUsedKwh,
    this.energyChargedKwh,
    this.arrivalSocPercent,
    this.costAmount,
    this.costCurrency,
    this.costNote,
    required this.legs,
    required this.stops,
    required this.assumptions,
    required this.warnings,
    required this.confidence,
    required this.geometry,
    this.disclaimer,
    this.savedPlanId,
  });

  final String routingProvider;
  final String? routingAttribution;
  final String? vehicleName;
  final TripPoint? origin;
  final TripPoint? destination;
  final DateTime? departureAt;
  final double? distanceKm;
  final double? driveMinutes;
  final MinutesRange? chargingMinutes;
  final MinutesRange? totalMinutes;
  final int stopCount;
  final double? energyUsedKwh;
  final double? energyChargedKwh;
  final double? arrivalSocPercent;
  final String? costAmount;
  final String? costCurrency;
  final String? costNote;
  final List<TripLeg> legs;
  final List<TripStop> stops;
  final List<TripAssumption> assumptions;
  final List<({String code, String message})> warnings;
  final String confidence;

  /// `[lat, lng]` pairs (converted from GeoJSON `[lng, lat]`).
  final List<(double, double)> geometry;
  final String? disclaimer;
  final String? savedPlanId;

  factory TripPlan.fromJson(Map<String, dynamic> j) {
    final routing = j.objectOrNull('routing') ?? const <String, dynamic>{};
    final vehicle = j.objectOrNull('vehicle');
    final s = j.objectOrNull('summary') ?? const <String, dynamic>{};
    final cost = s.objectOrNull('cost');
    final geo = j.objectOrNull('geometry');
    final coords = geo?['coordinates'];
    return TripPlan(
      routingProvider: routing.stringOrNull('provider') ?? '',
      routingAttribution: routing.stringOrNull('attribution'),
      vehicleName: vehicle?.stringOrNull('name'),
      origin: TripPoint.tryParse(j.objectOrNull('origin')),
      destination: TripPoint.tryParse(j.objectOrNull('destination')),
      departureAt: j.dateTimeOrNull('departureAt'),
      distanceKm: s.doubleOrNull('distanceKm'),
      driveMinutes: s.doubleOrNull('driveMinutes'),
      chargingMinutes: MinutesRange.tryParse(s.objectOrNull('chargingMinutes')),
      totalMinutes: MinutesRange.tryParse(s.objectOrNull('totalMinutes')),
      stopCount: s.intOrNull('stops') ?? 0,
      energyUsedKwh: s.doubleOrNull('energyUsedKwh'),
      energyChargedKwh: s.doubleOrNull('energyChargedKwh'),
      arrivalSocPercent: s.doubleOrNull('arrivalSocPercent'),
      costAmount: cost?.stringOrNull('amount'),
      costCurrency: cost?.stringOrNull('currency'),
      costNote: cost?.stringOrNull('note'),
      legs: j.objectList('legs', TripLeg.fromJson),
      stops: j.objectList('stops', TripStop.fromJson),
      assumptions: j.objectList('assumptions', TripAssumption.fromJson),
      warnings: j.objectList(
        'warnings',
        (w) => (code: w.stringOrNull('code') ?? '', message: w.stringOrNull('message') ?? ''),
      ),
      confidence: j.stringOrNull('confidence') ?? 'low',
      geometry: [
        if (coords is List)
          for (final c in coords)
            if (c is List && c.length >= 2 && c[0] is num && c[1] is num)
              ((c[1] as num).toDouble(), (c[0] as num).toDouble()),
      ],
      disclaimer: j.stringOrNull('disclaimer'),
      savedPlanId: j.stringOrNull('savedPlanId'),
    );
  }

  static TripPlan fromJsonValue(Object? data) => TripPlan.fromJson(asJsonObject(data, 'plan'));
}

/// `GET /me/trips` item.
@immutable
class SavedTrip {
  const SavedTrip({
    required this.id,
    this.title,
    this.originLabel,
    this.destinationLabel,
    this.plannedDepartureAt,
    this.distanceKm,
    this.stops,
    this.createdAt,
  });

  final String id;
  final String? title;
  final String? originLabel;
  final String? destinationLabel;
  final DateTime? plannedDepartureAt;
  final double? distanceKm;
  final int? stops;
  final DateTime? createdAt;

  factory SavedTrip.fromJson(Map<String, dynamic> j) {
    final s = j.objectOrNull('summary') ?? const <String, dynamic>{};
    return SavedTrip(
      id: j.requireString('id'),
      title: j.stringOrNull('title'),
      originLabel: j.stringOrNull('originLabel'),
      destinationLabel: j.stringOrNull('destinationLabel'),
      plannedDepartureAt: j.dateTimeOrNull('plannedDepartureAt'),
      distanceKm: s.doubleOrNull('distanceKm'),
      stops: s.intOrNull('stops'),
      createdAt: j.dateTimeOrNull('createdAt'),
    );
  }
}
