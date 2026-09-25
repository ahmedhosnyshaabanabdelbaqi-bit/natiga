import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/errors/app_errors.dart';
import '../../core/l10n/l10n.dart';

/// The non-data states every screen must design for (REQUIREMENTS §3).
enum StateKind { loading, empty, error, offline, permissionDenied, notConfigured }

/// An extra action button on a state view (e.g. "Choose a city manually").
class StateAction {
  const StateAction({required this.label, required this.onPressed, this.icon});

  final String label;
  final VoidCallback onPressed;
  final IconData? icon;
}

/// Full-area (or [compact]) message for loading/empty/error/offline/
/// permission-denied/not-configured states, with optional retry.
///
/// Icons always come with text (never colour-only) and the message is a
/// live region so screen readers announce it.
class StateMessageView extends StatelessWidget {
  const StateMessageView({
    super.key,
    required this.kind,
    this.title,
    this.message,
    this.onRetry,
    this.actions = const [],
    this.compact = false,
  });

  final StateKind kind;
  final String? title;
  final String? message;
  final VoidCallback? onRetry;
  final List<StateAction> actions;
  final bool compact;

  static IconData iconFor(StateKind kind) => switch (kind) {
    StateKind.loading => Icons.hourglass_empty,
    StateKind.empty => Icons.inbox_outlined,
    StateKind.error => Icons.error_outline,
    StateKind.offline => Icons.cloud_off_outlined,
    StateKind.permissionDenied => Icons.lock_outline,
    StateKind.notConfigured => Icons.settings_suggest_outlined,
  };

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    if (kind == StateKind.loading) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Semantics(
            liveRegion: true,
            label: title ?? l10n.commonLoading,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const CircularProgressIndicator(),
                if (!compact) ...[
                  const SizedBox(height: 16),
                  ExcludeSemantics(child: Text(title ?? l10n.commonLoading, style: theme.textTheme.bodyMedium)),
                ],
              ],
            ),
          ),
        ),
      );
    }

    final (defaultTitle, defaultMessage) = switch (kind) {
      StateKind.empty => (l10n.commonEmptyTitle, l10n.commonEmptyMessage),
      StateKind.offline => (l10n.commonOfflineTitle, l10n.commonOfflineMessage),
      StateKind.permissionDenied => (l10n.commonPermissionDeniedTitle, l10n.commonPermissionDeniedMessage),
      StateKind.notConfigured => (l10n.commonNotConfiguredTitle, l10n.commonNotConfiguredMessage),
      StateKind.error || StateKind.loading => (l10n.commonErrorTitle, l10n.commonErrorGeneric),
    };
    final iconColor = kind == StateKind.error ? scheme.error : scheme.onSurfaceVariant;

    final content = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(iconFor(kind), size: compact ? 32 : 56, color: iconColor),
        SizedBox(height: compact ? 8 : 16),
        Semantics(
          header: true,
          child: Text(
            title ?? defaultTitle,
            textAlign: TextAlign.center,
            style: (compact ? theme.textTheme.titleSmall : theme.textTheme.titleMedium)?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          message ?? defaultMessage,
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
        ),
        if (onRetry != null || actions.isNotEmpty) const SizedBox(height: 16),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 8,
          runSpacing: 8,
          children: [
            if (onRetry != null)
              FilledButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh), label: Text(l10n.commonRetry)),
            for (final a in actions)
              OutlinedButton.icon(
                onPressed: a.onPressed,
                icon: Icon(a.icon ?? Icons.arrow_forward),
                label: Text(a.label),
              ),
          ],
        ),
      ],
    );

    return Semantics(
      liveRegion: kind == StateKind.error || kind == StateKind.offline,
      container: true,
      child: compact
          ? Padding(padding: const EdgeInsets.all(16), child: content)
          : Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 480), child: content),
              ),
            ),
    );
  }
}

/// Renders an [AsyncValue] with consistent loading/empty/error/offline/
/// permission-denied states.
///
/// ```dart
/// AsyncStateView<List<Article>>(
///   value: ref.watch(latestArticlesProvider),
///   isEmpty: (items) => items.isEmpty,
///   onRetry: () => ref.invalidate(latestArticlesProvider),
///   builder: (context, items) => ArticleList(items),
/// )
/// ```
class AsyncStateView<T> extends StatelessWidget {
  const AsyncStateView({
    super.key,
    required this.value,
    required this.builder,
    this.isEmpty,
    this.onRetry,
    this.emptyTitle,
    this.emptyMessage,
    this.emptyActions = const [],
    this.permissionActions = const [],
    this.loading,
    this.compact = false,
  });

  final AsyncValue<T> value;
  final Widget Function(BuildContext context, T data) builder;
  final bool Function(T data)? isEmpty;
  final VoidCallback? onRetry;
  final String? emptyTitle;
  final String? emptyMessage;
  final List<StateAction> emptyActions;

  /// Alternatives offered when a permission is denied (e.g. "Open settings",
  /// "Choose a city manually").
  final List<StateAction> permissionActions;
  final Widget? loading;
  final bool compact;

  static StateKind kindForError(Object error) => switch (classifyError(error)) {
    ErrorStateKind.offline => StateKind.offline,
    ErrorStateKind.permissionDenied => StateKind.permissionDenied,
    ErrorStateKind.notConfigured => StateKind.notConfigured,
    ErrorStateKind.error => StateKind.error,
  };

  @override
  Widget build(BuildContext context) {
    return value.when(
      skipLoadingOnRefresh: true,
      skipLoadingOnReload: true,
      data: (data) {
        if (isEmpty?.call(data) ?? false) {
          return StateMessageView(
            kind: StateKind.empty,
            title: emptyTitle,
            message: emptyMessage,
            actions: emptyActions,
            compact: compact,
          );
        }
        return builder(context, data);
      },
      error: (error, _) {
        final p = presentError(context.l10n, error);
        final kind = kindForError(error);
        return StateMessageView(
          kind: kind,
          title: p.title,
          message: p.message,
          onRetry: p.retryable ? onRetry : null,
          actions: kind == StateKind.permissionDenied ? permissionActions : const [],
          compact: compact,
        );
      },
      loading: () => loading ?? StateMessageView(kind: StateKind.loading, compact: compact),
    );
  }
}
