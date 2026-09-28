import 'package:flutter/foundation.dart';

import '../../../core/json/json_readers.dart';

/// Hand-written models for the stations API (docs/decisions/backend-stations.md
/// §1). Missing values stay `null` (rendered "غير متوفر / Not available"),
/// never 0. Unknown enum words from the server map to `unknown`, never to a
/// hopeful value such as "available".

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/// `operationalStatus` — what the data says about the site (not "open now",
/// not live availability).
enum OperationalStatus {
  operational,
  planned,
  temporarilyUnavailable,
  permanentlyClosed,
  unknown;

  static OperationalStatus parse(String? v) => switch (v) {
    'operational' => operational,
    'planned' => planned,
    'temporarily_unavailable' => temporarilyUnavailable,
    'permanently_closed' => permanentlyClosed,
    _ => unknown,
  };

  String get apiValue => switch (this) {
    operational => 'operational',
    planned => 'planned',
    temporarilyUnavailable => 'temporarily_unavailable',
    permanentlyClosed => 'permanently_closed',
    unknown => 'unknown',
  };
}

/// Opening hours evaluated for "now" in the station's time zone.
enum OpenState {
  open,
  closed,
  unknown;

  static OpenState parse(String? v) => switch (v) {
    'open' => open,
    'closed' => closed,
    _ => unknown,
  };
}

/// Live availability (only from a live provider, before expiry).
enum AvailabilityStatus {
  available,
  occupied,
  outOfOrder,
  unknown;

  static AvailabilityStatus parse(String? v) => switch (v) {
    'available' => available,
    'occupied' => occupied,
    'out_of_order' => outOfOrder,
    _ => unknown,
  };

  String get apiValue => switch (this) {
    available => 'available',
    occupied => 'occupied',
    outOfOrder => 'out_of_order',
    unknown => 'unknown',
  };
}

/// Whether a connector's availability reading is live, expired or missing.
enum AvailabilityFreshness {
  live,
  expired,
  none;

  static AvailabilityFreshness parse(String? v) => switch (v) {
    'live' => live,
    'expired' => expired,
    _ => none,
  };
}

/// `AC` / `DC`.
enum CurrentType {
  ac,
  dc;

  static CurrentType? parse(String? v) => switch (v?.toUpperCase()) {
    'AC' => ac,
    'DC' => dc,
    _ => null,
  };

  String get apiValue => this == ac ? 'AC' : 'DC';
}

// ---------------------------------------------------------------------------
// Small shared shapes
// ---------------------------------------------------------------------------

/// `{code, label}` reference entry (amenities, payment methods, …).
@immutable
class CodeLabel {
  const CodeLabel(this.code, this.label);

  final String code;
  final String label;

  static CodeLabel? tryParse(Object? json) {
    if (json is! Map) return null;
    final m = asJsonObject(json);
    final code = m.stringOrNull('code');
    if (code == null || code.isEmpty) return null;
    return CodeLabel(code, m.stringOrNull('label') ?? code);
  }

  static List<CodeLabel> listFrom(Object? json) => json is List ? [for (final e in json) ?tryParse(e)] : const [];

  Map<String, dynamic> toJson() => {'code': code, 'label': label};

  @override
  bool operator ==(Object other) => other is CodeLabel && other.code == code && other.label == label;

  @override
  int get hashCode => Object.hash(code, label);
}

/// Money from a decimal string (`{amount: "5.0000", currency: "EGP"}`).
@immutable
class Money {
  const Money(this.amount, this.currency);

  final String amount;
  final String currency;

  static Money? tryParse(Object? json) {
    if (json is! Map) return null;
    final m = asJsonObject(json);
    final amount = m.stringOrNull('amount');
    final currency = m.stringOrNull('currency');
    if (amount == null || currency == null || num.tryParse(amount) == null) return null;
    return Money(amount, currency);
  }
}

/// Parses a server timestamp (UTC) — `null` for anything unparsable.
DateTime? _date(Map<String, dynamic> m, String key) => m.dateTimeOrNull(key)?.toUtc();

// ---------------------------------------------------------------------------
// List / map search
// ---------------------------------------------------------------------------

/// Station-level live availability summary of the list endpoint.
@immutable
class AvailabilitySummary {
  const AvailabilitySummary({required this.status, this.availableConnectors, this.liveConnectors = 0});

  final AvailabilityStatus status;

  /// `null` when no connector has live data (never 0 in that case).
  final int? availableConnectors;
  final int liveConnectors;

  static const unknown = AvailabilitySummary(status: AvailabilityStatus.unknown);

  factory AvailabilitySummary.fromJson(Map<String, dynamic>? m) {
    if (m == null) return unknown;
    return AvailabilitySummary(
      status: AvailabilityStatus.parse(m.stringOrNull('status')),
      availableConnectors: m.intOrNull('availableConnectors'),
      liveConnectors: m.intOrNull('liveConnectors') ?? 0,
    );
  }

  Map<String, dynamic> toJson() => {
    'status': status.apiValue,
    'availableConnectors': availableConnectors,
    'liveConnectors': liveConnectors,
  };
}

/// Compatibility of a station with the chosen car (list endpoint).
@immutable
class StationCompatibilitySummary {
  const StationCompatibilitySummary({required this.compatibleConnectors, this.maxUsablePowerKw});

  final int compatibleConnectors;
  final double? maxUsablePowerKw;

  static StationCompatibilitySummary? tryParse(Map<String, dynamic>? m) {
    if (m == null) return null;
    return StationCompatibilitySummary(
      compatibleConnectors: m.intOrNull('compatibleConnectors') ?? 0,
      maxUsablePowerKw: m.doubleOrNull('maxUsablePowerKw'),
    );
  }

  Map<String, dynamic> toJson() => {'compatibleConnectors': compatibleConnectors, 'maxUsablePowerKw': maxUsablePowerKw};
}

