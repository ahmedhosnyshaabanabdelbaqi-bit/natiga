import 'package:flutter/material.dart';

import '../../../../core/formatting/digits.dart';
import '../../../../shared/widgets/kit.dart';
import '../../domain/tour_models.dart';

/// Localized labels for tour data.
abstract final class TourLabels {
  static String seat(AppLocalizations l10n, ScenePosition p) => switch (p) {
    ScenePosition.driver => l10n.toursSeatDriver,
    ScenePosition.frontPassenger => l10n.toursSeatFrontPassenger,
    ScenePosition.rear => l10n.toursSeatRear,
    ScenePosition.thirdRow => l10n.toursSeatThirdRow,
    ScenePosition.cargo => l10n.toursSeatCargo,
    ScenePosition.other => l10n.toursSeatOther,
  };

  /// Scene name: the editor's title, else the server's position label, else
  /// ours.
  static String scene(AppLocalizations l10n, TourScene s) => s.title ?? s.positionLabel ?? seat(l10n, s.position);

  static String seatRef(AppLocalizations l10n, SeatSceneRef s) => s.title ?? seat(l10n, s.position);

  static IconData seatIcon(ScenePosition p) => switch (p) {
    ScenePosition.driver => Icons.airline_seat_recline_normal,
    ScenePosition.frontPassenger => Icons.event_seat_outlined,
    ScenePosition.rear => Icons.airline_seat_legroom_extra,
    ScenePosition.thirdRow => Icons.airline_seat_legroom_normal,
    ScenePosition.cargo => Icons.luggage_outlined,
    ScenePosition.other => Icons.threesixty,
  };

  static String driveSide(AppLocalizations l10n, DriveSide? side) => switch (side) {
    DriveSide.lhd => l10n.toursDriveLhd,
    DriveSide.rhd => l10n.toursDriveRhd,
    null => l10n.toursDriveUnknown,
  };

  static String license(AppLocalizations l10n, String? type) => switch (type) {
    'owned' => l10n.toursLicenseOwned,
    'commissioned' => l10n.toursLicenseCommissioned,
    'press_kit' => l10n.toursLicensePressKit,
    'licensed' => l10n.toursLicenseLicensed,
    'cc0' => l10n.toursLicenseCc0,
    'cc_by' => l10n.toursLicenseCcBy,
    'cc_by_sa' => l10n.toursLicenseCcBySa,
    'permission' => l10n.toursLicensePermission,
    _ => l10n.toursLicenseOther,
  };

  static String hotspotKind(AppLocalizations l10n, HotspotType t) => switch (t) {
    HotspotType.info => l10n.toursHotspotInfo,
    HotspotType.detailImage => l10n.toursHotspotImage,
    HotspotType.video => l10n.toursHotspotVideo,
    HotspotType.specLink => l10n.toursHotspotSpec,
    HotspotType.sceneLink => l10n.toursHotspotScene,
  };

  static IconData hotspotIcon(HotspotType t) => switch (t) {
    HotspotType.info => Icons.info_outline,
    HotspotType.detailImage => Icons.image_outlined,
    HotspotType.video => Icons.play_circle_outline,
    HotspotType.specLink => Icons.fact_check_outlined,
    HotspotType.sceneLink => Icons.airline_seat_recline_normal,
  };

  /// Model year without grouping; Arabic-Indic digits when chosen.
  static String year(AppFormatters fmt, int year) =>
      fmt.languageCode == 'ar' && fmt.arabicIndicDigits ? toArabicIndicDigits('$year') : '$year';

  /// Demo label: the server's text, else ours.
  static String demo(AppLocalizations l10n, TourCard card) => card.demoLabel ?? l10n.toursDemoFallback;

  static Color? parseHex(String? hex) {
    if (hex == null) return null;
    final m = RegExp(r'^#?([0-9a-fA-F]{6})$').firstMatch(hex.trim());
    if (m == null) return null;
    return Color(0xFF000000 | int.parse(m.group(1)!, radix: 16));
  }
}
