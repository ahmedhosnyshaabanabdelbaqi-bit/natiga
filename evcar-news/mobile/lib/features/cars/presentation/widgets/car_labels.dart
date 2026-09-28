import 'package:flutter/material.dart';

import '../../../../core/formatting/digits.dart';
import '../../../../core/links/external_links.dart';
import '../../../../shared/widgets/kit.dart';
import '../../domain/catalog_models.dart';

/// Localized labels and value formatting for the cars feature. Every helper
/// returns `null` for a missing value so the kit widgets render
/// "غير متوفر / Not available" (never 0).
abstract final class CarLabels {
  /// A model year without grouping ("2025", never "2,025"); Arabic-Indic
  /// digits when the user chose them.
  static String year(AppFormatters fmt, int year) =>
      fmt.languageCode == 'ar' && fmt.arabicIndicDigits ? toArabicIndicDigits('$year') : '$year';

  static String bodyType(AppLocalizations l10n, String code) => switch (code) {
    'sedan' => l10n.carsBodySedan,
    'hatchback' => l10n.carsBodyHatchback,
    'suv' => l10n.carsBodySuv,
    'crossover' => l10n.carsBodyCrossover,
    'coupe' => l10n.carsBodyCoupe,
    'convertible' => l10n.carsBodyConvertible,
    'wagon' => l10n.carsBodyWagon,
    'pickup' => l10n.carsBodyPickup,
    'van' => l10n.carsBodyVan,
    'mpv' => l10n.carsBodyMpv,
    _ => l10n.carsBodyOther,
  };

  static String driveType(AppLocalizations l10n, String code) => switch (code) {
    'fwd' => l10n.carsDriveFwd,
    'rwd' => l10n.carsDriveRwd,
    'awd' => l10n.carsDriveAwd,
    _ => code.toUpperCase(),
  };

  /// Market availability of a trim (`available`, `coming_soon`, …).
  static String availability(AppLocalizations l10n, String? code) => switch (code) {
    'available' => l10n.carsAvailabilityAvailable,
    'coming_soon' => l10n.carsAvailabilityComingSoon,
    'discontinued' => l10n.carsAvailabilityDiscontinued,
    'not_available' || 'not_listed' => l10n.carsAvailabilityNotListed,
    _ => l10n.carsAvailabilityUnknown,
  };

  static AppTone availabilityTone(String? code) => switch (code) {
    'available' => AppTone.success,
    'coming_soon' => AppTone.info,
    'discontinued' => AppTone.warning,
    'not_available' || 'not_listed' => AppTone.danger,
    _ => AppTone.neutral,
  };

  static IconData availabilityIcon(String? code) => switch (code) {
    'available' => Icons.check_circle_outline,
    'coming_soon' => Icons.schedule,
    'discontinued' => Icons.history,
    'not_available' || 'not_listed' => Icons.block,
    _ => Icons.help_outline,
  };

  static String powertrainShort(AppLocalizations l10n, String code) {
    final p = Powertrain.fromApi(code);
    return p == null ? code : PowertrainPill.labelFor(l10n, p);
  }

  /// "WLTP" / "Other cycle" (+ the note of an OTHER cycle).
  static String cycle(AppLocalizations l10n, String cycle, {String? note}) {
    final c = RangeCycle.fromApi(cycle);
    final base = c?.label(l10n) ?? cycle;
    final n = note?.trim();
    return c == RangeCycle.other && n != null && n.isNotEmpty ? '$base: $n' : base;
  }

  static String rangeType(AppLocalizations l10n, String type) =>
      type == 'total' ? l10n.commonRangeTotal : l10n.commonRangeElectric;

  /// "420 km" or "90–420 km" for a card span.
  static String? rangeSpan(AppFormatters fmt, RangeSpan? span) {
    if (span == null) return null;
    final min = span.minKm;
    final max = span.maxKm;
    if (min == null && max == null) return null;
    if (min == null || max == null || min == max) return fmt.distanceKm(max ?? min);
    return '${fmt.number(min, maxDecimals: 0)}–${fmt.distanceKm(max)}';
  }

  static String? kwhSpan(AppFormatters fmt, num? min, num? max) {
    if (min == null && max == null) return null;
    if (min == null || max == null || min == max) return fmt.energyKwh(max ?? min);
    return '${fmt.number(min)}–${fmt.energyKwh(max)}';
  }

  static String currentType(AppLocalizations l10n, String type) =>
      type.toUpperCase() == 'DC' ? l10n.carsCurrentDc : l10n.carsCurrentAc;

  static String socWindow(AppFormatters fmt, int from, int to) => '${fmt.percent(from)}–${fmt.percent(to)}';

