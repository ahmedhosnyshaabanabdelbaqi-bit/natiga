import 'package:flutter/material.dart';

/// Selectable filter chip with a check icon when selected (so selection is
/// not signalled by colour alone) and a 48dp touch target.
class AppFilterChip extends StatelessWidget {
  const AppFilterChip({super.key, required this.label, required this.selected, required this.onSelected, this.icon});

  final String label;
  final bool selected;
  final ValueChanged<bool>? onSelected;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return FilterChip(
      label: Text(label),
      selected: selected,
      showCheckmark: true,
      avatar: icon == null || selected ? null : Icon(icon, size: 18),
      onSelected: onSelected,
      materialTapTargetSize: MaterialTapTargetSize.padded,
    );
  }
}

/// Non-interactive label chip (e.g. range cycle "WLTP", connector type).
class InfoChip extends StatelessWidget {
  const InfoChip({super.key, required this.label, this.icon, this.tooltip});

  final String label;
  final IconData? icon;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final chip = Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: theme.colorScheme.secondaryContainer.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 14, color: theme.colorScheme.onSecondaryContainer),
            const SizedBox(width: 4),
          ],
          Flexible(
            child: Text(
              label,
              style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.onSecondaryContainer),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
    return tooltip == null ? chip : Tooltip(message: tooltip!, child: chip);
  }
}