/// One row of `GET /stations`.
@immutable
class StationListItem {
  const StationListItem({
    required this.id,
    required this.name,
    required this.latitude,
    required this.longitude,
    this.slug,
    this.operatorName,
    this.distanceM,
    this.city,
    this.countryCode,
    this.accessType,
    this.operationalStatus = OperationalStatus.unknown,
    this.openNow = OpenState.unknown,
    this.isAlwaysOpen,
    this.maxPowerKw,
    this.currentTypes = const [],
    this.connectorTypes = const [],
    this.connectorCount,
    this.pointCount,
    this.availability = AvailabilitySummary.unknown,
    this.compatibility,
    this.isDemo = false,
    this.dataSource,
  });

  final String id;
  final String? slug;
  final String name;
  final String? operatorName;
  final double latitude;
  final double longitude;
  final double? distanceM;
  final String? city;
  final String? countryCode;
  final String? accessType;
  final OperationalStatus operationalStatus;
  final OpenState openNow;
  final bool? isAlwaysOpen;
  final double? maxPowerKw;
  final List<CurrentType> currentTypes;
  final List<String> connectorTypes;

  /// Number of plugs — NOT the number of cars that can charge at once.
  final int? connectorCount;

  /// Modelled / published charge points; `null` when unknown.
  final int? pointCount;
  final AvailabilitySummary availability;
  final StationCompatibilitySummary? compatibility;
  final bool isDemo;
  final String? dataSource;

  /// Parses one row; `null` when the row has no id/name/coordinates (skipped).
  static StationListItem? tryParse(Object? json) {
    if (json is! Map) return null;
    final m = asJsonObject(json);
    final id = m.stringOrNull('id');
    final name = m.stringOrNull('name');
    final lat = m.doubleOrNull('latitude');
    final lng = m.doubleOrNull('longitude');
    if (id == null || id.isEmpty || name == null || lat == null || lng == null) return null;
    if (lat.abs() > 90 || lng.abs() > 180) return null;
    return StationListItem(
      id: id,
      slug: m.stringOrNull('slug'),
      name: name,
      operatorName: m.stringOrNull('operatorName'),
      latitude: lat,
      longitude: lng,
      distanceM: m.doubleOrNull('distanceM'),
      city: m.stringOrNull('city'),
      countryCode: m.stringOrNull('countryCode'),
      accessType: m.stringOrNull('accessType'),
      operationalStatus: OperationalStatus.parse(m.stringOrNull('operationalStatus')),
      openNow: OpenState.parse(m.stringOrNull('openNow')),
      isAlwaysOpen: m.boolOrNull('isAlwaysOpen'),
      maxPowerKw: m.doubleOrNull('maxPowerKw'),
      currentTypes: [for (final c in m.stringList('currentTypes')) ?CurrentType.parse(c)],
      connectorTypes: m.stringList('connectorTypes'),
      connectorCount: m.intOrNull('connectorCount'),
      pointCount: m.intOrNull('pointCount'),
      availability: AvailabilitySummary.fromJson(m.objectOrNull('availability')),
      compatibility: StationCompatibilitySummary.tryParse(m.objectOrNull('compatibility')),
      isDemo: m.boolOr('isDemo', false),
      dataSource: m.stringOrNull('dataSource'),
    );
  }

  StationListItem copyWith({double? Function()? distanceM}) => StationListItem(
    id: id,
    slug: slug,
    name: name,
    operatorName: operatorName,
    latitude: latitude,
    longitude: longitude,
    distanceM: distanceM != null ? distanceM() : this.distanceM,
    city: city,
    countryCode: countryCode,
    accessType: accessType,
    operationalStatus: operationalStatus,
    openNow: openNow,
    isAlwaysOpen: isAlwaysOpen,
    maxPowerKw: maxPowerKw,
    currentTypes: currentTypes,
    connectorTypes: connectorTypes,
    connectorCount: connectorCount,
    pointCount: pointCount,
    availability: availability,
    compatibility: compatibility,
    isDemo: isDemo,
    dataSource: dataSource,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'slug': slug,
    'name': name,
    'operatorName': operatorName,
    'latitude': latitude,
    'longitude': longitude,
    'distanceM': distanceM,
    'city': city,
    'countryCode': countryCode,
    'accessType': accessType,
    'operationalStatus': operationalStatus.apiValue,
    'openNow': openNow.name,
    'isAlwaysOpen': isAlwaysOpen,
    'maxPowerKw': maxPowerKw,
    'currentTypes': [for (final c in currentTypes) c.apiValue],
    'connectorTypes': connectorTypes,
    'connectorCount': connectorCount,
    'pointCount': pointCount,
    'availability': availability.toJson(),
    'compatibility': compatibility?.toJson(),
    'isDemo': isDemo,
    'dataSource': dataSource,
  };
}

/// Whether the deployment has a live availability provider.
@immutable
class LiveAvailabilityInfo {
  const LiveAvailabilityInfo({required this.configured, this.provider});

  final bool configured;
  final String? provider;

  static const none = LiveAvailabilityInfo(configured: false);

  factory LiveAvailabilityInfo.fromJson(Map<String, dynamic>? m) =>
      m == null ? none : LiveAvailabilityInfo(configured: m.boolOr('configured', false), provider: m.stringOrNull('provider'));
}

/// `GET /stations` page.
@immutable
class StationSearchPage {
  const StationSearchPage({
    required this.items,
    this.nextCursor,
    this.total,
    this.truncated = false,
    this.compatibility,
    this.liveAvailability = LiveAvailabilityInfo.none,
  });

  final List<StationListItem> items;
  final String? nextCursor;
  final int? total;

  /// More than the server's evaluation cap matched: zoom in / use clusters.
  final bool truncated;
  final VehicleCompatibility? compatibility;
  final LiveAvailabilityInfo liveAvailability;

  bool get hasMore => nextCursor != null && nextCursor!.isNotEmpty;