  /// A spec value with its unit, localized. Booleans are "Yes"/"No" in
  /// words (never a colour or icon alone).
  static String? specValue(BuildContext context, DataPoint? point, {String? fallbackUnit}) {
    if (point == null) return null;
    final l10n = context.l10n;
    final v = point.value;
    if (v is bool) return v ? l10n.carsYes : l10n.carsNo;
    if (v is String) {
      final n = num.tryParse(v);
      if (n == null) return v.trim().isEmpty ? null : v;
      return numberWithUnit(context, n, point.unit ?? fallbackUnit);
    }
    if (v is num) return numberWithUnit(context, v, point.unit ?? fallbackUnit);
    return null;
  }

  static String? numberWithUnit(BuildContext context, num? value, String? unit) {
    if (value == null) return null;
    final fmt = AppFormatters.of(context);
    final l10n = context.l10n;
    final u = unit?.trim();
    if (u == null || u.isEmpty) return fmt.number(value, maxDecimals: 2);
    final known = _unitMap[u.toLowerCase()];
    if (known != null) return fmt.withUnit(value, known, maxDecimals: known == Unit.kWh || known == Unit.kW ? 1 : 2);
    switch (u.toLowerCase()) {
      case 'year':
      case 'years':
        return l10n.carsYears(value.round());
      case 'in':
        return '${fmt.number(value, maxDecimals: 1)} ${l10n.carsUnitInch}';
      case 'l/100km':
        return '${fmt.number(value, maxDecimals: 1)} ${l10n.carsUnitLitersPer100}';
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

  /// Icon of a spec group.
  static IconData groupIcon(String key) => switch (key) {
    'battery' => Icons.battery_charging_full,
    'charging' => Icons.ev_station_outlined,
    'performance' => Icons.speed,
    'dimensions' => Icons.straighten,
    'practicality' => Icons.luggage_outlined,
    'safety' => Icons.shield_outlined,
    'comfort' => Icons.airline_seat_recline_extra,
    'tech' => Icons.devices_other_outlined,
    'warranty' => Icons.verified_user_outlined,
    _ => Icons.list_alt,
  };

  static String articleType(AppLocalizations l10n, String? type) => switch (type) {
    'review' => l10n.carsArticleReview,
    'test_drive' => l10n.carsArticleTestDrive,
    'buying_guide' => l10n.carsArticleBuyingGuide,
    'explainer' => l10n.carsArticleExplainer,
    'opinion' => l10n.carsArticleOpinion,
    _ => l10n.carsArticleNews,
  };

  static String seatPosition(AppLocalizations l10n, SeatScene s) {
    final t = s.title?.trim();
    if (t != null && t.isNotEmpty) return t;
    return switch (s.position) {
      'driver' => l10n.carsSeatDriver,
      'passenger' => l10n.carsSeatPassenger,
      'rear' => l10n.carsSeatRear,
      'third_row' => l10n.carsSeatThirdRow,
      'trunk' => l10n.carsSeatTrunk,
      _ => s.key,
    };
  }
}

/// Maps a [Provenance] to the kit's [SpecSource] (tap → source details).
SpecSource? specSourceOf(BuildContext context, Provenance p) {
  final s = p.source;
  if (s == null && p.verifiedAt == null) return null;
  return SpecSource(
    name: s?.displayName,
    verifiedAt: p.verifiedAt,
    onTap: s == null ? null : () => showSourceSheet(context, s, p),
  );
}

Reliability? reliabilityOf(Provenance p) => Reliability.fromApi(p.reliability);

/// Bottom sheet with everything we know about a source.
Future<void> showSourceSheet(BuildContext context, CatalogSource source, Provenance provenance) {
  final l10n = context.l10n;
  return showAppBottomSheet<void>(
    context: context,
    title: l10n.carsSourceTitle,
    builder: (context) {
      final fmt = AppFormatters.of(context);
      final theme = Theme.of(context);
      final reliability = reliabilityOf(provenance);
      Widget line(String label, String? value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            ValueOrNotAvailable(value, style: theme.textTheme.bodyLarge),
          ],
        ),
      );
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(source.title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: AppSpacing.sm),
          if (reliability != null) ...[
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: ReliabilityBadge(reliability: reliability),
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
          line(l10n.carsSourcePublisher, source.publisher),
          line(l10n.carsSourceVerifiedAt, fmt.date(provenance.verifiedAt)),
          line(l10n.carsSourceDocumentDate, fmt.date(source.documentDate)),
          line(l10n.carsSourceAccessedAt, fmt.date(source.accessedAt)),
          if (source.safeUrl != null) ...[
            const SizedBox(height: AppSpacing.md),
            SecondaryButton(
              label: l10n.carsSourceOpen,
              icon: Icons.open_in_new,
              expand: true,
              onPressed: () => openExternalUrl(context, source.safeUrl!),
            ),
          ],
        ],
      );
    },
  );
}
