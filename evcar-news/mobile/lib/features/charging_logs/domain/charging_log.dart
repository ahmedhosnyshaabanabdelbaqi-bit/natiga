import 'package:flutter/foundation.dart';

import '../../../core/json/json_readers.dart';

/// `{amount: "12.34", currency: "EGP"}`.
@immutable
class ApiMoney {
  const ApiMoney(this.amount, this.currency);

  final String amount;
  final String currency;

  double? get value => double.tryParse(amount);

  static ApiMoney? tryParse(Object? json) {
    if (json is! Map) return null;
    final j = asJsonObject(json);
    final amount = j.stringOrNull('amount');
    final currency = j.stringOrNull('currency');
    if (amount == null || currency == null) return null;
    return ApiMoney(amount, currency);
  }

  static List<ApiMoney> listOf(Object? json) =>
      json is List ? json.map(tryParse).nonNulls.toList(growable: false) : const [];

  @override
  bool operator ==(Object other) => other is ApiMoney && other.amount == amount && other.currency == currency;

  @override
  int get hashCode => Object.hash(amount, currency);
}

enum ChargeLocationType {
  home('home'),
  public('public'),
  work('work'),
  other('other');

  const ChargeLocationType(this.apiValue);

  final String apiValue;

  static ChargeLocationType fromApi(String? v) =>
      values.firstWhere((e) => e.apiValue == v, orElse: () => ChargeLocationType.other);
}

/// One charging session the user entered (`/me/charging-logs`).
@immutable
class ChargingLog {
  const ChargingLog({
    required this.id,
    required this.vehicleId,
    required this.vehicleName,
    this.stationId,
    this.stationName,
    required this.chargedAt,
    required this.energyKwh,
    this.cost,
    this.costPerKwh,
    this.odometerKm,
    this.socStart,
    this.socEnd,
    this.durationMinutes,
    this.chargerPowerKw,
    this.currentType,
    this.locationType = ChargeLocationType.other,
    this.notes,
  });

  final String id;
  final String vehicleId;
  final String vehicleName;
  final String? stationId;
  final String? stationName;
  final DateTime chargedAt;
  final double energyKwh;
  final ApiMoney? cost;
  final ApiMoney? costPerKwh;
  final double? odometerKm;
  final double? socStart;
  final double? socEnd;
  final double? durationMinutes;
  final double? chargerPowerKw;

  /// 'AC' | 'DC' | null.
  final String? currentType;
  final ChargeLocationType locationType;
  final String? notes;

  factory ChargingLog.fromJson(Map<String, dynamic> j) {
    final vehicle = j.objectOrNull('vehicle') ?? const <String, dynamic>{};
    final station = j.objectOrNull('station');
    return ChargingLog(
      id: j.requireString('id'),
      vehicleId: vehicle.stringOrNull('id') ?? j.stringOrNull('userVehicleId') ?? '',
      vehicleName: vehicle.stringOrNull('displayName') ?? '',
      stationId: station?.stringOrNull('id'),
      stationName: station?.stringOrNull('name'),
      chargedAt: j.dateTimeOrNull('chargedAt') ?? (throw const FormatException('chargedAt')),
      energyKwh: j.doubleOrNull('energyKwh') ?? (throw const FormatException('energyKwh')),
      cost: ApiMoney.tryParse(j['cost']),
      costPerKwh: ApiMoney.tryParse(j['costPerKwh']),
      odometerKm: j.doubleOrNull('odometerKm'),
      socStart: j.doubleOrNull('socStart'),
      socEnd: j.doubleOrNull('socEnd'),
      durationMinutes: j.doubleOrNull('durationMinutes'),
      chargerPowerKw: j.doubleOrNull('chargerPowerKw'),
      currentType: j.stringOrNull('currentType'),
      locationType: ChargeLocationType.fromApi(j.stringOrNull('locationType')),
      notes: j.stringOrNull('notes'),
    );
  }

  static ChargingLog fromJsonValue(Object? data) => ChargingLog.fromJson(asJsonObject(data, 'log'));
}

/// Body of `POST /me/charging-logs` (also used for PATCH, with nulls to clear).
@immutable
class ChargingLogDraft {
  const ChargingLogDraft({
    required this.userVehicleId,
    required this.chargedAt,
    required this.energyKwh,
    this.cost,
    this.currency,
    this.odometerKm,
    this.socStart,
    this.socEnd,
    this.durationMinutes,
    this.chargerPowerKw,
    this.currentType,
    this.locationType = ChargeLocationType.other,
    this.notes,
  });

  final String userVehicleId;
  final DateTime chargedAt;
  final num energyKwh;
  final num? cost;
  final String? currency;
  final num? odometerKm;
  final num? socStart;
  final num? socEnd;
  final num? durationMinutes;
  final num? chargerPowerKw;
  final String? currentType;
  final ChargeLocationType locationType;
  final String? notes;

  Map<String, Object?> toCreateJson() => {
    'userVehicleId': userVehicleId,
    'chargedAt': chargedAt.toUtc().toIso8601String(),
    'energyKwh': energyKwh,
    'cost': ?cost,
    if (cost != null) 'currency': ?currency,
    'odometerKm': ?odometerKm,
    'socStart': ?socStart,
    'socEnd': ?socEnd,
    'durationMinutes': ?durationMinutes,
    'chargerPowerKw': ?chargerPowerKw,
    'currentType': ?currentType,
    'locationType': locationType.apiValue,
    if (notes != null && notes!.trim().isNotEmpty) 'notes': notes!.trim(),
  };

