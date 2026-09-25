import 'package:flutter/widgets.dart';

import '../../l10n/generated/app_localizations.dart';

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
