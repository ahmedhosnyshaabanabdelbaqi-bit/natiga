import 'package:flutter/material.dart';

import '../../app/theme/app_palette.dart';
import '../../core/formatting/formatters.dart';
import '../../core/l10n/l10n.dart';

/// "Last updated 2 hours ago" — required next to station data, prices,
/// availability and spec sources (REQUIREMENTS §10/§11/§19).
///
/// * `null` → "Last update: not available" (never a fake "now").
/// * Older than [staleAfter] → warning icon + "May be out of date" (text,
///   not colour only).
/// * The exact date/time is in the tooltip and read by screen readers.
class LastUpdatedText extends StatelessWidget {
  const LastUpdatedText({super.key, required this.time, this.staleAfter, this.now, this.style});

  final DateTime? time;
  final Duration? staleAfter;

  /// Injectable clock for tests.
  final DateTime? now;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final base = style ?? theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    final t = time;
    if (t == null) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.update_disabled_outlined, size: 14, color: base?.color),
          const SizedBox(width: 4),
          Flexible(child: Text(l10n.commonLastUpdatedUnknown, style: base)),
        ],
      );
    }
    final current = now ?? DateTime.now();
    final stale = staleAfter != null && current.toUtc().difference(t.toUtc()) > staleAfter!;
    final exact = AppFormatters.of(context).dateTime(t) ?? '';
    final text = l10n.commonLastUpdated(relativeTime(l10n, t, now: current));
    final warn = context.palette.tone(AppTone.warning).onContainer;
    final semantics = [text, exact, if (stale) l10n.commonMayBeOutdated].join('. ');
    return Tooltip(
      message: exact,
      child: Semantics(
        label: semantics,
        excludeSemantics: true,
        child: Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 4,
          runSpacing: 2,
          children: [
            Icon(stale ? Icons.warning_amber_rounded : Icons.update, size: 14, color: stale ? warn : base?.color),
            Text(text, style: base),
            if (stale)
              Text(
                '· ${l10n.commonMayBeOutdated}',
                style: base?.copyWith(color: warn, fontWeight: FontWeight.w600),
              ),
          ],
        ),
      ),
    );
  }
}
