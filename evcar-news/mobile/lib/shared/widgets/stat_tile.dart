import 'package:flutter/material.dart';

import '../../app/theme/app_palette.dart';
import '../../app/theme/app_tokens.dart';
import '../../core/l10n/l10n.dart';

/// Key figure with icon, value, label and an optional qualifier — e.g. range
/// "450 km · WLTP", battery "82 kWh", DC peak "150 kW", monthly spend.
///
/// `value == null` shows "Not available" (never 0). The tile reads as one
/// element: "Range: 450 km, WLTP".
class StatTile extends StatelessWidget {
  const StatTile({
    super.key,
    required this.label,
    required this.value,
    this.icon,
    this.qualifier,
    this.tone = AppTone.brand,
    this.dense = false,
    this.onTap,
  });

  final String label;

  /// Already formatted (`fmt.distanceKm(…)`); null = not available.
  final String? value;
  final IconData? icon;

  /// Measurement condition shown under the value (cycle, SoC window, …).
  final String? qualifier;
  final AppTone tone;
  final bool dense;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = context.l10n;
    final colors = context.palette.tone(tone);
    final v = value?.trim();
    final has = v != null && v.isNotEmpty;

    final valueStyle = has
        ? (dense ? theme.textTheme.titleMedium : theme.textTheme.titleLarge)?.copyWith(
            fontWeight: FontWeight.w700,
            color: theme.colorScheme.onSurface,
          )
        // "Not available" is quieter than a real value.
        : theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant, fontStyle: FontStyle.italic);

    final content = Padding(
      padding: EdgeInsets.all(dense ? AppSpacing.sm : AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Container(
              padding: EdgeInsets.all(dense ? 4 : 6),
              decoration: BoxDecoration(color: colors.container, borderRadius: BorderRadius.circular(AppRadii.sm)),
              child: Icon(icon, size: dense ? 16 : 20, color: colors.onContainer),
            ),
            SizedBox(height: dense ? AppSpacing.xs : AppSpacing.sm),
          ],
          Text(has ? v : l10n.commonNotAvailable, style: valueStyle),
          const SizedBox(height: 2),
          Text(label, style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          if (qualifier != null && qualifier!.trim().isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(qualifier!, style: theme.textTheme.labelSmall?.copyWith(color: colors.onContainer)),
          ],
        ],
      ),
    );

    return Semantics(
      container: true,
      button: onTap != null,
      label: [
        '$label: ${has ? v : l10n.commonNotAvailable}',
        if (qualifier != null && qualifier!.trim().isNotEmpty) qualifier!,
      ].join(', '),
      excludeSemantics: true,
      child: Material(
        color: theme.colorScheme.surfaceContainerLow,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.md),
          side: BorderSide(color: theme.colorScheme.outlineVariant.withValues(alpha: 0.7)),
        ),
        clipBehavior: Clip.antiAlias,
        child: onTap == null ? content : InkWell(onTap: onTap, child: content),
      ),
    );
  }
}

/// Row of [StatTile]s that wraps onto more lines at large text sizes instead
/// of overflowing. Each tile gets at least [minTileWidth].
class StatTileRow extends StatelessWidget {
  const StatTileRow({super.key, required this.tiles, this.minTileWidth = 104, this.spacing = AppSpacing.sm});

  final List<Widget> tiles;
  final double minTileWidth;
  final double spacing;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final scaledMin = minTileWidth * context.textScale.clamp(1.0, 2.0);
        final perRow = ((constraints.maxWidth + spacing) / (scaledMin + spacing)).floor().clamp(1, tiles.length);
        final width = (constraints.maxWidth - spacing * (perRow - 1)) / perRow;
        return Wrap(
          spacing: spacing,
          runSpacing: spacing,
          children: [for (final t in tiles) SizedBox(width: width, child: t)],
        );
      },
    );
  }
}
