import 'package:flutter/material.dart';

import '../../core/formatting/formatters.dart';
import '../../core/l10n/l10n.dart';

/// Shows where a value came from and when it was verified, e.g.
/// "Source: Manufacturer website · Verified on Sep 25, 2026".
///
/// Tapping opens [onTap] (e.g. the source URL) when provided.
class SourceBadge extends StatelessWidget {
  const SourceBadge({super.key, required this.sourceName, this.verifiedAt, this.onTap, this.dense = false});

  /// Human-readable source name; `null` shows "Source not specified".
  final String? sourceName;
  final DateTime? verifiedAt;
  final VoidCallback? onTap;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final fmt = AppFormatters.of(context);
    final theme = Theme.of(context);
    final color = theme.colorScheme.onSurfaceVariant;
    final style = (dense ? theme.textTheme.labelSmall : theme.textTheme.bodySmall)?.copyWith(color: color);

    final name = sourceName?.trim();
    final sourceText = name == null || name.isEmpty ? l10n.commonSourceUnknown : l10n.commonSource(name);
    final verified = fmt.date(verifiedAt);
    final text = verified == null ? sourceText : '$sourceText · ${l10n.commonVerifiedOn(verified)}';

    final content = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.info_outline, size: dense ? 14 : 16, color: color),
        const SizedBox(width: 4),
        Flexible(child: Text(text, style: style)),
        if (onTap != null) ...[const SizedBox(width: 2), Icon(Icons.open_in_new, size: dense ? 12 : 14, color: color)],
      ],
    );

    if (onTap == null) return Semantics(label: text, excludeSemantics: true, child: content);
    return Semantics(
      button: true,
      label: text,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Align(alignment: AlignmentDirectional.centerStart, widthFactor: 1, child: content),
        ),
      ),
    );
  }
}
