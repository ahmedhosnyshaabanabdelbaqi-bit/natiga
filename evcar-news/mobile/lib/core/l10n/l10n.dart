import 'package:flutter/widgets.dart';

import '../../l10n/generated/app_localizations.dart';
import '../formatting/formatters.dart';

export '../../l10n/generated/app_localizations.dart';

extension L10nContext on BuildContext {
  /// Generated localizations for the current locale.
  AppLocalizations get l10n => AppLocalizations.of(this);

  /// `ar` or `en`.
  String get languageCode => Localizations.localeOf(this).languageCode;

  bool get isRtl => Directionality.of(this) == TextDirection.rtl;
}

/// "2 hours ago" style text for [time] (UTC or local), relative to [now].
String relativeTime(AppLocalizations l10n, DateTime time, {DateTime? now}) {
  final diff = (now ?? DateTime.now()).toUtc().difference(time.toUtc());
  if (diff.inMinutes < 1) return l10n.commonJustNow;
  if (diff.inHours < 1) return l10n.commonMinutesAgo(diff.inMinutes);
  if (diff.inDays < 1) return l10n.commonHoursAgo(diff.inHours);
  return l10n.commonDaysAgo(diff.inDays);
}

/// Publication-style time: "3 hours ago" for the last [relativeFor], then a
/// date ("Sep 25, 2026"). `null` in → `null` out (caller shows nothing or
/// "Not available").
String? friendlyTime(
  BuildContext context,
  DateTime? time, {
  DateTime? now,
  Duration relativeFor = const Duration(days: 7),
}) {
  if (time == null) return null;
  final current = now ?? DateTime.now();
  final diff = current.toUtc().difference(time.toUtc());
  if (!diff.isNegative && diff < relativeFor) return relativeTime(context.l10n, time, now: current);
  return AppFormatters.of(context).date(time);
}
