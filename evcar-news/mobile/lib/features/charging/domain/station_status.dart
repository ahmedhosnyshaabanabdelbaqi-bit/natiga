import '../../../core/time/time_zones.dart';
import 'station_models.dart';

/// What the app may say about live availability. Pure rules, unit-tested
/// (REQUIREMENTS §11, §19; ARCHITECTURE §3 "three separate statuses").
enum AvailabilityDisplay {
  /// A live, non-expired reading says a connector is free.
  available,

  /// Every connector has a live reading and none is free.
  occupied,

  /// Every connector has a live reading: out of order.
  outOfOrder,

  /// There was a reading but it has expired → "غير مؤكدة / Uncertain".
  uncertain,

  /// No live data → "غير معروفة / Unknown".
  unknown,

  /// The data on screen is a saved (offline) copy: no live status is shown
  /// at all, whatever the copy says.
  notLive,
}

/// How long a list result's station-level availability may be shown after
/// it was fetched. The list endpoint has no per-reading expiry, so after
/// this the app shows "unknown" until the list is refreshed. Matches the
/// backend's default observation TTL (10 min) conservatively.
const listAvailabilityTtl = Duration(minutes: 5);

/// Readings dated in the future beyond this tolerance are not trusted.
const _clockSkew = Duration(minutes: 5);

/// Effective availability of one connector at [now].
///
/// A reading counts as live only when the server marked it `live` AND its
/// `expiresAt` is still in the future on this device. A reading that
/// expired while the screen was open becomes [AvailabilityDisplay.uncertain]
/// — never "available" by default.
AvailabilityDisplay connectorAvailability(ConnectorAvailability a, {required DateTime now, bool offlineCopy = false}) {
  if (offlineCopy) return AvailabilityDisplay.notLive;
  switch (a.freshness) {
    case AvailabilityFreshness.none:
      return AvailabilityDisplay.unknown;
    case AvailabilityFreshness.expired:
      return AvailabilityDisplay.uncertain;
    case AvailabilityFreshness.live:
      final expires = a.expiresAt;
      final observed = a.observedAt;
      if (expires == null || !now.toUtc().isBefore(expires)) return AvailabilityDisplay.uncertain;
      if (observed != null && observed.isAfter(now.toUtc().add(_clockSkew))) return AvailabilityDisplay.unknown;
      return switch (a.status) {
        AvailabilityStatus.available => AvailabilityDisplay.available,
        AvailabilityStatus.occupied => AvailabilityDisplay.occupied,
        AvailabilityStatus.outOfOrder => AvailabilityDisplay.outOfOrder,
        AvailabilityStatus.unknown => AvailabilityDisplay.unknown,
      };
  }
}

/// Station-level availability from its connectors, same rule as the server:
/// available when ≥ 1 connector is live-available; occupied / out of order
/// only when EVERY connector has a live status and none is available;
/// otherwise uncertain (some reading expired) or unknown.
AvailabilityDisplay stationAvailability(Iterable<ConnectorAvailability> connectors, {required DateTime now, bool offlineCopy = false}) {
  if (offlineCopy) return AvailabilityDisplay.notLive;
  final list = [for (final c in connectors) connectorAvailability(c, now: now)];
  if (list.isEmpty) return AvailabilityDisplay.unknown;
  if (list.contains(AvailabilityDisplay.available)) return AvailabilityDisplay.available;
  final allLive = list.every(
    (d) => d == AvailabilityDisplay.occupied || d == AvailabilityDisplay.outOfOrder,
  );
  if (allLive) {
    return list.contains(AvailabilityDisplay.occupied) ? AvailabilityDisplay.occupied : AvailabilityDisplay.outOfOrder;
  }
  if (list.contains(AvailabilityDisplay.uncertain)) return AvailabilityDisplay.uncertain;
  return AvailabilityDisplay.unknown;
}

