import 'package:flutter/material.dart';

import '../../../../shared/widgets/kit.dart';
import '../../domain/charging_log.dart';

abstract final class LogLabels {
  static String location(AppLocalizations l10n, ChargeLocationType t) => switch (t) {
    ChargeLocationType.home => l10n.chargingLogsLocationHome,
    ChargeLocationType.public => l10n.chargingLogsLocationPublic,
    ChargeLocationType.work => l10n.chargingLogsLocationWork,
    ChargeLocationType.other => l10n.chargingLogsLocationOther,
  };

  static IconData locationIcon(ChargeLocationType t) => switch (t) {
    ChargeLocationType.home => Icons.home_outlined,
    ChargeLocationType.public => Icons.ev_station_outlined,
    ChargeLocationType.work => Icons.work_outline,
    ChargeLocationType.other => Icons.place_outlined,
  };

  /// Why a report figure could not be computed.
  static String reason(AppLocalizations l10n, String? code) => switch (code) {
    'no_sessions' => l10n.chargingLogsReasonNoSessions,
    'fewer_than_two_odometer_readings' => l10n.chargingLogsReasonOdometer,
    'no_distance' => l10n.chargingLogsReasonNoDistance,
    'missing_costs' => l10n.chargingLogsReasonMissingCosts,
    'mixed_currencies' => l10n.chargingLogsReasonMixedCurrencies,
    _ => l10n.chargingLogsReasonUnknown,
  };

  /// "EGP 120.00 + SAR 40.00" — one amount per currency, never converted.
  static String? spend(AppFormatters fmt, List<ApiMoney> spend) {
    final parts = [for (final m in spend) ?fmt.money(m.amount, m.currency)];
    return parts.isEmpty ? null : parts.join(' + ');
  }
}
