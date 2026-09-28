import 'package:flutter/material.dart';

import '../../../../core/formatting/digits.dart';
import '../../../../shared/widgets/kit.dart';
import '../../domain/comparison_models.dart';

/// Localized labels and value formatting for comparisons. Every value helper
/// returns `null` for a missing value so callers render "غير متوفر / Not
/// available" — never 0 (REQUIREMENTS §6/§22).
abstract final class CompareLabels {
  /// A model year without grouping ("2025", never "2,025").
  static String year(AppFormatters fmt, int year) =>
      fmt.languageCode == 'ar' && fmt.arabicIndicDigits ? toArabicIndicDigits('$year') : '$year';

  static String powertrain(AppLocalizations l10n, String code) {
    final p = Powertrain.fromApi(code);
    return p == null ? code : PowertrainPill.labelFor(l10n, p);
  }

  /// "2025 · BEV · EG" — the three mandatory identifiers of a compared car.
  static String carFacts(BuildContext context, ComparisonCar car) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    return [
      if (car.modelYear != null) year(fmt, car.modelYear!),
      if (car.powertrainType.isNotEmpty) powertrain(l10n, car.powertrainType),
      car.market.code,
    ].join(' · ');
  }

  // --- comparability / outcome -------------------------------------------------------------

  static String comparability(AppLocalizations l10n, Comparability c) => switch (c) {
    Comparability.comparable => l10n.compareStatusComparable,
    Comparability.notComparableCycles => l10n.compareStatusCycles,
    Comparability.notComparableSocWindow => l10n.compareStatusSocWindow,
    Comparability.notComparableConditions => l10n.compareStatusConditions,
    Comparability.missingData => l10n.compareStatusMissing,
    Comparability.differentCurrency => l10n.compareStatusCurrency,
    Comparability.notApplicable => l10n.compareStatusNotApplicable,
    Comparability.unknown => l10n.compareStatusUnknown,
  };

  static IconData comparabilityIcon(Comparability c) => switch (c) {
    Comparability.comparable => Icons.check_circle_outline,
    Comparability.notComparableCycles => Icons.sync_problem_outlined,
    Comparability.notComparableSocWindow => Icons.battery_unknown_outlined,
    Comparability.notComparableConditions => Icons.tune,
    Comparability.missingData => Icons.help_outline,
    Comparability.differentCurrency => Icons.currency_exchange,
    Comparability.notApplicable => Icons.do_not_disturb_on_outlined,
    Comparability.unknown => Icons.help_outline,
  };

  static AppTone comparabilityTone(Comparability c) => switch (c) {
    Comparability.comparable => AppTone.success,
    Comparability.notApplicable => AppTone.neutral,
    Comparability.missingData => AppTone.neutral,
    _ => AppTone.warning,
  };

  static String direction(AppLocalizations l10n, BetterDirection d) => switch (d) {
    BetterDirection.higher => l10n.compareDirectionHigher,
    BetterDirection.lower => l10n.compareDirectionLower,
    BetterDirection.none => l10n.compareDirectionNone,
  };

  static IconData directionIcon(BetterDirection d) => switch (d) {
    BetterDirection.higher => Icons.north,
    BetterDirection.lower => Icons.south,
    BetterDirection.none => Icons.remove,
  };

  // --- values -------------------------------------------------------------------------------

  /// The formatted value of a present [v]; null for missing / not applicable.
  static String? value(BuildContext context, Metric metric, MetricValue v) {
    if (!v.isPresent) return null;
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final raw = v.value;
    if (metric.kind == MetricKind.money || (v.condition?.currency != null && raw is String)) {
      final currency = v.unit ?? v.condition?.currency;
      final amount = raw is num ? raw.toString() : raw as String?;
      return fmt.money(amount, currency) ?? amount;
    }
    if (raw is bool) return raw ? l10n.compareYes : l10n.compareNo;
    final label = v.valueLabel?.trim();
    if (label != null && label.isNotEmpty) return label;
    if (raw is num) return numberWithUnit(context, raw, v.unit ?? metric.unit);
    if (raw is String) {
      final n = num.tryParse(raw);
      if (n != null && metric.kind == MetricKind.number) return numberWithUnit(context, n, v.unit ?? metric.unit);
      return raw.trim().isEmpty ? null : raw;
    }
    return null;
  }

  /// A value of [AlternativeValue] (other cycle / window / wheel size).
  static String? alternative(BuildContext context, Metric metric, AlternativeValue a) {
    final l10n = context.l10n;
    final raw = a.value;
    if (raw is bool) return raw ? l10n.compareYes : l10n.compareNo;
    if (raw is num) return numberWithUnit(context, raw, a.unit ?? metric.unit);
    if (raw is String) {
      final n = num.tryParse(raw);
      return n == null ? raw : numberWithUnit(context, n, a.unit ?? metric.unit);
    }
    return null;
  }

  static String? numberWithUnit(BuildContext context, num? value, String? unit) {
    if (value == null) return null;
    final fmt = AppFormatters.of(context);
    final l10n = context.l10n;
    final u = unit?.trim();
    if (u == null || u.isEmpty) return fmt.number(value, maxDecimals: 2);
    final known = _unitMap[u.toLowerCase()];
    if (known != null) {
      return fmt.withUnit(value, known, maxDecimals: known == Unit.kWh || known == Unit.kW ? 1 : 2);
    }
    switch (u.toLowerCase()) {
      case 'year':
      case 'years':
        return l10n.compareYears(value.round());
      case 'in':
        return '${fmt.number(value, maxDecimals: 1)} ${l10n.compareUnitInch}';
      case 'l/100km':
        return '${fmt.number(value, maxDecimals: 1)} ${l10n.compareUnitLitersPer100}';
      case 'stars':
        return l10n.compareStars(fmt.number(value, maxDecimals: 1)!);
    }
    return '${fmt.number(value, maxDecimals: 2)} $u';
  }

  static const _unitMap = <String, Unit>{
    'km': Unit.km,
    'km/h': Unit.kmPerHour,
    'kwh': Unit.kWh,
    'kw': Unit.kW,
    'wh/km': Unit.whPerKm,
    'kwh/100km': Unit.kWhPer100Km,
    'min': Unit.minutes,
    'h': Unit.hours,
    'mm': Unit.mm,
    'l': Unit.liters,
    'kg': Unit.kg,
    's': Unit.seconds,
    'nm': Unit.newtonMeters,
    'hp': Unit.horsepower,
    '%': Unit.percent,
    'v': Unit.volts,
    'a': Unit.amperes,
  };

  /// "Published: 250 mi" when the published value/unit differs from the
  /// canonical one (units are unified before comparing; originals are kept).
  static String? original(BuildContext context, MetricValue v) {
    final ov = v.originalValue?.trim();
    if (ov == null || ov.isEmpty) return null;
    final ou = v.originalUnit?.trim();
    if (ou != null && ou.isNotEmpty && ou.toLowerCase() == v.unit?.toLowerCase()) return null;
    final n = num.tryParse(ov);
    final fmt = AppFormatters.of(context);
    final shown = n == null ? ov : fmt.number(n, maxDecimals: 2)!;
    return context.l10n.compareOriginalValue(ou == null || ou.isEmpty ? shown : '$shown $ou');
  }

  /// Measuring basis shown next to a number: test cycle, mode, SoC window,
  /// current type, charger power, wheel size, price type / estimate flag.
  static List<String> condition(BuildContext context, MetricCondition? c) {
    if (c == null) return const [];
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final parts = <String>[];
    final cycle = c.cycle;
    if (cycle != null) {
      final rc = RangeCycle.fromApi(cycle);
      final note = c.cycleNote?.trim();
      final base = rc?.label(l10n) ?? cycle;
      parts.add(rc == RangeCycle.other && note != null && note.isNotEmpty ? '$base: $note' : base);
    }
    final mode = c.mode;
    if (mode != null) parts.add(modeLabel(l10n, mode));
    if (c.hasSocWindow) {
      final window = c.fromSoc != null && c.toSoc != null
          ? '${fmt.number(c.fromSoc)}–${fmt.percent(c.toSoc)}'
          : _shape(fmt, c.socWindow!);
      parts.add(l10n.compareSocWindow(window));
    }
    final current = c.currentType?.toUpperCase();
    if (current == 'AC' || current == 'DC') parts.add(current == 'DC' ? l10n.compareCurrentDc : l10n.compareCurrentAc);
    if (c.chargerPowerKw != null) parts.add(l10n.compareChargerPower(fmt.powerKw(c.chargerPowerKw)!));
    if (c.wheelSizeInch != null) parts.add(l10n.compareWheelSize(fmt.number(c.wheelSizeInch, maxDecimals: 1)!));
    final priceLabel = c.priceTypeLabel?.trim();
    if (priceLabel != null && priceLabel.isNotEmpty) parts.add(priceLabel);
    if (c.inMarketCurrency == false) parts.add(l10n.compareConvertedEstimate);
    return parts;
  }

  static String _shape(AppFormatters fmt, String s) =>
      fmt.languageCode == 'ar' && fmt.arabicIndicDigits ? toArabicIndicDigits(s) : s;

  static String modeLabel(AppLocalizations l10n, String mode) => switch (mode) {
    'combined' => l10n.compareModeCombined,
    'weighted' => l10n.compareModeWeighted,
    'charge_depleting' => l10n.compareModeChargeDepleting,
    'charge_sustaining' => l10n.compareModeChargeSustaining,
    'city' => l10n.compareModeCity,
    'highway' => l10n.compareModeHighway,
    _ => mode,
  };

  static Reliability? reliability(String? v) => Reliability.fromApi(v);

  static IconData groupIcon(String key) => switch (key) {
    'price' => Icons.sell_outlined,
    'range' => Icons.route_outlined,
    'battery' => Icons.battery_charging_full,
    'consumption' => Icons.eco_outlined,
    'charging' => Icons.ev_station_outlined,
    'performance' => Icons.speed,
    'space' => Icons.straighten,
    'safety' => Icons.shield_outlined,
    'warranty' => Icons.verified_user_outlined,
    'features' => Icons.checklist,
    _ => Icons.list_alt,
  };
}
