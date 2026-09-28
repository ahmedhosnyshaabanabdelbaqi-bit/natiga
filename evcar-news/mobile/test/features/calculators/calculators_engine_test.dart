import 'package:evcar_news/features/calculators/application/calculator_runner.dart';
import 'package:evcar_news/features/calculators/data/calculators_repository.dart';
import 'package:evcar_news/features/calculators/domain/engine/engine.dart';
import 'package:flutter_test/flutter_test.dart';

/// Rule problems of a failed calculation as `field:rule`.
List<String> problemsOf(void Function() run) {
  try {
    run();
  } on CalcInputError catch (e) {
    return [for (final p in e.problems) '${p.field}:${p.rule}'];
  }
  fail('expected CalcInputError');
}

ReferencePrice refPrice({
  String id = '00000000-0000-4000-8000-000000000001',
  String amount = '1.35',
  String currency = 'EGP',
  String unit = 'per_kwh',
  String from = '2026-07-01',
  bool outdated = false,
  bool demo = false,
}) => ReferencePrice(
  id: id,
  marketCode: 'EG',
  energyType: 'electricity_home',
  label: 'Home electricity (test)',
  amount: amount,
  currency: currency,
  unit: unit,
  effectiveFrom: from,
  sourceTitle: 'Test source',
  possiblyOutdated: outdated,
  isDemo: demo,
);

