import 'package:evcar_news/core/formatting/digits.dart';
import 'package:evcar_news/core/formatting/formatters.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

void main() {
  setUpAll(() => initializeDateFormatting());

  final en = AppFormatters(languageCode: 'en');
  final ar = AppFormatters(languageCode: 'ar');
  final arIndic = AppFormatters(languageCode: 'ar', arabicIndicDigits: true);

  group('missing values stay missing (never 0)', () {
    test('null in → null out for every formatter', () {
      for (final f in [en, ar, arIndic]) {
        expect(f.number(null), isNull);
        expect(f.percent(null), isNull);
        expect(f.distanceKm(null), isNull);
        expect(f.energyKwh(null), isNull);
        expect(f.powerKw(null), isNull);
        expect(f.consumptionWhPerKm(null), isNull);
        expect(f.durationMinutes(null), isNull);
        expect(f.money(null, 'EGP'), isNull);
        expect(f.money('100', null), isNull);
        expect(f.money('abc', 'EGP'), isNull);
        expect(f.date(null), isNull);
        expect(f.dateTime(null), isNull);
      }
      expect(en.number(double.nan), isNull);
      expect(en.number(double.infinity), isNull);
    });

    test('a real zero is still shown as zero', () {
      expect(en.number(0), '0');
      expect(en.energyKwh(0), '0 kWh');
    });
  });

  group('numbers', () {
    test('grouping and trimmed decimals', () {
      expect(en.number(1234567.891), '1,234,567.9');
      expect(en.number(1234567.891, maxDecimals: 2), '1,234,567.89');
      expect(en.number(12.0), '12');
      expect(ar.number(1234567.5), '1,234,567.5');
    });

    test('Arabic-Indic digits and separators when enabled', () {
      expect(arIndic.number(1234567.5), '١٬٢٣٤٬٥٦٧٫٥');
      expect(arIndic.percent(80), '٨٠٪');
      // The setting has no effect on English.
      expect(AppFormatters(languageCode: 'en', arabicIndicDigits: true).number(1234.5), '1,234.5');
    });

    test('percent', () {
      expect(en.percent(80), '80%');
      expect(ar.percent(12.5, maxDecimals: 1), '12.5%');
    });
  });

  group('units', () {
    test('English labels', () {
      expect(en.distanceKm(450), '450 km');
      expect(en.distanceKm(7.25), '7.3 km');
      expect(en.energyKwh(77.4), '77.4 kWh');
      expect(en.powerKw(11), '11 kW');
      expect(en.consumptionWhPerKm(165.4), '165 Wh/km');
      expect(en.consumptionKwhPer100Km(16.54), '16.5 kWh/100 km');
      expect(en.accelerationSeconds(5.94), '5.9 s');
      expect(en.lengthMm(4750), '4,750 mm');
      expect(en.torqueNm(350), '350 Nm');
      expect(en.horsepower(204), '204 hp');
      expect(en.speedKmh(180), '180 km/h');
    });

    test('Arabic labels', () {
      expect(ar.distanceKm(450), '450 كم');
      expect(ar.energyKwh(60), '60 كيلوواط ساعة');
      expect(ar.powerKw(150), '150 كيلوواط');
      expect(arIndic.distanceKm(450), '٤٥٠ كم');
    });

    test('durations', () {
      expect(en.durationMinutes(45), '45 min');
      expect(en.durationMinutes(60), '1 h');
      expect(en.durationMinutes(80), '1 h 20 min');
      expect(ar.durationMinutes(28), '28 دقيقة');
      expect(ar.durationMinutes(95), '1 س 35 د');
      expect(arIndic.durationMinutes(95), '١ س ٣٥ د');
      expect(en.durationMinutes(29.6), '30 min');
    });
  });

  group('money', () {
    test('decimal strings from the API with localized currency', () {
      expect(en.money('1250000.00', 'EGP'), 'EGP 1,250,000');
      expect(en.money('1250.50', 'SAR'), 'SAR 1,250.50');
      expect(ar.money('1250000', 'EGP'), '1,250,000 ج.م');
      expect(ar.money('99.9', 'AED'), '99.90 د.إ');
      expect(arIndic.money('1250000', 'SAR'), '١٬٢٥٠٬٠٠٠ ر.س');
      expect(ar.money('10', 'XYZ'), '10 XYZ');
    });
  });

  group('dates', () {
    test('localized medium dates', () {
      final d = DateTime(2026, 9, 25, 14, 5);
      expect(en.date(d), 'Sep 25, 2026');
      expect(ar.date(d), '25 سبتمبر 2026');
      expect(arIndic.date(d), '٢٥ سبتمبر ٢٠٢٦');
      expect(en.dateTime(d), 'Sep 25, 2026 2:05\u202fPM'); // intl uses a narrow no-break space
    });
  });

  group('digit helpers', () {
    test('round trip', () {
      expect(toArabicIndicDigits('2026-09-25'), '٢٠٢٦-٠٩-٢٥');
      expect(toWesternDigits('٢٠٢٦٫٥'), '2026.5');
      expect(toWesternDigits('۱۲۳'), '123');
    });
  });
}
