import 'package:flutter/material.dart';

import '../../core/l10n/l10n.dart';

/// Section title with an optional "See all" action (48dp target).
class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.onSeeAll,
    this.actionLabel,
    this.padding = const EdgeInsetsDirectional.fromSTEB(16, 16, 8, 8),
  });

  final String title;
  final String? subtitle;
  final VoidCallback? onSeeAll;

  /// Defaults to "See all".
  final String? actionLabel;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: padding,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(
                  header: true,
                  child: Text(title, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                ),
                if (subtitle != null)
                  Text(
                    subtitle!,
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  ),
              ],
            ),
          ),
          if (onSeeAll != null) TextButton(onPressed: onSeeAll, child: Text(actionLabel ?? context.l10n.commonSeeAll)),
        ],
      ),
    );
  }
}
