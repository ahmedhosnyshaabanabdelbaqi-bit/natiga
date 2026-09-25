import 'package:flutter/material.dart';

import '../../app/theme/app_tokens.dart';
import '../../core/l10n/l10n.dart';

/// Section title with an optional leading icon, subtitle and a "See all"
/// action (48dp target, direction-aware chevron, announced as
/// "See all: <section>").
///
/// ```dart
/// SectionHeader(title: l10n.homeLatestNews, icon: Icons.bolt, onSeeAll: () => context.push(AppRoutes.news))
/// ```
class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.icon,
    this.onSeeAll,
    this.actionLabel,
    this.trailing,
    this.padding = const EdgeInsetsDirectional.fromSTEB(AppSpacing.gutter, AppSpacing.xl, AppSpacing.xs, AppSpacing.sm),
  });

  final String title;
  final String? subtitle;
  final IconData? icon;
  final VoidCallback? onSeeAll;

  /// Defaults to "See all".
  final String? actionLabel;

  /// Replaces the "See all" button (e.g. a filter toggle).
  final Widget? trailing;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = context.l10n;
    final label = actionLabel ?? l10n.commonSeeAll;
    return Padding(
      padding: padding,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          if (icon != null) ...[
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: theme.colorScheme.primaryContainer,
                borderRadius: BorderRadius.circular(AppRadii.sm),
              ),
              child: Icon(icon, size: 18, color: theme.colorScheme.onPrimaryContainer),
            ),
            const SizedBox(width: AppSpacing.sm),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(
                  header: true,
                  child: Text(title, style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                ),
                if (subtitle != null)
                  Text(
                    subtitle!,
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  ),
              ],
            ),
          ),
          if (trailing != null)
            trailing!
          else if (onSeeAll != null)
            Semantics(
              button: true,
              label: l10n.commonSeeAllSection(title),
              excludeSemantics: true,
              child: TextButton(
                onPressed: onSeeAll,
                style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 12)),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(label),
                    const SizedBox(width: 2),
                    // chevron_right is mirrored automatically in RTL.
                    const Icon(Icons.chevron_right, size: 20),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
