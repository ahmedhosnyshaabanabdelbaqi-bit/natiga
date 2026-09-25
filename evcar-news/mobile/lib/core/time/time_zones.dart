import 'package:timezone/data/latest.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

/// IANA time-zone database helpers (package `timezone`).
///
/// Used for station opening hours ("open now" is evaluated in the
/// **station's** time zone, not the phone's) and for scheduling local
/// reminders. The database is loaded lazily once.
abstract final class TimeZones {
  static bool _loaded = false;

  /// Loads the bundled tz database (idempotent, synchronous, ~few ms).
  static void ensureInitialized() {
    if (_loaded) return;
    tzdata.initializeTimeZones();
    _loaded = true;
  }

  /// The location for an IANA name (`Africa/Cairo`), or `null` if unknown.
  static tz.Location? location(String? name) {
    if (name == null || name.trim().isEmpty) return null;
    ensureInitialized();
    try {
      return tz.getLocation(name.trim());
    } on tz.LocationNotFoundException {
      return null;
    }
  }

  /// Wall-clock time now in [zoneName]; `null` when the zone is unknown (the
  /// caller then shows "open-now unknown" instead of guessing).
  static tz.TZDateTime? nowIn(String? zoneName, {DateTime? now}) {
    final loc = location(zoneName);
    if (loc == null) return null;
    return tz.TZDateTime.from(now ?? DateTime.now(), loc);
  }

  /// Sets `tz.local` (used when scheduling notifications). Unknown names are
  /// ignored and UTC stays in effect.
  static void setLocal(String? zoneName) {
    final loc = location(zoneName);
    if (loc != null) tz.setLocalLocation(loc);
  }
}
