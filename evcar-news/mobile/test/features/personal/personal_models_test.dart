import 'package:evcar_news/features/charging_logs/domain/charging_log.dart';
import 'package:evcar_news/features/garage/common/personal_forms.dart';
import 'package:evcar_news/features/garage/domain/user_vehicle.dart';
import 'package:evcar_news/features/reminders/domain/reminder.dart';
import 'package:flutter_test/flutter_test.dart';

/// JSON shapes exactly as documented in docs/decisions/backend-personal.md.
Map<String, dynamic> userVehicleJson({Map<String, dynamic> overrides = const {}}) => {
  'id': 'v1',
  'nickname': null,
  'displayName': 'Test Brand Model 2025 Long Range',
  'variant': {
    'id': 'var-1',
    'slug': 'test-model-2025-lr',
    'name': 'Test Brand Model 2025 Long Range',
    'trimName': 'Long Range',
    'modelYear': 2025,
    'powertrainType': 'BEV',
    'brand': {'id': 'b1', 'slug': 'test-brand', 'name': 'Test Brand'},
    'model': {'id': 'm1', 'slug': 'test-model', 'name': 'Model'},
    'isPublished': true,
  },
  'marketCode': 'EG',
  'listedInMarket': false,
  'purchaseDate': null,
  'initialOdometerKm': null,
  'currentOdometerKm': 12500,
  'odometerUpdatedAt': '2026-09-01T10:00:00.000Z',
  'isPrimary': true,
  'notes': null,
  'stats': {'chargingLogs': 3, 'openReminders': 1},
  'createdAt': '2026-08-01T10:00:00.000Z',
  'updatedAt': '2026-09-01T10:00:00.000Z',
  ...overrides,
};

