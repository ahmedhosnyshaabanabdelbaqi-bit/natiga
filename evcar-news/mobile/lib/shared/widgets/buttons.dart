import 'package:flutter/material.dart';

import '../../core/l10n/l10n.dart';

/// Main call to action (filled). Shows a spinner and ignores taps while
/// [loading]; [expand] stretches it to the available width (forms, sheets).
///
/// ```dart
/// PrimaryButton(label: l10n.garageAdd, icon: Icons.add, loading: saving, onPressed: save)
/// ```
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.loading = false,
    this.expand = false,
    this.destructive = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool loading;
  final bool expand;

  /// Uses the error colour (delete account, remove car…). Pair it with a
  /// clear label; colour alone never signals danger.
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final style = destructive
        ? FilledButton.styleFrom(backgroundColor: scheme.error, foregroundColor: scheme.onError)
        : null;
    final button = FilledButton(
      onPressed: loading ? null : onPressed,
      style: style,
      child: _ButtonContent(label: label, icon: icon, loading: loading),
    );
    return _wrap(context, button);
  }

  Widget _wrap(BuildContext context, Widget button) {
    final sized = expand ? SizedBox(width: double.infinity, child: button) : button;
    if (!loading) return sized;
    return Semantics(label: context.l10n.commonLoading, child: sized);
  }
}

/// Secondary action (outlined), same API as [PrimaryButton].
class SecondaryButton extends StatelessWidget {
  const SecondaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.loading = false,
    this.expand = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool loading;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final button = OutlinedButton(
      onPressed: loading ? null : onPressed,
      child: _ButtonContent(label: label, icon: icon, loading: loading),
    );
    final sized = expand ? SizedBox(width: double.infinity, child: button) : button;
    if (!loading) return sized;
    return Semantics(label: context.l10n.commonLoading, child: sized);
  }
}

class _ButtonContent extends StatelessWidget {
  const _ButtonContent({required this.label, required this.icon, required this.loading});

  final String label;
  final IconData? icon;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final leading = loading
        ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
        : icon == null
        ? null
        : Icon(icon, size: 20);
    final text = Flexible(child: Text(label, textAlign: TextAlign.center));
    if (leading == null) return Row(mainAxisSize: MainAxisSize.min, children: [text]);
    return Row(mainAxisSize: MainAxisSize.min, children: [leading, const SizedBox(width: 8), text]);
  }
}