  factory StationSearchPage.fromBody(Object? body) {
    if (body is! Map) throw const FormatException('Expected a list envelope');
    final json = asJsonObject(body);
    final data = json['data'];
    if (data is! List) throw const FormatException('Expected data[]');
    final meta = json.objectOrNull('meta') ?? const <String, dynamic>{};
    return StationSearchPage(
      items: [for (final e in data) ?StationListItem.tryParse(e)],
      nextCursor: meta.stringOrNull('nextCursor'),
      total: meta.intOrNull('total'),
      truncated: meta.boolOr('truncated', false),
      compatibility: VehicleCompatibility.tryParse(meta.objectOrNull('compatibility')),
      liveAvailability: LiveAvailabilityInfo.fromJson(meta.objectOrNull('liveAvailability')),
    );
  }
}

/// One cell of `GET /stations/clusters`.
@immutable
class StationCluster {
  const StationCluster({required this.latitude, required this.longitude, required this.count, this.stationId});

  final double latitude;
  final double longitude;
  final int count;

  /// Set when the cell holds exactly one station.
  final String? stationId;

  static StationCluster? tryParse(Object? json) {
    if (json is! Map) return null;
    final m = asJsonObject(json);
    final lat = m.doubleOrNull('latitude');
    final lng = m.doubleOrNull('longitude');
    final count = m.intOrNull('count');
    if (lat == null || lng == null || count == null || count <= 0) return null;
    return StationCluster(latitude: lat, longitude: lng, count: count, stationId: m.stringOrNull('stationId'));
  }

  static List<StationCluster> listFromBody(Object? body) {
    if (body is! Map) throw const FormatException('Expected a list envelope');
    final data = body['data'];
    if (data is! List) throw const FormatException('Expected data[]');
    return [for (final e in data) ?tryParse(e)];
  }
}

// ---------------------------------------------------------------------------
// Compatibility with a car
// ---------------------------------------------------------------------------

@immutable
class VehicleInlet {
  const VehicleInlet({required this.connectorName, required this.currentType, this.maxPowerKw, this.reliability});

  final String connectorName;
  final CurrentType? currentType;
  final double? maxPowerKw;
  final String? reliability;
}

/// `VehicleCompatibility` (§3): which inlets of the car were used.
@immutable
class VehicleCompatibility {
  const VehicleCompatibility({
    required this.variantId,
    this.marketCode,
    this.vehicleName,
    this.inlets = const [],
    this.ignoredInlets = 0,
    this.note,
  });

  final String variantId;
  final String? marketCode;
  final String? vehicleName;
  final List<VehicleInlet> inlets;
  final int ignoredInlets;
  final String? note;

  static VehicleCompatibility? tryParse(Map<String, dynamic>? m) {
    if (m == null) return null;
    final id = m.stringOrNull('variantId');
    if (id == null) return null;
    return VehicleCompatibility(
      variantId: id,
      marketCode: m.stringOrNull('marketCode'),
      vehicleName: m.stringOrNull('vehicleName'),
      inlets: m.objectList('inlets', (i) {
        final ct = i.objectOrNull('connectorType');
        return VehicleInlet(
          connectorName: ct?.stringOrNull('name') ?? ct?.stringOrNull('code') ?? '',
          currentType: CurrentType.parse(i.stringOrNull('currentType')),
          maxPowerKw: i.doubleOrNull('maxPowerKw'),
          reliability: i.stringOrNull('reliability'),
        );
      }),
      ignoredInlets: m.intOrNull('ignoredInlets') ?? 0,
      note: m.stringOrNull('note'),
    );
  }
}

// ---------------------------------------------------------------------------
// Meta (filter reference data)
// ---------------------------------------------------------------------------

@immutable
class ConnectorTypeRef {
  const ConnectorTypeRef({
    required this.code,
    required this.name,
    this.supportsAc = false,
    this.supportsDc = false,
    this.standard,
  });

  final String code;
  final String name;
  final bool supportsAc;
  final bool supportsDc;
  final String? standard;

  static ConnectorTypeRef? tryParse(Object? json) {
    if (json is! Map) return null;
    final m = asJsonObject(json);
    final code = m.stringOrNull('code');
    if (code == null || code.isEmpty) return null;
    return ConnectorTypeRef(
      code: code,
      name: m.stringOrNull('name') ?? code,
      supportsAc: m.boolOr('supportsAc', false),
      supportsDc: m.boolOr('supportsDc', false),
      standard: m.stringOrNull('standard'),
    );
  }
}

@immutable
class ReportTypeRef {
  const ReportTypeRef({required this.code, required this.label, this.help, this.requiresDetails = false});

  final String code;
  final String label;
  final String? help;
  final bool requiresDetails;

  static ReportTypeRef? tryParse(Object? json) {
    if (json is! Map) return null;
    final m = asJsonObject(json);
    final code = m.stringOrNull('code');
    if (code == null || code.isEmpty) return null;
    return ReportTypeRef(
      code: code,
      label: m.stringOrNull('label') ?? code,
      help: m.stringOrNull('help'),
      requiresDetails: m.boolOr('requiresDetails', false),
    );
  }
}

/// `GET /stations/meta`.
@immutable
class StationMeta {
  const StationMeta({
    this.connectorTypes = const [],
    this.amenities = const [],
    this.paymentMethods = const [],
    this.startMethods = const [],
    this.accessTypes = const [],
    this.operationalStatuses = const [],
    this.checkinOutcomes = const [],
    this.reportTypes = const [],
    this.liveAvailability = LiveAvailabilityInfo.none,
  });

  final List<ConnectorTypeRef> connectorTypes;
  final List<CodeLabel> amenities;
  final List<CodeLabel> paymentMethods;
  final List<CodeLabel> startMethods;
  final List<CodeLabel> accessTypes;
  final List<CodeLabel> operationalStatuses;
  final List<CodeLabel> checkinOutcomes;
  final List<ReportTypeRef> reportTypes;
  final LiveAvailabilityInfo liveAvailability;