void main() {
  group('garage', () {
    test('parses UserVehicle; missing values stay null (never 0)', () {
      final v = UserVehicle.fromJson(userVehicleJson());
      expect(v.displayName, 'Test Brand Model 2025 Long Range');
      expect(v.variant.modelYear, 2025);
      expect(v.variant.brand?.name, 'Test Brand');
      expect(v.listedInMarket, isFalse);
      expect(v.initialOdometerKm, isNull);
      expect(v.purchaseDate, isNull);
      expect(v.currentOdometerKm, 12500);
      expect(v.chargingLogCount, 3);
      expect(v.isPrimary, isTrue);
    });

    test('create body omits empty values; patch body clears them with null', () {
      const draft = UserVehicleDraft(variantId: 'var-1', marketCode: 'EG', nickname: '  ', notes: '', initialOdometerKm: 0);
      expect(draft.toCreateJson(), {'variantId': 'var-1', 'marketCode': 'EG', 'initialOdometerKm': 0});
      final patch = draft.toPatchJson();
      expect(patch['nickname'], isNull);
      expect(patch.containsKey('nickname'), isTrue);
      expect(patch['purchaseDate'], isNull);
      expect(patch['initialOdometerKm'], 0);
    });
  });

  group('charging log', () {
    test('parses a log with Money cost and a derived price per kWh', () {
      final log = ChargingLog.fromJson({
        'id': 'l1',
        'vehicle': {'id': 'v1', 'displayName': 'Family car'},
        'station': null,
        'chargedAt': '2026-09-20T18:30:00.000Z',
        'energyKwh': 35.2,
        'cost': {'amount': '47.52', 'currency': 'EGP'},
        'costPerKwh': {'amount': '1.35', 'currency': 'EGP'},
        'odometerKm': null,
        'socStart': 20,
        'socEnd': 80,
        'durationMinutes': null,
        'chargerPowerKw': null,
        'currentType': 'AC',
        'locationType': 'home',
        'notes': null,
      });
      expect(log.vehicleName, 'Family car');
      expect(log.cost?.value, 47.52);
      expect(log.odometerKm, isNull);
      expect(log.locationType, ChargeLocationType.home);
      expect(log.chargedAt.isUtc, isTrue);
    });

    test('a log without a cost has no cost (not a free session)', () {
      final log = ChargingLog.fromJson({
        'id': 'l2',
        'vehicle': {'id': 'v1', 'displayName': 'x'},
        'chargedAt': '2026-09-20T18:30:00.000Z',
        'energyKwh': 10,
        'cost': null,
        'costPerKwh': null,
        'locationType': 'weird-value',
      });
      expect(log.cost, isNull);
      expect(log.locationType, ChargeLocationType.other);
    });

    test('draft JSON: currency only with a cost; ISO instant in UTC', () {
      final d = ChargingLogDraft(
        userVehicleId: 'v1',
        chargedAt: DateTime.utc(2026, 9, 20, 18, 30),
        energyKwh: 35.2,
        currency: 'EGP',
      );
      expect(d.toCreateJson(), {
        'userVehicleId': 'v1',
        'chargedAt': '2026-09-20T18:30:00.000Z',
        'energyKwh': 35.2,
        'locationType': 'other',
      });
      expect(d.toPatchJson()['currency'], isNull);
    });

    test('report: per-currency spend and insufficient-data reasons', () {
      final r = ChargingReport.fromJson({
        'period': {'from': null, 'to': null},
        'vehicleId': null,
        'totals': {
          'sessions': 2,
          'energyKwh': 60,
          'sessionsWithCost': 2,
          'sessionsWithoutCost': 0,
          'spend': [
            {'amount': '40.00', 'currency': 'EGP'},
            {'amount': '12.00', 'currency': 'SAR'},
          ],
          'averageCostPerKwh': [],
        },
        'byLocationType': [
          {'locationType': 'home', 'sessions': 2, 'energyKwh': 60},
        ],
        'months': [
          {
            'month': '2026-08',
            'sessions': 2,
            'energyKwh': 60,
            'spend': [
              {'amount': '40.00', 'currency': 'EGP'},
            ],
          },
        ],
        'vehicles': [
          {
            'vehicleId': 'v1',
            'displayName': 'Family car',
            'sessions': 2,
            'energyKwh': 60,
            'spend': [],
            'distance': {'km': null, 'status': 'insufficient_data', 'reason': 'fewer_than_two_odometer_readings'},
            'consumption': {
              'kwhPer100km': null,
              'status': 'insufficient_data',
              'reason': 'fewer_than_two_odometer_readings',
              'method': 'odometer_delta',
              'confidence': null,
              'basis': 'energy_logged',
              'intervals': 0,
            },
            'costPer100km': {'value': null, 'status': 'insufficient_data', 'reason': 'mixed_currencies'},
          },
        ],
        'notes': ['Only your entries are used.'],
      });
      expect(r.currencies, ['EGP', 'SAR']);
      expect(r.months.single.firstDay, DateTime(2026, 8));
      final v = r.vehicles.single;
      expect(v.consumption.ok, isFalse);
      expect(v.consumption.value, isNull);
      expect(v.consumption.reason, 'fewer_than_two_odometer_readings');
      expect(v.costPer100km.reason, 'mixed_currencies');
    });
  });

  group('reminders', () {
    test('parses status, notifyOn and the vehicle odometer', () {
      final r = Reminder.fromJson({
        'id': 'r1',
        'type': 'licence',
        'typeLabel': 'Licence renewal',
        'title': 'Licence renewal',
        'notes': null,
        'vehicle': {'id': 'v1', 'displayName': 'Family car', 'currentOdometerKm': 12000},
        'dueDate': '2026-10-15',
        'dueOdometerKm': null,
        'repeatIntervalMonths': 12,
        'repeatIntervalKm': null,
        'notifyDaysBefore': 7,
        'notifyKmBefore': null,
        'completedAt': null,
        'status': 'due_soon',
        'dueInDays': 17,
        'dueInKm': null,
        'notifyOn': '2026-10-08',
      });
      expect(r.type, ReminderType.licence);
      expect(r.status, ReminderStatus.dueSoon);
      expect(r.notifyDay, DateTime(2026, 10, 8));
      expect(r.repeats, isTrue);
      expect(r.vehicleOdometerKm, 12000);
    });

    test('draft JSON keeps only what was entered', () {
      const d = ReminderDraft(type: ReminderType.custom, title: ' Wash ', dueDate: '2026-10-01', notifyDaysBefore: 3);
      expect(d.toCreateJson(), {'type': 'custom', 'title': 'Wash', 'dueDate': '2026-10-01', 'notifyDaysBefore': 3});
    });
  });

  group('number input', () {
    test('Arabic-Indic digits and decimal separators are accepted', () {
      expect(parseNumberInput('٣٥٫٢'), 35.2);
      expect(parseNumberInput('1,5'), 1.5);
      expect(parseNumberInput('1,234.5'), 1234.5);
      expect(parseNumberInput('12 500'), 12500);
      expect(parseNumberInput(''), isNull);
      expect(() => parseNumberInput('abc'), throwsFormatException);
      expect(numberOrRaw('abc'), 'abc');
      expect(numberOrRaw('۴۰'), 40);
    });

    test('ISO calendar dates', () {
      expect(isoDate(DateTime(2026, 3, 7)), '2026-03-07');
      expect(parseIsoDate('2026-03-07'), DateTime(2026, 3, 7));
      expect(parseIsoDate(null), isNull);
    });
  });
}
