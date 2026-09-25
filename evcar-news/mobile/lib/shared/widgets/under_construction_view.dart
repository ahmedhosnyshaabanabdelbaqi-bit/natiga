import 'package:flutter/material.dart';

import '../../core/l10n/l10n.dart';

/// Honest placeholder for a screen that is not implemented yet.
///
/// It shows no data and does not pretend anything works. Each feature
/// folder wraps it in its own screen class so the team building that feature
/// replaces only its own folder.
class UnderConstructionView extends StatelessWidget {
  const UnderConstructionView({super.key, this.requestedPath});

  /// Shown as a caption to make deep-link testing visible (e.g. `/news/x`).
  final String? requestedPath;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: Semantics(
            container: true,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.construction_outlined, size: 56, color: theme.colorScheme.primary),
                const SizedBox(height: 16),
                Semantics(
                  header: true,
                  child: Text(
                    l10n.commonUnderConstructionTitle,
                    textAlign: TextAlign.center,
                    style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  l10n.commonUnderConstructionMessage,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
                if (requestedPath != null) ...[
                  const SizedBox(height: 12),
                  Directionality(
                    // Paths are Latin; keep them LTR inside Arabic text.
                    textDirection: TextDirection.ltr,
                    child: Text(
                      l10n.commonUnderConstructionRequested(requestedPath!),
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A full screen (app bar + [UnderConstructionView]) for placeholder routes.
class UnderConstructionScreen extends StatelessWidget {
  const UnderConstructionScreen({super.key, required this.title, this.requestedPath, this.actions});

  final String title;
  final String? requestedPath;
  final List<Widget>? actions;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title), actions: actions),
      body: UnderConstructionView(requestedPath: requestedPath),
    );
  }
}
