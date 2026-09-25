import 'package:flutter/material.dart';

import '../../app/theme/app_tokens.dart';
import '../../core/l10n/l10n.dart';
import 'buttons.dart';

/// Opens a modal bottom sheet with the app's standard chrome: drag handle,
/// title row with a close button, scrollable body (max 90% of the screen,
/// keyboard-aware) and an optional sticky footer.
///
/// ```dart
/// final applied = await showAppBottomSheet<StationFilters>(
///   context: context,
///   title: l10n.commonFilters,
///   builder: (context) => FiltersForm(initial: filters),
///   footer: (context) => PrimaryButton(label: l10n.commonApply, expand: true, onPressed: …),
/// );
/// ```
Future<T?> showAppBottomSheet<T>({
  required BuildContext context,
  required String title,
  required WidgetBuilder builder,
  WidgetBuilder? footer,
  bool useRootNavigator = true,
  bool isDismissible = true,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    useRootNavigator: useRootNavigator,
    isDismissible: isDismissible,
    constraints: BoxConstraints(maxWidth: 640, maxHeight: MediaQuery.sizeOf(context).height * 0.9),
    builder: (context) => AppSheet(title: title, footer: footer?.call(context), child: builder(context)),
  );
}

/// The body used by [showAppBottomSheet] (usable in custom sheets too).
class AppSheet extends StatelessWidget {
  const AppSheet({super.key, required this.title, required this.child, this.footer});

  final String title;
  final Widget child;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = context.l10n;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(AppSpacing.xl, 0, AppSpacing.sm, AppSpacing.sm),
            child: Row(
              children: [
                Expanded(
                  child: Semantics(header: true, child: Text(title, style: theme.textTheme.titleLarge)),
                ),
                IconButton(
                  tooltip: l10n.commonClose,
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.of(context).maybePop(),
                ),
              ],
            ),
          ),
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(AppSpacing.xl, 0, AppSpacing.xl, AppSpacing.xl),
              child: child,
            ),
          ),
          if (footer != null)
            DecoratedBox(
              decoration: BoxDecoration(
                border: Border(top: BorderSide(color: theme.colorScheme.outlineVariant)),
              ),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(AppSpacing.xl, AppSpacing.md, AppSpacing.xl, AppSpacing.md),
                  child: footer,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Confirmation sheet ("Delete this log entry?"). Resolves to `true` only
/// when the user confirms.
Future<bool> showConfirmSheet({
  required BuildContext context,
  required String title,
  required String message,
  required String confirmLabel,
  String? cancelLabel,
  bool destructive = false,
  IconData? icon,
}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    useRootNavigator: true,
    useSafeArea: true,
    isScrollControlled: true,
    constraints: const BoxConstraints(maxWidth: 560),
    builder: (context) {
      final theme = Theme.of(context);
      return SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.xl, 0, AppSpacing.xl, AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 40, color: destructive ? theme.colorScheme.error : theme.colorScheme.primary),
              const SizedBox(height: AppSpacing.md),
            ],
            Semantics(
              header: true,
              child: Text(title, style: theme.textTheme.titleLarge, textAlign: TextAlign.center),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: AppSpacing.xl),
            PrimaryButton(
              label: confirmLabel,
              expand: true,
              destructive: destructive,
              onPressed: () => Navigator.of(context).pop(true),
            ),
            const SizedBox(height: AppSpacing.sm),
            SecondaryButton(
              label: cancelLabel ?? context.l10n.commonCancel,
              expand: true,
              onPressed: () => Navigator.of(context).pop(false),
            ),
          ],
        ),
      );
    },
  );
  return result ?? false;
}
