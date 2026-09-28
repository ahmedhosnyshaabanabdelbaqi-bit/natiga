import 'package:flutter/foundation.dart';

import '../../../core/json/json_readers.dart';

/// `{id, slug, name}` of a brand / model.
@immutable
class NamedRef {
  const NamedRef({required this.id, this.slug, required this.name});

  final String id;
  final String? slug;
  final String name;

  static NamedRef? tryParse(Map<String, dynamic>? j) {
    if (j == null) return null;
    final id = j.stringOrNull('id');
    if (id == null) return null;
    return NamedRef(id: id, slug: j.stringOrNull('slug'), name: j.stringOrNull('name') ?? '');
  }
}

/// The trim of a garage car (`UserVehicle.variant`).
@immutable
class GarageVariant {
  const GarageVariant({
    required this.id,
    this.slug,
    required this.name,
    this.trimName,
    this.modelYear,
    this.powertrainType,
    this.brand,
    this.model,
    this.isPublished = true,
  });

  final String id;
  final String? slug;

  /// "Brand Model Year Trim".
  final String name;
  final String? trimName;
  final int? modelYear;

  /// BEV / PHEV / EREV / HEV (API value).
  final String? powertrainType;
  final NamedRef? brand;
  final NamedRef? model;
  final bool isPublished;

  factory GarageVariant.fromJson(Map<String, dynamic> j) => GarageVariant(
    id: j.requireString('id'),
    slug: j.stringOrNull('slug'),
    name: j.stringOrNull('name') ?? '',
    trimName: j.stringOrNull('trimName'),
    modelYear: j.intOrNull('modelYear'),
    powertrainType: j.stringOrNull('powertrainType'),
    brand: NamedRef.tryParse(j.objectOrNull('brand')),
    model: NamedRef.tryParse(j.objectOrNull('model')),
    isPublished: j.boolOr('isPublished', true),
  );
}

/// One car of "جراجي" (`GET /me/vehicles`, backend-personal.md §2).
@immutable
class UserVehicle {
  const UserVehicle({
    required this.id,
    this.nickname,
    required this.displayName,
    required this.variant,
    required this.marketCode,
    required this.listedInMarket,
    this.purchaseDate,
    this.initialOdometerKm,
    this.currentOdometerKm,
    this.odometerUpdatedAt,
    required this.isPrimary,
    this.notes,
    this.chargingLogCount,
    this.openReminderCount,
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String? nickname;
  final String displayName;
  final GarageVariant variant;
  final String marketCode;

  /// False when the trim has no record in [marketCode] (grey import):
  /// prices and station compatibility for that market are then unknown.
  final bool listedInMarket;

  /// `YYYY-MM-DD`.
  final String? purchaseDate;
  final double? initialOdometerKm;
  final double? currentOdometerKm;
  final DateTime? odometerUpdatedAt;
  final bool isPrimary;
  final String? notes;
  final int? chargingLogCount;
  final int? openReminderCount;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  factory UserVehicle.fromJson(Map<String, dynamic> j) {
    final stats = j.objectOrNull('stats');
    return UserVehicle(
      id: j.requireString('id'),
      nickname: j.stringOrNull('nickname'),
      displayName: j.stringOrNull('displayName') ?? '',
      variant: GarageVariant.fromJson(asJsonObject(j['variant'], 'variant')),
      marketCode: j.stringOrNull('marketCode') ?? '',
      listedInMarket: j.boolOr('listedInMarket', true),
      purchaseDate: j.stringOrNull('purchaseDate'),
      initialOdometerKm: j.doubleOrNull('initialOdometerKm'),
      currentOdometerKm: j.doubleOrNull('currentOdometerKm'),
      odometerUpdatedAt: j.dateTimeOrNull('odometerUpdatedAt'),
      isPrimary: j.boolOr('isPrimary', false),
      notes: j.stringOrNull('notes'),
      chargingLogCount: stats?.intOrNull('chargingLogs'),
      openReminderCount: stats?.intOrNull('openReminders'),
      createdAt: j.dateTimeOrNull('createdAt'),
      updatedAt: j.dateTimeOrNull('updatedAt'),
    );
  }

  static UserVehicle fromJsonValue(Object? data) => UserVehicle.fromJson(asJsonObject(data, 'vehicle'));
}

/// Body of `POST /me/vehicles` / `PATCH /me/vehicles/:id`.
@immutable
class UserVehicleDraft {
  const UserVehicleDraft({
    this.variantId,
    this.marketCode,
    this.nickname,
    this.purchaseDate,
    this.initialOdometerKm,
    this.currentOdometerKm,
    this.isPrimary,
    this.notes,
  });

  final String? variantId;
  final String? marketCode;
  final String? nickname;
  final String? purchaseDate;
  final num? initialOdometerKm;
  final num? currentOdometerKm;
  final bool? isPrimary;
  final String? notes;

  /// Create body: absent optional values are omitted.
  Map<String, Object?> toCreateJson() => {
    'variantId': ?variantId,
    'marketCode': ?marketCode,
    if (nickname != null && nickname!.trim().isNotEmpty) 'nickname': nickname!.trim(),
    'purchaseDate': ?purchaseDate,
    'initialOdometerKm': ?initialOdometerKm,
    'currentOdometerKm': ?currentOdometerKm,
    'isPrimary': ?isPrimary,
    if (notes != null && notes!.trim().isNotEmpty) 'notes': notes!.trim(),
  };

  /// Patch body: every editable field is sent; cleared values become `null`
  /// (the API accepts null to clear nullable fields).
  Map<String, Object?> toPatchJson() => {
    'variantId': ?variantId,
    'marketCode': ?marketCode,
    'nickname': (nickname?.trim().isEmpty ?? true) ? null : nickname!.trim(),
    'purchaseDate': purchaseDate,
    'initialOdometerKm': initialOdometerKm,
    'currentOdometerKm': currentOdometerKm,
    'isPrimary': ?isPrimary,
    'notes': (notes?.trim().isEmpty ?? true) ? null : notes!.trim(),
  };
}
