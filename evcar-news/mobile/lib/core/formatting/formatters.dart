import 'package:flutter/widgets.dart';
import 'package:intl/intl.dart';

import 'digits.dart';

/// Canonical units used by the API (ARCHITECTURE §4.3).
enum Unit {
  km,
  kmPerHour,
  kWh,
  kW,
  whPerKm,
  kWhPer100Km,
  minutes,
  hours,
  mm,
  liters,
  kg,
  seconds,
  newtonMeters,
  horsepower,
  percent,
  volts,
  amperes,
}

/// Locale-aware formatting of numbers, units, money and dates.
///
/// Every method takes a nullable value and returns `null` for `null` input so
/// the caller renders `NotAvailableValue` ("غير متوفر") — a missing value is
/// never shown as 0 (REQUIREMENTS §6).
///
/// Pure Dart (no BuildContext) so it is unit-testable; widgets get the
/// current instance with `AppFormatters.of(context)`.
class AppFormatters {
  AppFormatters({required this.languageCode, this.arabicIndicDigits = false})
    : assert(languageCode == 'ar' || languageCode == 'en');

  /// `ar` or `en`.
  final String languageCode;

  /// Only applies when [languageCode] is `ar`.
  final bool arabicIndicDigits;

  bool get _ar => languageCode == 'ar';
  bool get _indic => _ar && arabicIndicDigits;