void main() {
  group('REQUIREMENTS §23 test vector', () {
    test('60 kWh usable, 20% → 80% adds 36 kWh; at 90% efficiency the grid energy is 40 kWh', () {
      expect(energyAddedKwh(60, 20, 80), 36);
      expect(gridEnergyKwh(36, 0.9), closeTo(40, 1e-9));
      final out = chargeCost({
        'batteryUsableKwh': 60,
        'fromSocPercent': 20,
        'toSocPercent': 80,
        'efficiency': 0.9,
        'currency': 'EGP',
        'priceDate': '2026-09-01',
        'tariff': {'energyPerKwh': 2},
      });
      expect(out.result['energyAddedKwh'], 36);
      expect(out.result['gridEnergyKwh'], 40);
      expect(out.result['lossesKwh'], 4);
      expect((out.result['cost']! as Map)['total'], const Money('80.00', 'EGP'));
      expect(out.confidence, 'high');
      expect(out.steps.map((s) => s.expression), contains('60 kWh × (80% − 20%) = 36 kWh'));
      expect(out.steps.map((s) => s.expression), contains('36 kWh ÷ 0.9 = 40 kWh'));
    });

    test('the default efficiency is 0.9, shown as an editable default and lowers confidence', () {
      final out = chargeCost({
        'batteryUsableKwh': 60,
        'fromSocPercent': 20,
        'toSocPercent': 80,
        'currency': 'EGP',
        'tariff': {'energyPerKwh': 1},
      });
      final eff = out.assumptions.firstWhere((a) => a.key == 'efficiency');
      expect(eff.value, 0.9);
      expect(eff.origin, 'default');
      expect(out.confidence, 'medium');
      expect(out.warnings.map((w) => w.code), contains('PRICE_DATE_MISSING'));
    });

    test('grid-side energy is never divided by the efficiency again', () {
      final out = chargeCost({
        'energyKwh': 40,
        'energyBasis': 'grid',
        'efficiency': 0.9,
        'currency': 'EGP',
        'tariff': {'energyPerKwh': 2},
      });
      expect(out.result['gridEnergyKwh'], 40);
      expect(out.result['energyAddedKwh'], isNull);
      expect(out.result['efficiencyApplied'], isNull);
      expect(out.warnings.map((w) => w.code), contains('EFFICIENCY_NOT_APPLIED'));
    });
  });

  group('zero, negative, missing and invalid inputs', () {
    test('zero / negative / missing battery and SoC are field errors, never 0', () {
      expect(problemsOf(() => chargeCost({'currency': 'EGP', 'tariff': {'energyPerKwh': 1}})), [
        'batteryUsableKwh:required',
        'fromSocPercent:required',
        'toSocPercent:required',
      ]);
      expect(
        problemsOf(
          () => chargeCost({
            'batteryUsableKwh': 0,
            'fromSocPercent': -1,
            'toSocPercent': 101,
            'currency': 'EGP',
            'tariff': {'energyPerKwh': 1},
          }),
        ),
        ['batteryUsableKwh:notZero', 'fromSocPercent:range', 'toSocPercent:range'],
      );
      expect(
        problemsOf(
          () => chargeCost({
            'batteryUsableKwh': -60,
            'fromSocPercent': 80,
            'toSocPercent': 20,
            'currency': 'EGP',
            'tariff': {'energyPerKwh': 1},
          }),
        ),
        ['batteryUsableKwh:positive', 'toSocPercent:greaterThanFrom'],
      );
    });

    test('non-numeric strings, NaN and infinity are rejected', () {
      expect(
        problemsOf(
          () => chargeCost({
            'batteryUsableKwh': 'abc',
            'fromSocPercent': double.nan,
            'toSocPercent': double.infinity,
            'currency': 'EGP',
            'tariff': {'energyPerKwh': 1},
          }),
        ),
        ['batteryUsableKwh:isNumber', 'fromSocPercent:isNumber', 'toSocPercent:isNumber'],
      );
    });

    test('efficiency must be in (0, 1]', () {
      for (final bad in [0, -0.5, 1.01]) {
        expect(
          problemsOf(
            () => chargeCost({
              'batteryUsableKwh': 60,
              'fromSocPercent': 20,
              'toSocPercent': 80,
              'efficiency': bad,
              'currency': 'EGP',
              'tariff': {'energyPerKwh': 1},
            }),
          ),
          ['efficiency:range'],
          reason: '$bad',
        );
      }
      expect(() => gridEnergyKwh(10, 0), throwsRangeError);
    });

    test('there are no default prices: a missing price is an error', () {
      expect(
        problemsOf(() => chargeCost({'batteryUsableKwh': 60, 'fromSocPercent': 20, 'toSocPercent': 80, 'currency': 'EGP'})),
        ['tariff:required'],
      );
      expect(problemsOf(() => costPer100km({'consumptionKwhPer100km': 15, 'currency': 'EGP'})), [
        'electricityPricePerKwh:required',
      ]);
      expect(problemsOf(() => costPer100km({'consumptionKwhPer100km': 15, 'electricityPricePerKwh': 1})), ['currency:required']);
    });

    test('a free price (0) is allowed and gives a zero cost, not an error', () {
      final out = chargeCost({
        'batteryUsableKwh': 50,
        'fromSocPercent': 10,
        'toSocPercent': 90,
        'currency': 'EGP',
        'tariff': {'energyPerKwh': 0},
      });
      expect((out.result['cost']! as Map)['total'], const Money('0.00', 'EGP'));
    });

    test('division by zero is impossible: zero-power curves and zero distance are refused', () {
      expect(
        problemsOf(
          () => chargeTime({
            'currentType': 'DC',
            'batteryUsableKwh': 60,
            'fromSocPercent': 10,
            'toSocPercent': 80,
            'curve': [
              {'socPercent': 0, 'powerKw': 0},
              {'socPercent': 100, 'powerKw': 0},
            ],
          }),
        ),
        ['curve:coverage'],
      );
      expect(
        problemsOf(
          () => monthlyCost({'consumptionKwhPer100km': 15, 'electricityPricePerKwh': 1, 'currency': 'EGP', 'kmPerMonth': 0}),
        ),
        ['kmPerMonth:notZero'],
      );
      expect(
        problemsOf(() => tco({'consumptionKwhPer100km': 15, 'electricityPricePerKwh': 1, 'currency': 'EGP', 'years': 0, 'kmPerYear': 0, 'ev': {}})),
        ['years:notZero', 'kmPerYear:notZero', 'ev.purchasePrice:required'],
      );
    });
  });

  group('charging time', () {
    test('AC time uses the lowest of car, station and supply limits', () {
      final out = chargeTime({
        'currentType': 'AC',
        'batteryUsableKwh': 60,
        'fromSocPercent': 20,
        'toSocPercent': 80,
        'efficiency': 0.9,
        'vehicleAcMaxKw': 11,
        'stationPowerKw': 22,
        'supplyPhases': 1,
        'supplyAmps': 16,
      });
      // 40 kWh ÷ 3.68 kW = 10.87 h
      expect(out.result['powerKw'], 3.68);
      expect(out.result['limitingFactor'], 'supply');
      expect(out.result['minutes'], 652);
      expect(out.confidence, 'medium');
    });

    test('DC without a curve gives only a low-confidence range (never energy ÷ peak as the answer)', () {
      final out = chargeTime({
        'currentType': 'DC',
        'batteryUsableKwh': 60,
        'fromSocPercent': 10,
        'toSocPercent': 80,
        'vehicleDcPeakKw': 135,
        'stationPowerKw': 50,
      });
      expect(out.result['minutes'], isNull);
      expect(out.result['minutesRange'], {'low': 56, 'high': 101});
      expect(out.result['isRoughEstimate'], isTrue);
      expect(out.confidence, 'low');
      expect(out.warnings.map((w) => w.code), contains('NO_CHARGING_CURVE'));
    });
  });

  group('money arithmetic (decimal.js semantics)', () {
    test('rounds half up to 2 decimals, keeps 4 for rates without trailing zeros', () {
      expect(money(0.125, 'EGP').amount, '0.13');
      expect(money(-0.005, 'EGP').amount, '-0.01');
      expect(money(-0.004, 'EGP').amount, '-0.00');
      expect(rate(1.5, 'EGP').amount, '1.5');
      expect(rate(Dec(1).div(3), 'EGP').amount, '0.3333');
      expect(Dec(10).div(3).times(3).toString(), '9.9999999999999999999');
      expect(Dec(0.1).plus(0.2).toString(), '0.3');
    });

    test('JS number printing and Math.round semantics', () {
      expect(jsStr(36.0), '36');
      expect(jsStr(0.9), '0.9');
      expect(round(2.675, 2), 2.68);
      expect(round(-2.5, 0), -2);
    });
  });

  group('reference prices applied on the device (mirrors the server)', () {
    test('value, currency, provenance note, default price date and outdated warning', () {
      final outcome = runCalculatorLocally(
        apiKind: 'cost-per-100km',
        input: {'consumptionKwhPer100km': 15},
        referencePrices: {'electricityPricePerKwh': refPrice(outdated: true, demo: true)},
        lang: 'en',
      );
      expect(outcome, isA<CalcSuccess>());
      final view = (outcome as CalcSuccess).view;
      expect(view.money('costPer100km'), (amount: '20.25', currency: 'EGP'));
      expect(view.string('priceDate'), '2026-07-01');
      final price = view.assumptions.firstWhere((a) => a.key == 'electricityPricePerKwh');
      expect(price.origin, 'reference_price');
      expect(price.note, 'Reference price · Test source · effective from 2026-07-01 · DEMO');
      expect(view.assumptions.firstWhere((a) => a.key == 'priceDate').origin, 'reference_price');
      expect(view.warnings.map((w) => w.code), contains('REFERENCE_PRICE_OLD'));
      expect(view.warnings.map((w) => w.code), isNot(contains('PRICE_DATE_MISSING')));
      expect(view.computedOnDevice, isTrue);
    });

    test('a reference price in another currency or unit is refused', () {
      final wrongCurrency = runCalculatorLocally(
        apiKind: 'cost-per-100km',
        input: {'consumptionKwhPer100km': 15, 'currency': 'SAR'},
        referencePrices: {'electricityPricePerKwh': refPrice()},
        lang: 'en',
      );
      expect((wrongCurrency as CalcInvalid).fieldErrors.keys, ['referencePriceIds.electricityPricePerKwh']);
      final wrongUnit = runCalculatorLocally(
        apiKind: 'vs-fuel',
        input: {'consumptionKwhPer100km': 15, 'electricityPricePerKwh': 1, 'currency': 'EGP', 'fuelConsumptionLPer100km': 7},
        referencePrices: {'fuelPricePerLiter': refPrice(unit: 'per_kwh')},
        lang: 'ar',
      );
      expect((wrongUnit as CalcInvalid).fieldErrors['referencePriceIds.fuelPricePerLiter'], 'وحدة السعر المرجعي لا تناسب هذا الحقل.');
    });

    test('server body sends reference prices by id and never together with a value', () {
      final body = serverCalculatorBody(
        input: nestInput({'tariff.energyPerKwh': 2, 'batteryUsableKwh': null, 'currency': 'EGP'}),
        referencePrices: {'tariff.energyPerKwh': refPrice()},
        userVehicleId: 'car-1',
      );
      expect(body, {
        'currency': 'EGP',
        'referencePriceIds': {'energyPerKwh': '00000000-0000-4000-8000-000000000001'},
        'userVehicleId': 'car-1',
      });
    });

    test('invalid input is reported per field, localized', () {
      final outcome = runCalculatorLocally(
        apiKind: 'charge-cost',
        input: {'batteryUsableKwh': 0, 'fromSocPercent': 20, 'toSocPercent': 80, 'currency': 'EGP', 'tariff': {'energyPerKwh': 1}},
        lang: 'ar',
      );
      expect((outcome as CalcInvalid).fieldErrors, {'batteryUsableKwh': 'يجب أن تكون القيمة أكبر من صفر.'});
    });
  });
}
