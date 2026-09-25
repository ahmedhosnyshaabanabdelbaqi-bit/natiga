import 'package:flutter/material.dart';

/// Standard content card: rounded, outlined, optional tap with ripple and a
/// merged semantics label so the card reads as one element.
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.all(16),
    this.semanticLabel,
    this.color,
  });

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;
  final String? semanticLabel;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    Widget body = Padding(padding: padding, child: child);
    if (onTap != null) {
      body = InkWell(onTap: onTap, child: body);
    }
    return Semantics(
      button: onTap != null,
      label: semanticLabel,
      container: true,
      child: Card(color: color, child: body),
    );
  }
}