  factory StationMeta.fromData(Object? data) {
    final m = asJsonObject(data, 'meta');
    List<T> list<T>(String key, T? Function(Object?) parse) {
      final v = m[key];
      return v is List ? [for (final e in v) ?parse(e)] : const [];
    }

    return StationMeta(
      connectorTypes: list('connectorTypes', ConnectorTypeRef.tryParse),
      amenities: CodeLabel.listFrom(m['amenities']),
      paymentMethods: CodeLabel.listFrom(m['paymentMethods']),
      startMethods: CodeLabel.listFrom(m['startMethods']),
      accessTypes: CodeLabel.listFrom(m['accessTypes']),
      operationalStatuses: CodeLabel.listFrom(m['operationalStatuses']),
      checkinOutcomes: CodeLabel.listFrom(m['checkinOutcomes']),
      reportTypes: list('reportTypes', ReportTypeRef.tryParse),
      liveAvailability: LiveAvailabilityInfo.fromJson(m.objectOrNull('liveAvailability')),
    );
  }

  String? connectorName(String code) {
    for (final c in connectorTypes) {
      if (c.code == code) return c.name;
    }
    return null;
  }

  String? label(List<CodeLabel> list, String? code) {
    if (code == null) return null;
    for (final c in list) {
      if (c.code == code) return c.label;
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

/// Availability of one connector.
@immutable
class ConnectorAvailability {
  const ConnectorAvailability({
    required this.status,
    required this.freshness,
    this.providerStatus,
    this.source,
    this.observedAt,
    this.expiresAt,
  });

  final AvailabilityStatus status;
  final AvailabilityFreshness freshness;
  final String? providerStatus;
  final String? source;
  final DateTime? observedAt;
  final DateTime? expiresAt;

  static const none = ConnectorAvailability(status: AvailabilityStatus.unknown, freshness: AvailabilityFreshness.none);

  factory ConnectorAvailability.fromJson(Map<String, dynamic>? m) {
    if (m == null) return none;
    return ConnectorAvailability(
      status: AvailabilityStatus.parse(m.stringOrNull('status')),
      freshness: AvailabilityFreshness.parse(m.stringOrNull('freshness')),
      providerStatus: m.stringOrNull('providerStatus'),
      source: m.stringOrNull('source'),
      observedAt: _date(m, 'observedAt'),
      expiresAt: _date(m, 'expiresAt'),
    );
  }
}

@immutable
class ConnectorCompatibility {
  const ConnectorCompatibility({required this.compatible, this.maxUsablePowerKw});

  final bool compatible;
  final double? maxUsablePowerKw;
}

@immutable
class StationConnector {
  const StationConnector({
    required this.id,
    required this.typeCode,
    required this.typeName,
    this.chargingPointId,
    this.currentType,
    this.maxPowerKw,
    this.maxVoltage,
    this.maxAmperage,
    this.phases,
    this.format,
    this.quantity = 1,
    this.operationalStatus = OperationalStatus.unknown,
    this.availability = ConnectorAvailability.none,
    this.compatibility,
  });

  final String id;
  final String? chargingPointId;
  final String typeCode;
  final String typeName;
  final CurrentType? currentType;
  final double? maxPowerKw;
  final double? maxVoltage;
  final double? maxAmperage;
  final int? phases;

  /// `socket` (bring your cable) / `cable` (tethered) / null.
  final String? format;
  final int quantity;
  final OperationalStatus operationalStatus;
  final ConnectorAvailability availability;
  final ConnectorCompatibility? compatibility;

  static StationConnector? tryParse(Map<String, dynamic> m) {
    final id = m.stringOrNull('id');
    final ct = m.objectOrNull('connectorType');
    final code = ct?.stringOrNull('code');
    if (id == null || code == null) return null;
    final compat = m.objectOrNull('compatibility');
    return StationConnector(
      id: id,
      chargingPointId: m.stringOrNull('chargingPointId'),
      typeCode: code,
      typeName: ct?.stringOrNull('name') ?? code,
      currentType: CurrentType.parse(m.stringOrNull('currentType')),
      maxPowerKw: m.doubleOrNull('maxPowerKw'),
      maxVoltage: m.doubleOrNull('maxVoltage'),
      maxAmperage: m.doubleOrNull('maxAmperage'),
      phases: m.intOrNull('phases'),
      format: m.stringOrNull('format'),
      quantity: m.intOrNull('quantity') ?? 1,
      operationalStatus: OperationalStatus.parse(m.stringOrNull('operationalStatus')),
      availability: ConnectorAvailability.fromJson(m.objectOrNull('availability')),
      compatibility: compat == null
          ? null
          : ConnectorCompatibility(
              compatible: compat.boolOr('compatible', false),
              maxUsablePowerKw: compat.doubleOrNull('maxUsablePowerKw'),
            ),
    );
  }

  static List<StationConnector> listFrom(Object? json) {
    if (json is! List) return const [];
    return [
      for (final e in json)
        if (e is Map) ?tryParse(asJsonObject(e)),
    ];
  }
}

@immutable
class ChargingPoint {
  const ChargingPoint({
    required this.id,
    this.label,
    this.evseId,
    this.floorLevel,
    this.parkingRestrictions,
    this.operationalStatus = OperationalStatus.unknown,
    this.connectors = const [],
  });

  final String id;
  final String? label;
  final String? evseId;
  final String? floorLevel;
  final String? parkingRestrictions;
  final OperationalStatus operationalStatus;
  final List<StationConnector> connectors;
}

@immutable
class TimeWindow {
  const TimeWindow(this.start, this.end);

  /// `HH:MM`; `end` may be `24:00`, or earlier than `start` (past midnight).
  final String start;
  final String end;
}

/// One day of the weekly schedule. [windows] `null` = unknown, `[]` = closed.
@immutable
class DaySchedule {
  const DaySchedule(this.day, this.windows);

  /// `mon`..`sun`.
  final String day;
  final List<TimeWindow>? windows;
}

@immutable
class OpenNowInfo {
  const OpenNowInfo({required this.state, this.reason, this.closesAt, this.opensAt, this.localTime, this.evaluatedAt});

  final OpenState state;

  /// `always_open` | `schedule` | `unknown_schedule` | `unknown_day`.
  final String? reason;
  final DateTime? closesAt;
  final DateTime? opensAt;
  final String? localTime;
  final DateTime? evaluatedAt;

  static const unknown = OpenNowInfo(state: OpenState.unknown);
}

@immutable
class StationHours {
  const StationHours({this.timezone, this.isAlwaysOpen, this.openingHoursText, this.weekly, this.openNow = OpenNowInfo.unknown});

  final String? timezone;
  final bool? isAlwaysOpen;

  /// Free text as published by the source (never parsed).
  final String? openingHoursText;

  /// `null` = no structured schedule (unknown).
  final List<DaySchedule>? weekly;
  final OpenNowInfo openNow;

  factory StationHours.fromJson(Map<String, dynamic>? m) {
    if (m == null) return const StationHours();
    final weeklyRaw = m['weekly'];
    List<DaySchedule>? weekly;
    if (weeklyRaw is List) {
      weekly = [
        for (final d in weeklyRaw)
          if (d is Map && d['day'] is String)
            DaySchedule(
              d['day'] as String,
              d['windows'] is List
                  ? [
                      for (final w in d['windows'] as List)
                        if (w is Map && w['start'] is String && w['end'] is String)
                          TimeWindow(w['start'] as String, w['end'] as String),
                    ]
                  : null,
            ),
      ];
    }
    final on = m.objectOrNull('openNow');
    return StationHours(
      timezone: m.stringOrNull('timezone'),
      isAlwaysOpen: m.boolOrNull('isAlwaysOpen'),
      openingHoursText: m.stringOrNull('openingHoursText'),
      weekly: weekly,
      openNow: on == null
          ? OpenNowInfo.unknown
          : OpenNowInfo(
              state: OpenState.parse(on.stringOrNull('state')),
              reason: on.stringOrNull('reason'),
              closesAt: _date(on, 'closesAt'),
              opensAt: _date(on, 'opensAt'),
              localTime: on.stringOrNull('localTime'),
              evaluatedAt: _date(on, 'evaluatedAt'),
            ),
    );
  }
}

@immutable
class TariffElement {
  const TariffElement({
    required this.componentType,
    required this.componentLabel,
    required this.price,
    required this.priceUnit,
    required this.unitLabel,
    this.stepSize,
    this.graceMinutes,
    this.minPowerKw,
    this.maxPowerKw,
    this.currentType,
    this.startTime,
    this.endTime,
    this.daysOfWeek = const [],
  });

  /// energy | time | flat | parking_time | idle.
  final String componentType;
  final String componentLabel;
  final Money? price;

  /// per_kwh | per_minute | per_hour | per_session.
  final String priceUnit;
  final String unitLabel;
  final int? stepSize;
  final int? graceMinutes;
  final double? minPowerKw;
  final double? maxPowerKw;
  final CurrentType? currentType;
  final String? startTime;
  final String? endTime;

  /// 1 = Monday … 7 = Sunday (ISO).
  final List<int> daysOfWeek;
}

@immutable
class SourceRef {
  const SourceRef({required this.title, this.publisher, this.url});

  final String title;
  final String? publisher;
  final String? url;
}

@immutable
class Tariff {
  const Tariff({
    required this.id,
    this.name,
    this.currency,
    this.validFrom,
    this.validTo,
    this.isCurrent = true,
    this.taxIncluded,
    this.taxPercent,
    this.notes,
    this.reliability,
    this.verifiedAt,
    this.source,
    this.isDemo = false,
    this.elements = const [],
    this.connectorId,
    this.chargingPointId,
  });

  final String id;
  final String? name;
  final String? currency;
  final DateTime? validFrom;
  final DateTime? validTo;
  final bool isCurrent;

  /// `null` = unknown whether taxes are included.
  final bool? taxIncluded;
  final double? taxPercent;
  final String? notes;
  final String? reliability;
  final DateTime? verifiedAt;
  final SourceRef? source;
  final bool isDemo;
  final List<TariffElement> elements;
  final String? connectorId;
  final String? chargingPointId;

  static Tariff? tryParse(Map<String, dynamic> m) {
    final id = m.stringOrNull('id');
    if (id == null) return null;
    final src = m.objectOrNull('source');
    return Tariff(
      id: id,
      name: m.stringOrNull('name'),
      currency: m.stringOrNull('currency'),
      validFrom: _date(m, 'validFrom'),
      validTo: _date(m, 'validTo'),
      isCurrent: m.boolOr('isCurrent', true),
      taxIncluded: m.boolOrNull('taxIncluded'),
      taxPercent: m.doubleOrNull('taxPercent'),
      notes: m.stringOrNull('notes'),
      reliability: m.stringOrNull('reliability'),
      verifiedAt: _date(m, 'verifiedAt'),
      source: src?.stringOrNull('title') == null
          ? null
          : SourceRef(title: src!.stringOrNull('title')!, publisher: src.stringOrNull('publisher'), url: src.stringOrNull('url')),
      isDemo: m.boolOr('isDemo', false),
      connectorId: m.stringOrNull('connectorId'),
      chargingPointId: m.stringOrNull('chargingPointId'),
      elements: m.objectList(
        'elements',
        (e) => TariffElement(
          componentType: e.stringOrNull('componentType') ?? 'energy',
          componentLabel: e.stringOrNull('componentLabel') ?? e.stringOrNull('componentType') ?? '',
          price: Money.tryParse(e['price']),
          priceUnit: e.stringOrNull('priceUnit') ?? '',
          unitLabel: e.stringOrNull('unitLabel') ?? e.stringOrNull('priceUnit') ?? '',
          stepSize: e.intOrNull('stepSize'),
          graceMinutes: e.intOrNull('graceMinutes'),
          minPowerKw: e.doubleOrNull('minPowerKw'),
          maxPowerKw: e.doubleOrNull('maxPowerKw'),
          currentType: CurrentType.parse(e.stringOrNull('currentType')),
          startTime: e.stringOrNull('startTime'),
          endTime: e.stringOrNull('endTime'),
          daysOfWeek: [
            for (final d in (e['daysOfWeek'] is List ? e['daysOfWeek'] as List : const []))
              if (d is int) d,
          ],
        ),
      ),
    );
  }
}

/// Station-level live availability of the detail endpoint.
@immutable
class StationAvailability {
  const StationAvailability({
    required this.status,
    this.liveProviderConfigured = false,
    this.provider,
    this.isLive = false,
    this.available = 0,
    this.occupied = 0,
    this.outOfOrder = 0,
    this.unknown = 0,
    this.lastObservedAt,
    this.disclaimer,
  });

  final AvailabilityStatus status;
  final bool liveProviderConfigured;
  final String? provider;

  /// At least one non-expired observation.
  final bool isLive;
  final int available;
  final int occupied;
  final int outOfOrder;
  final int unknown;
  final DateTime? lastObservedAt;
  final String? disclaimer;

  factory StationAvailability.fromJson(Map<String, dynamic>? m) {
    if (m == null) return const StationAvailability(status: AvailabilityStatus.unknown);
    final c = m.objectOrNull('counts') ?? const <String, dynamic>{};
    return StationAvailability(
      status: AvailabilityStatus.parse(m.stringOrNull('status')),
      liveProviderConfigured: m.boolOr('liveProviderConfigured', false),
      provider: m.stringOrNull('provider'),
      isLive: m.boolOr('isLive', false),
      available: c.intOrNull('available') ?? 0,
      occupied: c.intOrNull('occupied') ?? 0,
      outOfOrder: c.intOrNull('outOfOrder') ?? 0,
      unknown: c.intOrNull('unknown') ?? 0,
      lastObservedAt: _date(m, 'lastObservedAt'),
      disclaimer: m.stringOrNull('disclaimer'),
    );
  }
}

@immutable
class ProviderAttribution {
  const ProviderAttribution({
    required this.provider,
    this.displayName,
    this.sourceUrl,
    this.license,
    this.licenseUrl,
    this.attribution,
    this.lastSyncedAt,
  });

  final String provider;
  final String? displayName;
  final String? sourceUrl;
  final String? license;
  final String? licenseUrl;
  final String? attribution;
  final DateTime? lastSyncedAt;
}

@immutable
class StationSource {
  const StationSource({
    this.dataSource,
    this.license,
    this.attribution,
    this.lastVerifiedAt,
    this.sourceUpdatedAt,
    this.lastUpdated,
    this.providers = const [],
  });

  final String? dataSource;
  final String? license;
  final String? attribution;
  final DateTime? lastVerifiedAt;
  final DateTime? sourceUpdatedAt;
  final DateTime? lastUpdated;
  final List<ProviderAttribution> providers;

  factory StationSource.fromJson(Map<String, dynamic>? m) {
    if (m == null) return const StationSource();
    return StationSource(
      dataSource: m.stringOrNull('dataSource'),
      license: m.stringOrNull('license'),
      attribution: m.stringOrNull('attribution'),
      lastVerifiedAt: _date(m, 'lastVerifiedAt'),
      sourceUpdatedAt: _date(m, 'sourceUpdatedAt'),
      lastUpdated: _date(m, 'lastUpdated'),
      providers: [
        for (final p in m.objectList(
          'providers',
          (p) => p.stringOrNull('provider') == null
              ? null
              : ProviderAttribution(
                  provider: p.stringOrNull('provider')!,
                  displayName: p.stringOrNull('displayName'),
                  sourceUrl: p.stringOrNull('sourceUrl'),
                  license: p.stringOrNull('license'),
                  licenseUrl: p.stringOrNull('licenseUrl'),
                  attribution: p.stringOrNull('attribution'),
                  lastSyncedAt: _date(p, 'lastSyncedAt'),
                ),
        ))
          ?p,
      ],
    );
  }
}

@immutable
class CommunityCheckin {
  const CommunityCheckin({
    required this.id,
    required this.outcome,
    required this.outcomeLabel,
    required this.createdAt,
    this.connectorName,
    this.currentType,
    this.observedPowerKw,
    this.waitMinutes,
    this.comment,
    this.vehicleName,
  });

  final String id;
  final String outcome;
  final String outcomeLabel;
  final DateTime createdAt;
  final String? connectorName;
  final CurrentType? currentType;
  final double? observedPowerKw;
  final int? waitMinutes;
  final String? comment;
  final String? vehicleName;
}

@immutable
class CommunityReport {
  const CommunityReport({required this.id, required this.type, required this.typeLabel, required this.status, required this.createdAt});

  final String id;
  final String type;
  final String typeLabel;

  /// open | in_review | resolved | rejected.
  final String status;
  final DateTime createdAt;
}

/// Dated community data — never live evidence.
@immutable
class StationCommunity {
  const StationCommunity({
    this.disclaimer,
    this.checkinsTotal = 0,
    this.checkinsLast30Days = 0,
    this.lastCheckinAt,
    this.successRate30d,
    this.recentCheckins = const [],
    this.openReports = 0,
    this.recentReports = const [],
  });

  final String? disclaimer;
  final int checkinsTotal;
  final int checkinsLast30Days;
  final DateTime? lastCheckinAt;

  /// 0..1, `null` below 3 check-ins.
  final double? successRate30d;
  final List<CommunityCheckin> recentCheckins;
  final int openReports;
  final List<CommunityReport> recentReports;

  bool get isEmpty => checkinsTotal == 0 && recentCheckins.isEmpty && recentReports.isEmpty && openReports == 0;

  factory StationCommunity.fromJson(Map<String, dynamic>? m) {
    if (m == null) return const StationCommunity();
    final c = m.objectOrNull('checkins') ?? const <String, dynamic>{};
    final r = m.objectOrNull('reports') ?? const <String, dynamic>{};
    return StationCommunity(
      disclaimer: m.stringOrNull('disclaimer'),
      checkinsTotal: c.intOrNull('total') ?? 0,
      checkinsLast30Days: c.intOrNull('last30Days') ?? 0,
      lastCheckinAt: _date(c, 'lastAt'),
      successRate30d: c.doubleOrNull('successRate30d'),
      recentCheckins: [
        for (final x in c.objectList('recent', (x) {
          final id = x.stringOrNull('id');
          final at = _date(x, 'createdAt');
          if (id == null || at == null) return null;
          return CommunityCheckin(
            id: id,
            outcome: x.stringOrNull('outcome') ?? 'other',
            outcomeLabel: x.stringOrNull('outcomeLabel') ?? x.stringOrNull('outcome') ?? '',
            createdAt: at,
            connectorName: x.objectOrNull('connectorType')?.stringOrNull('name'),
            currentType: CurrentType.parse(x.stringOrNull('currentType')),
            observedPowerKw: x.doubleOrNull('observedPowerKw'),
            waitMinutes: x.intOrNull('waitMinutes'),
            comment: x.stringOrNull('comment'),
            vehicleName: x.objectOrNull('vehicle')?.stringOrNull('name'),
          );
        }))
          ?x,
      ],
      openReports: r.intOrNull('openCount') ?? 0,
      recentReports: [
        for (final x in r.objectList('recent', (x) {
          final id = x.stringOrNull('id');
          final at = _date(x, 'createdAt');
          if (id == null || at == null) return null;
          return CommunityReport(
            id: id,
            type: x.stringOrNull('type') ?? 'other',
            typeLabel: x.stringOrNull('typeLabel') ?? x.stringOrNull('type') ?? '',
            status: x.stringOrNull('status') ?? 'open',
            createdAt: at,
          );
        }))
          ?x,
      ],
    );
  }
}

@immutable
class StationPhoto {
  const StationPhoto({required this.url, this.alt, this.credit});

  final String url;
  final String? alt;
  final String? credit;

  static StationPhoto? tryParse(Map<String, dynamic> m) {
    final url = m.stringOrNull('url');
    if (url == null) return null;
    return StationPhoto(
      url: url,
      alt: m.stringOrNull('alt') ?? m.stringOrNull('caption'),
      credit: m.stringOrNull('credit') ?? m.objectOrNull('license')?.stringOrNull('attribution'),
    );
  }
}

@immutable
class StationAddress {
  const StationAddress({this.line, this.city, this.region, this.postalCode, this.countryCode});

  final String? line;
  final String? city;
  final String? region;
  final String? postalCode;
  final String? countryCode;

  /// Non-empty parts joined for display; `null` when nothing is known.
  String? get display {
    final parts = [line, city, region, postalCode].whereType<String>().where((s) => s.trim().isNotEmpty).toList();
    return parts.isEmpty ? null : parts.join('، ');
  }
}

@immutable
class OperatorInfo {
  const OperatorInfo({required this.name, this.id, this.websiteUrl, this.phone, this.email});

  final String? id;
  final String name;
  final String? websiteUrl;
  final String? phone;
  final String? email;
}

/// `GET /stations/:idOrSlug`.
@immutable
class StationDetail {
  const StationDetail({
    required this.id,
    required this.name,
    required this.latitude,
    required this.longitude,
    this.slug,
    this.isDemo = false,
    this.operator,
    this.distanceM,
    this.address = const StationAddress(),
    this.accessEntranceNote,
    this.accessType,
    this.accessTypeLabel,
    this.accessRestrictions,
    this.hours = const StationHours(),
    this.contactPhone,
    this.contactEmail,
    this.contactWebsite,
    this.photos = const [],
    this.amenities = const [],
    this.paymentMethods = const [],
    this.startMethods = const [],
    this.operationalStatus = OperationalStatus.unknown,
    this.operationalStatusLabel,
    this.points = const [],
    this.unassignedConnectors = const [],
    this.pointCount,
    this.connectorCount,
    this.tariffs = const [],
    this.usageCostText,
    this.availability = const StationAvailability(status: AvailabilityStatus.unknown),
    this.source = const StationSource(),
    this.community = const StationCommunity(),
    this.compatibility,
    this.updatedAt,
  });

  final String id;
  final String? slug;
  final String name;
  final bool isDemo;
  final OperatorInfo? operator;
  final double latitude;
  final double longitude;
  final double? distanceM;
  final StationAddress address;
  final String? accessEntranceNote;
  final String? accessType;
  final String? accessTypeLabel;
  final String? accessRestrictions;
  final StationHours hours;
  final String? contactPhone;
  final String? contactEmail;
  final String? contactWebsite;
  final List<StationPhoto> photos;
  final List<CodeLabel> amenities;
  final List<CodeLabel> paymentMethods;
  final List<CodeLabel> startMethods;
  final OperationalStatus operationalStatus;
  final String? operationalStatusLabel;
  final List<ChargingPoint> points;
  final List<StationConnector> unassignedConnectors;
  final int? pointCount;
  final int? connectorCount;
  final List<Tariff> tariffs;
  final String? usageCostText;
  final StationAvailability availability;
  final StationSource source;
  final StationCommunity community;
  final VehicleCompatibility? compatibility;
  final DateTime? updatedAt;

  /// Every connector (grouped by point first, then ungrouped ones).
  List<StationConnector> get allConnectors => [for (final p in points) ...p.connectors, ...unassignedConnectors];

  List<CurrentType> get currentTypes {
    final set = <CurrentType>{for (final c in allConnectors) ?c.currentType};
    return CurrentType.values.where(set.contains).toList();
  }

  double? get maxPowerKw {
    double? max;
    for (final c in allConnectors) {
      final p = c.maxPowerKw;
      if (p != null && (max == null || p > max)) max = p;
    }
    return max;
  }

  factory StationDetail.fromData(Object? data) {
    final m = asJsonObject(data, 'station');
    final id = m.requireString('id');
    final name = m.requireString('name');
    final lat = m.doubleOrNull('latitude');
    final lng = m.doubleOrNull('longitude');
    if (lat == null || lng == null) throw const FormatException('Station without coordinates');
    final op = m.objectOrNull('operator');
    final addr = m.objectOrNull('address');
    final contact = m.objectOrNull('contact');
    return StationDetail(
      id: id,
      slug: m.stringOrNull('slug'),
      name: name,
      isDemo: m.boolOr('isDemo', false),
      operator: op?.stringOrNull('name') == null
          ? null
          : OperatorInfo(
              id: op!.stringOrNull('id'),
              name: op.stringOrNull('name')!,
              websiteUrl: op.stringOrNull('websiteUrl'),
              phone: op.stringOrNull('phone'),
              email: op.stringOrNull('email'),
            ),
      latitude: lat,
      longitude: lng,
      distanceM: m.doubleOrNull('distanceM'),
      address: StationAddress(
        line: addr?.stringOrNull('line'),
        city: addr?.stringOrNull('city'),
        region: addr?.stringOrNull('region'),
        postalCode: addr?.stringOrNull('postalCode'),
        countryCode: addr?.stringOrNull('countryCode'),
      ),
      accessEntranceNote: m.stringOrNull('accessEntranceNote'),
      accessType: m.stringOrNull('accessType'),
      accessTypeLabel: m.stringOrNull('accessTypeLabel'),
      accessRestrictions: m.stringOrNull('accessRestrictions'),
      hours: StationHours.fromJson(m.objectOrNull('hours')),
      contactPhone: contact?.stringOrNull('phone'),
      contactEmail: contact?.stringOrNull('email'),
      contactWebsite: contact?.stringOrNull('websiteUrl'),
      photos: [for (final p in m.objectList('photos', StationPhoto.tryParse)) ?p],
      amenities: CodeLabel.listFrom(m['amenities']),
      paymentMethods: CodeLabel.listFrom(m['paymentMethods']),
      startMethods: CodeLabel.listFrom(m['startMethods']),
      operationalStatus: OperationalStatus.parse(m.stringOrNull('operationalStatus')),
      operationalStatusLabel: m.stringOrNull('operationalStatusLabel'),
      points: m.objectList(
        'points',
        (p) => ChargingPoint(
          id: p.stringOrNull('id') ?? '',
          label: p.stringOrNull('label'),
          evseId: p.stringOrNull('evseId'),
          floorLevel: p.stringOrNull('floorLevel'),
          parkingRestrictions: p.stringOrNull('parkingRestrictions'),
          operationalStatus: OperationalStatus.parse(p.stringOrNull('operationalStatus')),
          connectors: StationConnector.listFrom(p['connectors']),
        ),
      ),
      unassignedConnectors: StationConnector.listFrom(m['unassignedConnectors']),
      pointCount: m.intOrNull('pointCount'),
      connectorCount: m.intOrNull('connectorCount'),
      tariffs: [for (final t in m.objectList('tariffs', Tariff.tryParse)) ?t],
      usageCostText: m.stringOrNull('usageCostText'),
      availability: StationAvailability.fromJson(m.objectOrNull('availability')),
      source: StationSource.fromJson(m.objectOrNull('source')),
      community: StationCommunity.fromJson(m.objectOrNull('community')),
      compatibility: VehicleCompatibility.tryParse(m.objectOrNull('compatibility')),
      updatedAt: _date(m, 'updatedAt'),
    );
  }
}

// ---------------------------------------------------------------------------
// Community writes
// ---------------------------------------------------------------------------

/// A published station within 150 m of a suggestion ("may already exist").
@immutable
class PossibleDuplicate {
  const PossibleDuplicate({required this.id, required this.name, this.distanceM});

  final String id;
  final String name;
  final double? distanceM;
}

/// Result of `POST /stations/suggestions`.
@immutable
class SuggestionResult {
  const SuggestionResult({required this.suggestionId, required this.status, this.possibleDuplicates = const []});

  final String? suggestionId;
  final String status;
  final List<PossibleDuplicate> possibleDuplicates;

  factory SuggestionResult.fromData(Object? data) {
    final m = asJsonObject(data, 'suggestion');
    final s = m.objectOrNull('suggestion');
    return SuggestionResult(
      suggestionId: s?.stringOrNull('id'),
      status: s?.stringOrNull('status') ?? 'pending',
      possibleDuplicates: [
        for (final d in m.objectList(
          'possibleDuplicates',
          (d) => d.stringOrNull('id') == null
              ? null
              : PossibleDuplicate(id: d.stringOrNull('id')!, name: d.stringOrNull('name') ?? '', distanceM: d.doubleOrNull('distanceM')),
        ))
          ?d,
      ],
    );
  }
}

/// One car of the signed-in user's garage (`GET /me/vehicles`), as far as
/// the charging filter needs it.
@immutable
class GarageCar {
  const GarageCar({required this.id, required this.displayName, this.variantId, this.marketCode, this.listedInMarket = true, this.isPrimary = false});

  final String id;
  final String displayName;
  final String? variantId;
  final String? marketCode;
  final bool listedInMarket;
  final bool isPrimary;

  static GarageCar? tryParse(Map<String, dynamic> m) {
    final id = m.stringOrNull('id');
    if (id == null) return null;
    final variant = m.objectOrNull('variant');
    return GarageCar(
      id: id,
      displayName: m.stringOrNull('displayName') ?? m.stringOrNull('nickname') ?? variant?.stringOrNull('name') ?? id,
      variantId: variant?.stringOrNull('id'),
      marketCode: m.stringOrNull('marketCode'),
      listedInMarket: m.boolOr('listedInMarket', true),
      isPrimary: m.boolOr('isPrimary', false),
    );
  }
}
