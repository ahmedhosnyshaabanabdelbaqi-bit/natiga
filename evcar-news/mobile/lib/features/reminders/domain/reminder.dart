import 'package:flutter/foundation.dart';

import '../../../core/json/json_readers.dart';
import '../../garage/common/personal_forms.dart';

enum ReminderType {
  maintenance('maintenance'),
  insurance('insurance'),
  licence('licence'),
  tyres('tyres'),
  custom('custom');

  const ReminderType(this.apiValue);

  final String apiValue;

  static ReminderType fromApi(String? v) => values.firstWhere((e) => e.apiValue == v, orElse: () => ReminderType.custom);
}

enum ReminderStatus {
  upcoming('upcoming'),
  dueSoon('due_soon'),
  overdue('overdue'),
  completed('completed');

  const ReminderStatus(this.apiValue);

  final String apiValue;

  static ReminderStatus fromApi(String? v) =>
      values.firstWhere((e) => e.apiValue == v, orElse: () => ReminderStatus.upcoming);
}

/// `/me/reminders` item (backend-personal.md §4). Status and [notifyOn] are
/// computed by the server at read time.
@immutable
class Reminder {
  const Reminder({
    required this.id,
    required this.type,
    required this.typeLabel,
    this.title,
    this.notes,
    this.vehicleId,
    this.vehicleName,
    this.vehicleOdometerKm,
    this.dueDate,
    this.dueOdometerKm,
    this.repeatIntervalMonths,
    this.repeatIntervalKm,
    this.notifyDaysBefore,
    this.notifyKmBefore,
    this.completedAt,
    required this.status,
    this.dueInDays,
    this.dueInKm,
    this.notifyOn,
  });

  final String id;
  final ReminderType type;
  final String typeLabel;
  final String? title;
  final String? notes;
  final String? vehicleId;
  final String? vehicleName;
  final double? vehicleOdometerKm;

  /// `YYYY-MM-DD`.
  final String? dueDate;
  final double? dueOdometerKm;
  final int? repeatIntervalMonths;
  final double? repeatIntervalKm;
  final int? notifyDaysBefore;
  final double? notifyKmBefore;
  final DateTime? completedAt;
  final ReminderStatus status;
  final int? dueInDays;
  final double? dueInKm;

  /// `YYYY-MM-DD` day on which the app shows its local notification.
  final String? notifyOn;

  String get displayTitle => (title?.trim().isNotEmpty ?? false) ? title!.trim() : typeLabel;
  bool get isCompleted => status == ReminderStatus.completed;
  bool get repeats => repeatIntervalMonths != null || repeatIntervalKm != null;
  DateTime? get dueDay => parseIsoDate(dueDate);
  DateTime? get notifyDay => parseIsoDate(notifyOn);

  factory Reminder.fromJson(Map<String, dynamic> j) {
    final v = j.objectOrNull('vehicle');
    return Reminder(
      id: j.requireString('id'),
      type: ReminderType.fromApi(j.stringOrNull('type')),
      typeLabel: j.stringOrNull('typeLabel') ?? j.stringOrNull('type') ?? '',
      title: j.stringOrNull('title'),
      notes: j.stringOrNull('notes'),
      vehicleId: v?.stringOrNull('id'),
      vehicleName: v?.stringOrNull('displayName'),
      vehicleOdometerKm: v?.doubleOrNull('currentOdometerKm'),
      dueDate: j.stringOrNull('dueDate'),
      dueOdometerKm: j.doubleOrNull('dueOdometerKm'),
      repeatIntervalMonths: j.intOrNull('repeatIntervalMonths'),
      repeatIntervalKm: j.doubleOrNull('repeatIntervalKm'),
      notifyDaysBefore: j.intOrNull('notifyDaysBefore'),
      notifyKmBefore: j.doubleOrNull('notifyKmBefore'),
      completedAt: j.dateTimeOrNull('completedAt'),
      status: ReminderStatus.fromApi(j.stringOrNull('status')),
      dueInDays: j.intOrNull('dueInDays'),
      dueInKm: j.doubleOrNull('dueInKm'),
      notifyOn: j.stringOrNull('notifyOn'),
    );
  }

  static Reminder fromJsonValue(Object? data) => Reminder.fromJson(asJsonObject(data, 'reminder'));
}

/// Body of `POST /me/reminders` / `PATCH /me/reminders/:id`.
@immutable
class ReminderDraft {
  const ReminderDraft({
    required this.type,
    this.title,
    this.userVehicleId,
    this.notes,
    this.dueDate,
    this.dueOdometerKm,
    this.repeatIntervalMonths,
    this.repeatIntervalKm,
    this.notifyDaysBefore,
    this.notifyKmBefore,
  });

  final ReminderType type;
  final String? title;
  final String? userVehicleId;
  final String? notes;
  final String? dueDate;
  final num? dueOdometerKm;
  final int? repeatIntervalMonths;
  final num? repeatIntervalKm;
  final int? notifyDaysBefore;
  final num? notifyKmBefore;

  String? _clean(String? s) => (s?.trim().isEmpty ?? true) ? null : s!.trim();

  Map<String, Object?> toCreateJson() => {
    'type': type.apiValue,
    'title': ?_clean(title),
    'userVehicleId': ?userVehicleId,
    'notes': ?_clean(notes),
    'dueDate': ?dueDate,
    'dueOdometerKm': ?dueOdometerKm,
    'repeatIntervalMonths': ?repeatIntervalMonths,
    'repeatIntervalKm': ?repeatIntervalKm,
    'notifyDaysBefore': ?notifyDaysBefore,
    'notifyKmBefore': ?notifyKmBefore,
  };

  Map<String, Object?> toPatchJson() => {
    'type': type.apiValue,
    'title': _clean(title),
    'userVehicleId': userVehicleId,
    'notes': _clean(notes),
    'dueDate': dueDate,
    'dueOdometerKm': dueOdometerKm,
    'repeatIntervalMonths': repeatIntervalMonths,
    'repeatIntervalKm': repeatIntervalKm,
    'notifyDaysBefore': ?notifyDaysBefore,
    'notifyKmBefore': notifyKmBefore,
  };
}
