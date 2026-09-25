import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router/app_routes.dart';
import '../../app/theme/app_palette.dart';
import '../../app/theme/app_tokens.dart';
import '../../core/l10n/l10n.dart';
import '../compare_tray.dart';
import 'feedback.dart';
import 'image_with_fallback.dart';

/// "Add to compare" / "In comparison" toggle for car and trim cards.
///
/// When the tray is full it explains the limit instead of silently failing.
class CompareToggleButton extends ConsumerWidget {
  const CompareToggleButton({super.key, required this.selection, this.expand = true});

  final CompareSelection selection;
  final bool expand;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final inTray = ref.watch(compareTrayProvider.select((items) => items.any((s) => s.key == selection.key)));
    void onPressed() {
      final result = ref.read(compareTrayProvider.notifier).toggle(selection);
      if (result == CompareAddResult.full) {
        showAppSnackBar(context, l10n.commonCompareFull(CompareTrayController.maxItems), tone: AppTone.warning);
      }
    }

    final button = inTray
        ? FilledButton.tonalIcon(
            onPressed: onPressed,
            icon: const Icon(Icons.check),
            label: Text(l10n.commonCompareInTray),
          )
        : OutlinedButton.icon(
            onPressed: onPressed,
            icon: const Icon(Icons.compare_arrows),
            label: Text(l10n.commonCompareAdd),
          );
    return Semantics(
      toggled: inTray,
      child: Tooltip(
        message: inTray ? l10n.commonCompareRemove : l10n.commonCompareAdd,
        child: expand ? SizedBox(width: double.infinity, child: button) : button,
      ),
    );
  }
}

/// Sticky bar showing the cars chosen for comparison ("2 of 4 selected")
/// with thumbnails, "Clear" and "Compare" (enabled from two cars). Hidden
/// while the tray is empty. Put it in `AppScaffold(bottomBar: …)` of car
/// screens.
class CompareTrayBar extends ConsumerWidget {
  const CompareTrayBar({super.key, this.onCompare});

  /// Defaults to opening the Compare tab.
  final VoidCallback? onCompare;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(compareTrayProvider);
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final canCompare = items.length >= CompareTrayController.minItems;

    final bar = items.isEmpty
        ? const SizedBox.shrink(key: ValueKey('compare-tray-empty'))
        : Material(
            key: const ValueKey('compare-tray'),
            color: theme.colorScheme.surface,
            elevation: 0,
            child: DecoratedBox(
              decoration: BoxDecoration(
                border: Border(top: BorderSide(color: theme.colorScheme.outlineVariant)),
                boxShadow: context.palette.cardShadow,
              ),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: EdgeInsets.fromLTRB(context.pageGutter, AppSpacing.sm, context.pageGutter, AppSpacing.sm),
                  child: Wrap(
                    alignment: WrapAlignment.spaceBetween,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    spacing: AppSpacing.md,
                    runSpacing: AppSpacing.sm,
                    children: [
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          for (final s in items)
                            Padding(
                              padding: const EdgeInsetsDirectional.only(end: 4),
                              child: ImageWithFallback(
                                url: s.imageUrl,
                                width: 40,
                                height: 30,
                                borderRadius: BorderRadius.circular(AppRadii.xs),
                                fallbackIcon: Icons.directions_car_outlined,
                                showFallbackText: false,
                              ),
                            ),
                          const SizedBox(width: AppSpacing.sm),
                          Semantics(
                            liveRegion: true,
                            child: Text(
                              l10n.commonCompareTrayCount(items.length, CompareTrayController.maxItems),
                              style: theme.textTheme.labelLarge,
                            ),
                          ),
                        ],
                      ),
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          TextButton(
                            onPressed: () => ref.read(compareTrayProvider.notifier).clear(),
                            child: Text(l10n.commonCompareClear),
                          ),
                          const SizedBox(width: AppSpacing.xs),
                          Tooltip(
                            message: canCompare ? l10n.commonCompareNow : l10n.commonCompareNeedTwo,
                            child: FilledButton.icon(
                              onPressed: canCompare ? (onCompare ?? () => context.go(AppRoutes.compare)) : null,
                              icon: const Icon(Icons.compare_arrows),
                              label: Text(l10n.commonCompareNow),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );

    return AnimatedSwitcher(
      duration: AppMotion.of(context, AppMotion.medium),
      transitionBuilder: (child, animation) => SizeTransition(
        sizeFactor: animation,
        alignment: AlignmentDirectional.topCenter,
        child: FadeTransition(opacity: animation, child: child),
      ),
      child: bar,
    );
  }
}
