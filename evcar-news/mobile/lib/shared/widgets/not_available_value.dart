import 'package:flutter/material.dart';

import '../../core/l10n/l10n.dart';

/// Shows "غير متوفر / Not available" for a missing value.
///
/// A missing value is `null` from the API and must never be rendered as 0
/// (ARCHITECTURE §3). Use [ValueOrNotAvailable] when the value may exist.
class NotAvailableValue extends StatelessWidget {
  const NotAvailableValue({super.key, this.style, this.textAlign});

  final TextStyle? style;
  final TextAlign? textAlign;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final base = style ?? theme.textTheme.bodyMedium;
    return Text(
      context.l10n.commonNotAvailable,
      textAlign: textAlign,
      style: base?.copyWith(color: theme.colorScheme.onSurfaceVariant, fontStyle: FontStyle.italic),
    );
  }
}

/// Renders [value] (already formatted) or [NotAvailableValue] when null/empty.
class ValueOrNotAvailable extends StatelessWidget {
  const ValueOrNotAvailable(this.value, {super.key, this.style, this.textAlign});

  final String? value;
  final TextStyle? style;
  final TextAlign? textAlign;

  @override
  Widget build(BuildContext context) {
    final v = value;
    if (v == null || v.trim().isEmpty) return NotAvailableValue(style: style, textAlign: textAlign);
    return Text(v, style: style, textAlign: textAlign);
  }
}