  Map<String, Object?> toPatchJson() => {
    'userVehicleId': userVehicleId,
    'chargedAt': chargedAt.toUtc().toIso8601String(),
    'energyKwh': energyKwh,
    'cost': cost,
    'currency': cost == null ? null : currency,
    'odometerKm': odometerKm,
    'socStart': socStart,
    'socEnd': socEnd,
    'durationMinutes': durationMinutes,
    'chargerPowerKw': chargerPowerKw,
    'currentType': currentType,
    'locationType': locationType.apiValue,
    'notes': (notes?.trim().isEmpty ?? true) ? null : notes!.trim(),
  };
}

/// `status` of a report figure: a number, or why it cannot be computed.
@immutable
class ReportFigure<T> {
  const ReportFigure({this.value, required this.ok, this.reason});

  final T? value;
  final bool ok;

  /// `no_sessions`, `fewer_than_two_odometer_readings`, `no_distance`,
  /// `missing_costs`, `mixed_currencies`.
  final String? reason;
}

@immutable
class ReportVehicle {
  const ReportVehicle({
    required this.vehicleId,
    required this.displayName,
    required this.sessions,
    required this.energyKwh,
    required this.spend,
    required this.distance,
    required this.consumption,
    required this.costPer100km,
    this.consumptionConfidence,
    this.intervals,
  });

  final String vehicleId;
  final String displayName;
  final int sessions;
  final double energyKwh;
  final List<ApiMoney> spend;
  final ReportFigure<double> distance;
  final ReportFigure<double> consumption;
  final ReportFigure<ApiMoney> costPer100km;

  /// 'low' | 'medium' | null.
  final String? consumptionConfidence;
  final int? intervals;

  factory ReportVehicle.fromJson(Map<String, dynamic> j) {
    final d = j.objectOrNull('distance') ?? const <String, dynamic>{};
    final c = j.objectOrNull('consumption') ?? const <String, dynamic>{};
    final k = j.objectOrNull('costPer100km') ?? const <String, dynamic>{};
    return ReportVehicle(
      vehicleId: j.stringOrNull('vehicleId') ?? '',
      displayName: j.stringOrNull('displayName') ?? '',
      sessions: j.intOrNull('sessions') ?? 0,
      energyKwh: j.doubleOrNull('energyKwh') ?? 0,
      spend: ApiMoney.listOf(j['spend']),
      distance: ReportFigure(value: d.doubleOrNull('km'), ok: d.stringOrNull('status') == 'ok', reason: d.stringOrNull('reason')),
      consumption: ReportFigure(
        value: c.doubleOrNull('kwhPer100km'),
        ok: c.stringOrNull('status') == 'ok',
        reason: c.stringOrNull('reason'),
      ),
      costPer100km: ReportFigure(
        value: ApiMoney.tryParse(k['value']),
        ok: k.stringOrNull('status') == 'ok',
        reason: k.stringOrNull('reason'),
      ),
      consumptionConfidence: c.stringOrNull('confidence'),
      intervals: c.intOrNull('intervals'),
    );
  }
}

@immutable
class ReportMonth {
  const ReportMonth({required this.month, required this.sessions, required this.energyKwh, required this.spend});

  /// `2026-08`.
  final String month;
  final int sessions;
  final double energyKwh;
  final List<ApiMoney> spend;

  DateTime? get firstDay {
    final parts = month.split('-');
    if (parts.length != 2) return null;
    final y = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    return y == null || m == null ? null : DateTime(y, m);
  }
}

/// `GET /me/charging-logs/report` — computed only from the user's logs.
@immutable
class ChargingReport {
  const ChargingReport({
    required this.sessions,
    required this.energyKwh,
    required this.sessionsWithCost,
    required this.sessionsWithoutCost,
    required this.spend,
    required this.averageCostPerKwh,
    required this.byLocationType,
    required this.months,
    required this.vehicles,
    required this.notes,
  });

  final int sessions;
  final double energyKwh;
  final int sessionsWithCost;
  final int sessionsWithoutCost;
  final List<ApiMoney> spend;
  final List<ApiMoney> averageCostPerKwh;
  final List<({ChargeLocationType type, int sessions, double energyKwh})> byLocationType;
  final List<ReportMonth> months;
  final List<ReportVehicle> vehicles;
  final List<String> notes;

  bool get isEmpty => sessions == 0;

  /// Currencies that appear in the spend (never converted between each other).
  List<String> get currencies => {for (final m in spend) m.currency}.toList(growable: false);

  factory ChargingReport.fromJson(Map<String, dynamic> j) {
    final t = j.objectOrNull('totals') ?? const <String, dynamic>{};
    return ChargingReport(
      sessions: t.intOrNull('sessions') ?? 0,
      energyKwh: t.doubleOrNull('energyKwh') ?? 0,
      sessionsWithCost: t.intOrNull('sessionsWithCost') ?? 0,
      sessionsWithoutCost: t.intOrNull('sessionsWithoutCost') ?? 0,
      spend: ApiMoney.listOf(t['spend']),
      averageCostPerKwh: ApiMoney.listOf(t['averageCostPerKwh']),
      byLocationType: j.objectList(
        'byLocationType',
        (e) => (
          type: ChargeLocationType.fromApi(e.stringOrNull('locationType')),
          sessions: e.intOrNull('sessions') ?? 0,
          energyKwh: e.doubleOrNull('energyKwh') ?? 0,
        ),
      ),
      months: j.objectList(
        'months',
        (e) => ReportMonth(
          month: e.stringOrNull('month') ?? '',
          sessions: e.intOrNull('sessions') ?? 0,
          energyKwh: e.doubleOrNull('energyKwh') ?? 0,
          spend: ApiMoney.listOf(e['spend']),
        ),
      ),
      vehicles: j.objectList('vehicles', ReportVehicle.fromJson),
      notes: j.stringList('notes'),
    );
  }

  static ChargingReport fromJsonValue(Object? data) => ChargingReport.fromJson(asJsonObject(data, 'report'));
}
