import 'package:flutter/material.dart';

import '../../core/formatting/formatters.dart';
import '../../core/l10n/l10n.dart';

/// Banner shown whenever cached data is displayed instead of live data:
/// "Saved copy from 2 hours ago; it may not be up to date."
///
/// Cached data (especially charger status) must never look live
/// (REQUIREMENTS §19).
class CachedDataNotice extends StatelessWidget {
  const CachedDataNotice({super.key, required this.savedAt, this.onRetry, this.now});

  final DateTime savedAt;
  final VoidCallback? onRetry;

  /// Injectable clock for tests.
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final fmt = AppFormatters.of(context);
    final ago = relativeTime(l10n, savedAt, now: now);
    final exact = fmt.dateTime(savedAt) ?? '';
    final text = l10n.commonCachedDataNotice('$ago ($exact)');
    return Semantics(
      container: true,
      liveRegion: true,
      child: Material(
        color: theme.colorScheme.secondaryContainer,
        child: Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(16, 8, 8, 8),
          child: Row(
            children: [
              Icon(Icons.history, color: theme.colorScheme.onSecondaryContainer),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  text,
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSecondaryContainer),
                ),
              ),
              if (onRetry != null)
                IconButton(
                  onPressed: onRetry,
                  tooltip: l10n.commonRetry,
                  icon: Icon(Icons.refresh, color: theme.colorScheme.onSecondaryContainer),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Thin global banner shown by the shell while the device is offline.
class OfflineBanner extends StatelessWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = context.l10n;
    return Semantics(
      liveRegion: true,
      container: true,
      child: Material(
        color: theme.colorScheme.inverseSurface,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.cloud_off_outlined, size: 18, color: theme.colorScheme.onInverseSurface),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  l10n.commonOfflineBanner,
                  style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.onInverseSurface),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