  static AppFormatters of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<FormattingScope>();
    if (scope != null) return scope.formatters;
    final lang = Localizations.maybeLocaleOf(context)?.languageCode;
    return AppFormatters(languageCode: lang == 'en' ? 'en' : 'ar');
  }

  String _shapeNumber(String s) => _indic ? toArabicIndicDigits(s, numberSeparators: true) : s;
  String _shapeText(String s) => _indic ? toArabicIndicDigits(s) : s;

  /// Grouped number with up to [maxDecimals] fraction digits (trailing zeros
  /// trimmed).
  String? number(num? value, {int maxDecimals = 1, int minDecimals = 0}) {
    if (value == null || value.isNaN || value.isInfinite) return null;
    final f = NumberFormat.decimalPattern(languageCode)
      ..maximumFractionDigits = maxDecimals
      ..minimumFractionDigits = minDecimals;
    return _shapeNumber(f.format(value));
  }

  /// Integer percentage for values given in 0–100 (e.g. state of charge).
  String? percent(num? value, {int maxDecimals = 0}) {
    final n = number(value, maxDecimals: maxDecimals);
    if (n == null) return null;
    return _ar ? '$n${_indic ? '٪' : '%'}' : '$n%';
  }

  /// Short unit label in the current language.
  String unitLabel(Unit unit) => (_ar ? _unitsAr : _unitsEn)[unit]!;

  /// `value + unit`, e.g. `450 km` / `450 كم`.
  String? withUnit(num? value, Unit unit, {int maxDecimals = 1}) {
    if (unit == Unit.percent) return percent(value, maxDecimals: maxDecimals);
    if (unit == Unit.minutes) return durationMinutes(value);
    final n = number(value, maxDecimals: maxDecimals);
    if (n == null) return null;
    return '$n ${unitLabel(unit)}';
  }

  String? distanceKm(num? km) => withUnit(km, Unit.km, maxDecimals: km != null && km.abs() < 10 ? 1 : 0);
  String? energyKwh(num? kWh) => withUnit(kWh, Unit.kWh, maxDecimals: 1);
  String? powerKw(num? kW) => withUnit(kW, Unit.kW, maxDecimals: 1);
  String? consumptionWhPerKm(num? whPerKm) => withUnit(whPerKm, Unit.whPerKm, maxDecimals: 0);
  String? consumptionKwhPer100Km(num? v) => withUnit(v, Unit.kWhPer100Km, maxDecimals: 1);
  String? accelerationSeconds(num? s) => withUnit(s, Unit.seconds, maxDecimals: 1);
  String? lengthMm(num? mm) => withUnit(mm, Unit.mm, maxDecimals: 0);
  String? volumeLiters(num? l) => withUnit(l, Unit.liters, maxDecimals: 0);
  String? weightKg(num? kg) => withUnit(kg, Unit.kg, maxDecimals: 0);
  String? torqueNm(num? nm) => withUnit(nm, Unit.newtonMeters, maxDecimals: 0);
  String? horsepower(num? hp) => withUnit(hp, Unit.horsepower, maxDecimals: 0);
  String? speedKmh(num? v) => withUnit(v, Unit.kmPerHour, maxDecimals: 0);

  /// Minutes → `1 h 20 min` / `1 س 20 د`; under an hour → `45 min` / `45 دقيقة`.
  String? durationMinutes(num? minutes) {
    if (minutes == null || minutes.isNaN || minutes.isInfinite) return null;
    final total = minutes.round();
    final negative = total < 0;
    final abs = total.abs();
    final h = abs ~/ 60;
    final m = abs % 60;
    String out;
    if (h == 0) {
      out = _ar ? '$m دقيقة' : '$m min';
    } else if (m == 0) {
      out = _ar ? '$h س' : '$h h';
    } else {
      out = _ar ? '$h س $m د' : '$h h $m min';
    }
    return _shapeText(negative ? '-$out' : out);
  }

  /// Money from the API's decimal string (`{amount: "1250000.00", currency: "EGP"}`).
  /// Returns null when the amount is missing or not a number.
  String? money(String? amount, String? currency) {
    if (amount == null || currency == null || currency.isEmpty) return null;
    final value = num.tryParse(amount.trim());
    if (value == null) return null;
    final hasFraction = value != value.truncate();
    final n = number(value, maxDecimals: hasFraction ? 2 : 0, minDecimals: hasFraction ? 2 : 0)!;
    final symbol = currencySymbol(currency);
    return _ar ? '$n $symbol' : '$symbol $n';
  }

  /// Arabic abbreviation for known currencies, ISO code otherwise.
  String currencySymbol(String code) {
    final upper = code.toUpperCase();
    if (!_ar) return upper;
    return _currencyAr[upper] ?? upper;
  }

  /// Medium date in local time, e.g. `Sep 25, 2026` / `25 سبتمبر 2026`.
  String? date(DateTime? value) {
    if (value == null) return null;
    return _shapeText(DateFormat.yMMMd(languageCode).format(value.toLocal()));
  }

  /// Date + time in local time.
  String? dateTime(DateTime? value) {
    if (value == null) return null;
    final local = value.toLocal();
    final d = DateFormat.yMMMd(languageCode).format(local);
    final t = DateFormat.jm(languageCode).format(local);
    return _shapeText('$d $t');
  }

  static const _unitsEn = {
    Unit.km: 'km',
    Unit.kmPerHour: 'km/h',
    Unit.kWh: 'kWh',
    Unit.kW: 'kW',
    Unit.whPerKm: 'Wh/km',
    Unit.kWhPer100Km: 'kWh/100 km',
    Unit.minutes: 'min',
    Unit.hours: 'h',
    Unit.mm: 'mm',
    Unit.liters: 'L',
    Unit.kg: 'kg',
    Unit.seconds: 's',
    Unit.newtonMeters: 'Nm',
    Unit.horsepower: 'hp',
    Unit.percent: '%',
    Unit.volts: 'V',
    Unit.amperes: 'A',
  };

  static const _unitsAr = {
    Unit.km: 'كم',
    Unit.kmPerHour: 'كم/س',
    Unit.kWh: 'كيلوواط ساعة',
    Unit.kW: 'كيلوواط',
    Unit.whPerKm: 'واط ساعة/كم',
    Unit.kWhPer100Km: 'كيلوواط ساعة/100 كم',
    Unit.minutes: 'دقيقة',
    Unit.hours: 'ساعة',
    Unit.mm: 'مم',
    Unit.liters: 'لتر',
    Unit.kg: 'كجم',
    Unit.seconds: 'ث',
    Unit.newtonMeters: 'نيوتن متر',
    Unit.horsepower: 'حصان',
    Unit.percent: '٪',
    Unit.volts: 'فولت',
    Unit.amperes: 'أمبير',
  };

  static const _currencyAr = {'EGP': 'ج.م', 'SAR': 'ر.س', 'AED': 'د.إ', 'USD': 'دولار', 'EUR': 'يورو'};
}

/// Provides the current [AppFormatters] to the widget tree (inserted by the
/// app shell from settings).
class FormattingScope extends InheritedWidget {
  const FormattingScope({super.key, required this.formatters, required super.child});

  final AppFormatters formatters;

  @override
  bool updateShouldNotify(FormattingScope oldWidget) =>
      oldWidget.formatters.languageCode != formatters.languageCode ||
      oldWidget.formatters.arabicIndicDigits != formatters.arabicIndicDigits;
}