/// Availability of a list row fetched at [fetchedAt]. Saved copies and
/// results older than [listAvailabilityTtl] never show a live state.
AvailabilityDisplay listItemAvailability(
  AvailabilitySummary a, {
  required DateTime now,
  required DateTime fetchedAt,
  bool offlineCopy = false,
}) {
  if (offlineCopy) return AvailabilityDisplay.notLive;
  if (a.liveConnectors <= 0) return AvailabilityDisplay.unknown;
  if (now.difference(fetchedAt) > listAvailabilityTtl) return AvailabilityDisplay.uncertain;
  return switch (a.status) {
    AvailabilityStatus.available => AvailabilityDisplay.available,
    AvailabilityStatus.occupied => AvailabilityDisplay.occupied,
    AvailabilityStatus.outOfOrder => AvailabilityDisplay.outOfOrder,
    AvailabilityStatus.unknown => AvailabilityDisplay.unknown,
  };
}

// ---------------------------------------------------------------------------
// Open now (local evaluation for saved copies)
// ---------------------------------------------------------------------------

const _days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

int? _minutes(String hhmm) {
  final parts = hhmm.split(':');
  if (parts.length != 2) return null;
  final h = int.tryParse(parts[0]);
  final m = int.tryParse(parts[1]);
  if (h == null || m == null || h < 0 || h > 24 || m < 0 || m > 59 || (h == 24 && m != 0)) return null;
  return h * 60 + m;
}

/// "Open now" computed on the device from the weekly schedule in the
/// station's own time zone (DST aware via the tz database). Used for saved
/// copies (and when the server evaluation is stale); mirrors the backend
/// rules: always open → open; no schedule, unknown zone or unknown day →
/// unknown; empty day → closed; windows crossing midnight are honoured.
OpenState evaluateOpenNow(StationHours hours, DateTime now) {
  if (hours.isAlwaysOpen == true) return OpenState.open;
  final weekly = hours.weekly;
  if (weekly == null) return OpenState.unknown;
  final local = TimeZones.nowIn(hours.timezone, now: now);
  if (local == null) return OpenState.unknown;
  final byDay = {for (final d in weekly) d.day: d.windows};
  final dayIndex = local.weekday - 1; // Monday = 0
  final today = _days[dayIndex];
  final yesterday = _days[(dayIndex + 6) % 7];
  final t = local.hour * 60 + local.minute;

  // Yesterday's window that runs past midnight.
  final prev = byDay[yesterday];
  if (prev != null) {
    for (final w in prev) {
      final s = _minutes(w.start);
      final e = _minutes(w.end);
      if (s == null || e == null) continue;
      if (e < s && t < e) return OpenState.open;
    }
  }

  if (!byDay.containsKey(today)) return OpenState.unknown;
  final windows = byDay[today];
  if (windows == null) return OpenState.unknown;
  for (final w in windows) {
    final s = _minutes(w.start);
    final e = _minutes(w.end);
    if (s == null || e == null) continue;
    if (e > s) {
      if (t >= s && t < e) return OpenState.open;
    } else if (e < s) {
      if (t >= s) return OpenState.open; // runs past midnight
    } else if (s == 0 && e == 0) {
      return OpenState.open;
    }
  }
  // Same as the backend (review 3): an unknown previous day may have a window
  // that runs past midnight into now, so "closed" cannot be claimed.
  if (prev == null) return OpenState.unknown;
  return OpenState.closed;
}

/// The open-now state to show: the server's evaluation when it is fresh,
/// otherwise a local evaluation of the schedule (saved copy, or the page was
/// left open for a while).
OpenState effectiveOpenNow(StationHours hours, {required DateTime now, bool offlineCopy = false}) {
  final evaluatedAt = hours.openNow.evaluatedAt;
  final stale = evaluatedAt == null || now.toUtc().difference(evaluatedAt).abs() > const Duration(minutes: 5);
  if (!offlineCopy && !stale) return hours.openNow.state;
  return evaluateOpenNow(hours, now);
}
