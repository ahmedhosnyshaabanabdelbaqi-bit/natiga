import 'package:flutter/material.dart';

import '../../app/theme/app_palette.dart';
import '../../app/theme/app_tokens.dart';

/// Standard content card: white surface with a soft shadow (light) or a
/// tonal surface with an outline (dark), rounded 20dp, ripple on tap and a
/// merged semantics label so the card reads as one element.
///
/// Also known as `ContentCard` in the design docs.
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.onTap,
    this.onLongPress,
    this.padding = const EdgeInsets.all(AppSpacing.lg),
    this.semanticLabel,
    this.color,
    this.selected = false,
    this.clip = true,
  });

  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final EdgeInsetsGeometry padding;

  /// What screen readers announce for the whole card (e.g. the title and
  /// key facts). When null the children are read individually.
  final String? semanticLabel;
  final Color? color;

  /// Selected state (e.g. chosen for comparison): primary outline + check is
  /// up to the caller; the card also reports `selected` to screen readers.
  final bool selected;
  final bool clip;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final palette = context.palette;
    final isDark = palette.brightness == Brightness.dark;
    final borderColor = selected
        ? scheme.primary
        : (isDark ? scheme.outlineVariant : scheme.outlineVariant.withValues(alpha: 0.6));

    Widget body = Padding(padding: padding, child: child);
    if (onTap != null || onLongPress != null) {
      body = InkWell(onTap: onTap, onLongPress: onLongPress, child: body);
    }
    return Semantics(
      button: onTap != null,
      selected: selected,
      label: semanticLabel,
      container: true,
      child: DecoratedBox(
        decoration: BoxDecoration(borderRadius: AppRadii.card, boxShadow: palette.cardShadow),
        child: Material(
          color: color ?? scheme.surface,
          clipBehavior: clip ? Clip.antiAlias : Clip.none,
          shape: RoundedRectangleBorder(
            borderRadius: AppRadii.card,
            side: BorderSide(color: borderColor, width: selected ? 2 : 1),
          ),
          child: body,
        ),
      ),
    );
  }
}

/// Alias used by the design docs.
typedef ContentCard = AppCard;
