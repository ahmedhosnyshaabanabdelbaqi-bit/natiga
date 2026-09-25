import 'package:flutter/material.dart';

import '../../app/theme/app_tokens.dart';
import '../../core/l10n/l10n.dart';

/// Selectable filter chip (pill) with a check icon when selected (so
/// selection is not signalled by colour alone) and a 48dp touch target.
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

/// Single-choice pill group (e.g. "Map | List", sort order). Selected pill
/// shows a check; announced as selected to screen readers.
class ChoicePills<T> extends StatelessWidget {
  const ChoicePills({super.key, required this.options, required this.selected, required this.onSelected});

  /// value → label.
  final Map<T, String> options;
  final T selected;
  final ValueChanged<T> onSelected;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.xs,
      children: [
        for (final e in options.entries)
          ChoiceChip(
            label: Text(e.value),
            selected: e.key == selected,
            showCheckmark: true,
            onSelected: (_) => onSelected(e.key),
            materialTapTargetSize: MaterialTapTargetSize.padded,
          ),
      ],
    );
  }
}

/// Horizontally scrolling row of filter chips with an optional "Filters (n)"
/// button that opens the full filter sheet.
///
/// ```dart
/// FilterBar(
///   activeCount: filters.count,
///   onOpenFilters: () => showAppBottomSheet(…),
///   chips: [AppFilterChip(label: 'CCS2', selected: …, onSelected: …), …],
/// )
/// ```
class FilterBar extends StatelessWidget {
  const FilterBar({super.key, required this.chips, this.onOpenFilters, this.activeCount = 0, this.padding});

  final List<Widget> chips;
  final VoidCallback? onOpenFilters;
  final int activeCount;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: padding ?? EdgeInsets.symmetric(horizontal: context.pageGutter),
      child: Row(
        children: [
          if (onOpenFilters != null) ...[
            Badge(
              isLabelVisible: activeCount > 0,
              label: Text('$activeCount'),
              child: ActionChip(
                avatar: const Icon(Icons.tune, size: 18),
                label: Text(l10n.commonFilters),
                tooltip: activeCount > 0 ? l10n.commonFiltersActive(activeCount) : null,
                onPressed: onOpenFilters,
                materialTapTargetSize: MaterialTapTargetSize.padded,
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
          ],
          for (var i = 0; i < chips.length; i++) ...[if (i > 0) const SizedBox(width: AppSpacing.sm), chips[i]],
        ],
      ),
    );
  }
}

/// Non-interactive label chip (e.g. range cycle "WLTP", connector type).
/// Prefer `Pill` (badges.dart) for new code; kept for existing screens.
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
