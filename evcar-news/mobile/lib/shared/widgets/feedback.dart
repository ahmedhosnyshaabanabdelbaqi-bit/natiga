import 'package:flutter/material.dart';

import '../../app/theme/app_palette.dart';

/// Shows a floating snackbar with a leading icon (never colour alone).
///
/// ```dart
/// showAppSnackBar(context, l10n.commonFavoriteAdded, icon: Icons.favorite);
/// showAppSnackBar(context, errorMessage(l10n, e), tone: AppTone.danger);
/// ```
ScaffoldFeatureController<SnackBar, SnackBarClosedReason>? showAppSnackBar(
  BuildContext context,
  String message, {
  AppTone tone = AppTone.neutral,
  IconData? icon,
  String? actionLabel,
  VoidCallback? onAction,
  Duration duration = const Duration(seconds: 4),
}) {
  final messenger = ScaffoldMessenger.maybeOf(context);
  if (messenger == null) return null;
  final scheme = Theme.of(context).colorScheme;
  final leading =
      icon ??
      switch (tone) {
        AppTone.success => Icons.check_circle_outline,
        AppTone.warning => Icons.warning_amber_outlined,
        AppTone.danger => Icons.error_outline,
        AppTone.info || AppTone.brand => Icons.info_outline,
        _ => null,
      };
  messenger.hideCurrentSnackBar();
  return messenger.showSnackBar(
    SnackBar(
      duration: duration,
      content: Row(
        children: [
          if (leading != null) ...[Icon(leading, color: scheme.onInverseSurface, size: 20), const SizedBox(width: 12)],
          Expanded(child: Text(message)),
        ],
      ),
      action: actionLabel == null || onAction == null ? null : SnackBarAction(label: actionLabel, onPressed: onAction),
    ),
  );
}
