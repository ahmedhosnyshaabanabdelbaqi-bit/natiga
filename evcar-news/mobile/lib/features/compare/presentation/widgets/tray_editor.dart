import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../shared/widgets/kit.dart';
import 'compare_actions.dart';
import 'compare_labels.dart';
import 'comparison_view.dart';

/// The cars chosen for comparison (2–4 slots): change a car (trim / year /
/// market via the picker), move it, remove it, or add another one.
class CompareTrayEditor extends ConsumerWidget {
  const CompareTrayEditor({super.key, this.onNavigate});

  /// Called before leaving to the picker (e.g. to close a sheet).
  final VoidCallback? onNavigate;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final items = ref.watch(compareTrayProvider);
    final tray = ref.read(compareTrayProvider.notifier);
    final slots = items.length < CompareTrayController.minItems ? CompareTrayController.minItems : items.length;

    void openPicker({String? replaceKey}) {
      onNavigate?.call();
      context.push(comparePickerLocation(replaceKey: replaceKey));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < slots; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: i < items.length
                ? _FilledSlot(
                    selection: items[i],
                    number: i + 1,
                    canMoveUp: i > 0,
                    canMoveDown: i < items.length - 1,
                    onChange: () => openPicker(replaceKey: items[i].key),
                    onRemove: () {
                      tray.remove(items[i].key);
                      showAppSnackBar(context, l10n.compareRemoved(items[i].title), icon: Icons.delete_outline);
                    },
                    onMoveUp: () => tray.reorder(i, i - 1),
                    onMoveDown: () => tray.reorder(i, i + 1),
                  )
                : _EmptySlot(number: i + 1, onTap: () => openPicker()),
          ),
        if (items.length >= CompareTrayController.minItems && items.length < CompareTrayController.maxItems)
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton.icon(
              onPressed: () => openPicker(),
              icon: const Icon(Icons.add),
              label: Text(l10n.compareAddCarCount(items.length, CompareTrayController.maxItems)),
            ),
          ),
        if (items.length >= CompareTrayController.maxItems)
          Text(
            l10n.compareTrayFull(CompareTrayController.maxItems),
            style: Theme.of(context).textTheme.bodySmall
                ?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
          ),
      ],
    );
  }
}

class _FilledSlot extends StatelessWidget {
  const _FilledSlot({
    required this.selection,
    required this.number,
    required this.canMoveUp,
    required this.canMoveDown,
    required this.onChange,
    required this.onRemove,
    required this.onMoveUp,
    required this.onMoveDown,
  });

  final CompareSelection selection;
  final int number;
  final bool canMoveUp;
  final bool canMoveDown;
  final VoidCallback onChange;
  final VoidCallback onRemove;
  final VoidCallback onMoveUp;
  final VoidCallback onMoveDown;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final fmt = AppFormatters.of(context);
    final year = CompareLabels.year(fmt, selection.modelYear);
    final facts = [
      if (selection.subtitle != null && selection.subtitle!.trim().isNotEmpty) selection.subtitle!.trim(),
      l10n.compareSlotFacts(year, selection.marketCode),
    ].join(' · ');
    return AppCard(
      padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.xs, AppSpacing.sm),
      semanticLabel: l10n.compareCarNumbered(number, '${selection.title}, $facts'),
      child: Row(
        children: [
          CarNumberBadge(number: number),
          const SizedBox(width: AppSpacing.md),
          ImageWithFallback(
            url: selection.imageUrl,
            width: 56,
            height: 42,
            borderRadius: BorderRadius.circular(AppRadii.xs),
            fallbackIcon: Icons.directions_car_outlined,
            showFallbackText: false,
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(selection.title, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                Text(facts, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
              ],
            ),
          ),
          PopupMenuButton<String>(
            tooltip: l10n.compareCarActions(selection.title),
            icon: const Icon(Icons.more_vert),
            onSelected: (v) => switch (v) {
              'change' => onChange(),
              'up' => onMoveUp(),
              'down' => onMoveDown(),
              'remove' => onRemove(),
              _ => null,
            },
            itemBuilder: (context) => [
              PopupMenuItem(
                value: 'change',
                child: ListTile(leading: const Icon(Icons.swap_horiz), title: Text(l10n.compareChangeCar)),
              ),
              if (canMoveUp)
                PopupMenuItem(
                  value: 'up',
                  child: ListTile(leading: const Icon(Icons.arrow_upward), title: Text(l10n.compareMoveUp)),
                ),
              if (canMoveDown)
                PopupMenuItem(
                  value: 'down',
                  child: ListTile(leading: const Icon(Icons.arrow_downward), title: Text(l10n.compareMoveDown)),
                ),
              PopupMenuItem(
                value: 'remove',
                child: ListTile(leading: const Icon(Icons.delete_outline), title: Text(l10n.compareRemoveCar)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _EmptySlot extends StatelessWidget {
  const _EmptySlot({required this.number, required this.onTap});

  final int number;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    return Semantics(
      button: true,
      label: l10n.compareAddCarSlot(number),
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: AppRadii.card,
        child: Container(
          constraints: const BoxConstraints(minHeight: 64),
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            borderRadius: AppRadii.card,
            border: Border.all(color: theme.colorScheme.outline, width: 1.2),
          ),
          child: Row(
            children: [
              Container(
                width: 26,
                height: 26,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: theme.colorScheme.primary),
                ),
                child: Icon(Icons.add, size: 18, color: theme.colorScheme.primary),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.compareAddCarSlot(number),
                      style: theme.textTheme.titleSmall?.copyWith(
                        color: theme.colorScheme.primary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      l10n.compareAddCarHint,
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
