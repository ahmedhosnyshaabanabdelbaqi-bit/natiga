import 'package:flutter/material.dart';

import '../../../../shared/widgets/kit.dart';
import '../../domain/city_presets.dart';
import '../../domain/station_models.dart';
import '../../domain/station_query.dart';
import '../../domain/station_status.dart';

/// Label + tone + icon for a status (never colour alone: every pill has an
/// icon and text).
typedef StatusLook = ({String label, AppTone tone, IconData icon});

StatusLook operationalLook(AppLocalizations l10n, OperationalStatus s, {String? serverLabel}) => switch (s) {
  OperationalStatus.operational => (
    label: serverLabel ?? l10n.chargingOpOperational,
    tone: AppTone.success,
    icon: Icons.check_circle_outline,
  ),
  OperationalStatus.planned => (label: serverLabel ?? l10n.chargingOpPlanned, tone: AppTone.info, icon: Icons.schedule),
  OperationalStatus.temporarilyUnavailable => (
    label: serverLabel ?? l10n.chargingOpTemporarilyUnavailable,
    tone: AppTone.warning,
    icon: Icons.construction_outlined,
  ),
  OperationalStatus.permanentlyClosed => (
    label: serverLabel ?? l10n.chargingOpPermanentlyClosed,
    tone: AppTone.danger,
    icon: Icons.block,
  ),
  OperationalStatus.unknown => (
    label: serverLabel ?? l10n.chargingOpUnknown,
    tone: AppTone.neutral,
    icon: Icons.help_outline,
  ),
};

StatusLook openNowLook(AppLocalizations l10n, OpenState s) => switch (s) {
  OpenState.open => (label: l10n.chargingOpenNow, tone: AppTone.success, icon: Icons.door_front_door_outlined),
  OpenState.closed => (label: l10n.chargingClosedNow, tone: AppTone.warning, icon: Icons.door_sliding_outlined),
  OpenState.unknown => (label: l10n.chargingHoursUnknown, tone: AppTone.neutral, icon: Icons.schedule_outlined),
};

StatusLook availabilityLook(AppLocalizations l10n, AvailabilityDisplay d) => switch (d) {
  AvailabilityDisplay.available => (
    label: l10n.chargingAvailAvailable,
    tone: AppTone.success,
    icon: Icons.ev_station_outlined,
  ),
  AvailabilityDisplay.occupied => (label: l10n.chargingAvailOccupied, tone: AppTone.warning, icon: Icons.timelapse),
  AvailabilityDisplay.outOfOrder => (
    label: l10n.chargingAvailOutOfOrder,
    tone: AppTone.danger,
    icon: Icons.report_gmailerrorred_outlined,
  ),
  AvailabilityDisplay.uncertain => (
    label: l10n.chargingAvailUncertain,
    tone: AppTone.neutral,
    icon: Icons.history_toggle_off,
  ),
  AvailabilityDisplay.unknown => (
    label: l10n.chargingAvailUnknown,
    tone: AppTone.neutral,
    icon: Icons.help_outline,
  ),
  AvailabilityDisplay.notLive => (
    label: l10n.chargingAvailNotLiveOffline,
    tone: AppTone.neutral,
    icon: Icons.cloud_off_outlined,
  ),
};

/// A status pill with a short "kind" prefix in its semantics, so screen
/// readers hear "Live availability: Unknown", not just "Unknown".
class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.look, required this.kind, this.dense = true});

  final StatusLook look;
  final String kind;
  final bool dense;

  @override
  Widget build(BuildContext context) => Pill(
    label: look.label,
    icon: look.icon,
    tone: look.tone,
    dense: dense,
    semanticLabel: '$kind: ${look.label}',
  );
}

String currentLabel(CurrentType c) => c.apiValue;

String? powerText(AppFormatters fmt, double? kw) => fmt.powerKw(kw);

/// "14.5 km" / "850 m" or null.
String? distanceText(AppFormatters fmt, AppLocalizations l10n, double? meters) {
  if (meters == null || meters.isNaN) return null;
  if (meters < 1000) return l10n.chargingDistanceMeters(fmt.number(meters.roundToDouble(), maxDecimals: 0)!);
  return fmt.distanceKm(meters / 1000);
}

/// Reference-place label ("Near you", "Cairo", "Chosen point").
String placeLabel(BuildContext context, SearchPlace place) {
  final l10n = context.l10n;
  final city = cityById(place.cityId)?.name(context.languageCode) ?? place.label;
  return switch (place.kind) {
    PlaceKind.device => l10n.chargingPlaceNearYou,
    PlaceKind.mapPoint => l10n.chargingPlaceMapPoint,
    PlaceKind.city => city ?? l10n.chargingPlaceMapPoint,
    PlaceKind.marketDefault => l10n.chargingPlaceDefaultCity(city ?? ''),
  };
}

String dataSourceLabel(AppLocalizations l10n, String? source) => switch (source) {
  'manual' => l10n.chargingSourceManual,
  'ocm' => l10n.chargingSourceOcm,
  'csv' => l10n.chargingSourceCsv,
  'partner' => l10n.chargingSourcePartner,
  'user_suggestion' => l10n.chargingSourceUserSuggestion,
  _ => l10n.commonSourceUnknown,
};

String reportStatusLabel(AppLocalizations l10n, String status) => switch (status) {
  'open' => l10n.chargingReportStatusOpen,
  'in_review' => l10n.chargingReportStatusInReview,
  'resolved' => l10n.chargingReportStatusResolved,
  'rejected' => l10n.chargingReportStatusRejected,
  _ => status,
};

String weekdayLabel(AppLocalizations l10n, String day) => switch (day) {
  'mon' => l10n.chargingDayMon,
  'tue' => l10n.chargingDayTue,
  'wed' => l10n.chargingDayWed,
  'thu' => l10n.chargingDayThu,
  'fri' => l10n.chargingDayFri,
  'sat' => l10n.chargingDaySat,
  'sun' => l10n.chargingDaySun,
  _ => day,
};

/// ISO weekday number (1 = Monday) → label.
String isoWeekdayLabel(AppLocalizations l10n, int d) =>
    weekdayLabel(l10n, const ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][(d - 1).clamp(0, 6)]);
