import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme/app_palette.dart';
import '../../app/theme/app_tokens.dart';
import '../../core/errors/app_errors.dart';
import '../../core/l10n/l10n.dart';

/// The non-data states every screen must design for (REQUIREMENTS §3).
enum StateKind { loading, empty, error, offline, permissionDenied, notConfigured, notSupported }

/// An extra action button on a state view (e.g. "Choose a city manually").
class StateAction {
  const StateAction({required this.label, required this.onPressed, this.icon, this.primary = false});

  final String label;
  final VoidCallback onPressed;
  final IconData? icon;

  /// Rendered as the filled (main) button.
  final bool primary;
}

/// Decorative illustration used by empty/error/offline/permission states:
/// soft tinted halo + gradient disc + icon. Hidden from screen readers (the
/// state's title and message carry the meaning).
class AppIllustration extends StatelessWidget {
  const AppIllustration({super.key, required this.icon, this.tone = AppTone.brand, this.size = 112});

  final IconData icon;
  final AppTone tone;
  final double size;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final colors = palette.tone(tone);
    final useBrand = tone == AppTone.brand;
    return ExcludeSemantics(
      child: SizedBox.square(
        dimension: size,
        child: Stack(
          alignment: Alignment.center,
          children: [
            // Halo.
            Container(
              decoration: BoxDecoration(shape: BoxShape.circle, color: colors.container.withValues(alpha: 0.7)),
            ),
            // Accent dots.
            PositionedDirectional(
              top: size * 0.08,
              end: size * 0.1,
              child: _Dot(size: size * 0.09, color: colors.border),
            ),
            PositionedDirectional(
              bottom: size * 0.12,
              start: size * 0.06,
              child: _Dot(size: size * 0.06, color: colors.border),
            ),
            // Disc.
            Container(
              width: size * 0.58,
              height: size * 0.58,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: useBrand ? palette.brandGradient : null,
                color: useBrand ? null : colors.onContainer,
                boxShadow: [
                  BoxShadow(
                    color: (useBrand ? Theme.of(context).colorScheme.primary : colors.onContainer).withValues(
                      alpha: 0.28,
                    ),
                    blurRadius: 18,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: Icon(icon, size: size * 0.28, color: useBrand ? Colors.white : colors.container),
            ),
          ],
        ),
      ),
    );
  }
}

class _Dot extends StatelessWidget {
  const _Dot({required this.size, required this.color});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(shape: BoxShape.circle, color: color),
  );
}

/// Full-area (or [compact]) message for loading/empty/error/offline/
/// permission-denied/not-configured/not-supported states, with optional
/// retry and actions.
///
/// Icons always come with text (never colour-only) and the message is a
/// live region so screen readers announce it. Prefer the named wrappers in
/// `state_views.dart` (`EmptyState`, `ErrorState`, …) in feature code.
class StateMessageView extends StatelessWidget {
  const StateMessageView({
    super.key,
    required this.kind,
    this.title,
    this.message,
    this.onRetry,
    this.actions = const [],
    this.compact = false,
    this.icon,
  });

  final StateKind kind;
  final String? title;
  final String? message;
  final VoidCallback? onRetry;
  final List<StateAction> actions;
  final bool compact;

  /// Overrides the kind's default icon (e.g. `Icons.ev_station` for "no
  /// stations in this area").
  final IconData? icon;

  static IconData iconFor(StateKind kind) => switch (kind) {
    StateKind.loading => Icons.hourglass_empty,
    StateKind.empty => Icons.inbox_outlined,
    StateKind.error => Icons.error_outline,
    StateKind.offline => Icons.cloud_off_outlined,
    StateKind.permissionDenied => Icons.lock_outline,
    StateKind.notConfigured => Icons.settings_suggest_outlined,
    StateKind.notSupported => Icons.phone_iphone,
  };

  static AppTone toneFor(StateKind kind) => switch (kind) {
    StateKind.loading || StateKind.empty => AppTone.brand,
    StateKind.error => AppTone.danger,
    StateKind.offline => AppTone.neutral,
    StateKind.permissionDenied => AppTone.warning,
    StateKind.notConfigured || StateKind.notSupported => AppTone.info,
  };

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    if (kind == StateKind.loading) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Semantics(
            liveRegion: true,
            label: title ?? l10n.commonLoading,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const CircularProgressIndicator(),
                if (!compact) ...[
                  const SizedBox(height: AppSpacing.lg),
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
      StateKind.notSupported => (l10n.commonNotSupportedOnPlatformTitle, l10n.commonNotSupportedOnPlatformMessage),
      StateKind.error || StateKind.loading => (l10n.commonErrorTitle, l10n.commonErrorGeneric),
    };

    final buttons = <Widget>[
      if (onRetry != null)
        FilledButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh), label: Text(l10n.commonRetry)),
      for (final a in actions)
        if (a.primary && onRetry == null)
          FilledButton.icon(onPressed: a.onPressed, icon: Icon(a.icon ?? Icons.arrow_forward), label: Text(a.label))
        else
          OutlinedButton.icon(onPressed: a.onPressed, icon: Icon(a.icon ?? Icons.arrow_forward), label: Text(a.label)),
    ];

    final content = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (compact)
          Icon(icon ?? iconFor(kind), size: 32, color: kind == StateKind.error ? scheme.error : scheme.onSurfaceVariant)
        else
          AppIllustration(icon: icon ?? iconFor(kind), tone: toneFor(kind)),
        SizedBox(height: compact ? AppSpacing.sm : AppSpacing.xl),
        Semantics(
          header: true,
          child: Text(
            title ?? defaultTitle,
            textAlign: TextAlign.center,
            style: (compact ? theme.textTheme.titleSmall : theme.textTheme.titleLarge)?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          message ?? defaultMessage,
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
        ),
        if (buttons.isNotEmpty) SizedBox(height: compact ? AppSpacing.md : AppSpacing.xl),
        Wrap(alignment: WrapAlignment.center, spacing: AppSpacing.sm, runSpacing: AppSpacing.sm, children: buttons),
      ],
    );

    return Semantics(
      liveRegion: kind == StateKind.error || kind == StateKind.offline,
      container: true,
      child: compact
          ? Padding(padding: const EdgeInsets.all(AppSpacing.lg), child: content)
          : Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl, vertical: AppSpacing.xxl),
                child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 420), child: content),
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
///   loading: const Skeleton(child: SkeletonList(item: NewsCardSkeleton.compact())),
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
    this.emptyIcon,
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
  final IconData? emptyIcon;
  final List<StateAction> emptyActions;

  /// Alternatives offered when a permission is denied (e.g. "Open settings",
  /// "Choose a city manually").
  final List<StateAction> permissionActions;

  /// Shown while loading (use a [Skeleton] shaped like the content).
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
            icon: emptyIcon,
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

/// [AsyncStateView] for `CustomScrollView`s: data → [builder]'s slivers;
/// every other state fills the remaining viewport (so pull-to-refresh and
/// the app bar keep working).
class SliverAsyncStateView<T> extends StatelessWidget {
  const SliverAsyncStateView({
    super.key,
    required this.value,
    required this.builder,
    this.isEmpty,
    this.onRetry,
    this.emptyTitle,
    this.emptyMessage,
    this.emptyIcon,
    this.emptyActions = const [],
    this.permissionActions = const [],
    this.loading,
  });

  final AsyncValue<T> value;

  /// Returns a sliver (e.g. `SliverList`).
  final Widget Function(BuildContext context, T data) builder;
  final bool Function(T data)? isEmpty;
  final VoidCallback? onRetry;
  final String? emptyTitle;
  final String? emptyMessage;
  final IconData? emptyIcon;
  final List<StateAction> emptyActions;
  final List<StateAction> permissionActions;

  /// Box widget shown while loading (typically a [Skeleton]).
  final Widget? loading;

  @override
  Widget build(BuildContext context) {
    // Data (also while refreshing with previous data) → the caller's slivers.
    if (value.hasValue && !value.hasError) {
      final data = value.requireValue;
      if (!(isEmpty?.call(data) ?? false)) return builder(context, data);
    }
    return SliverFillRemaining(
      hasScrollBody: false,
      child: AsyncStateView<T>(
        value: value,
        builder: (context, _) => const SizedBox.shrink(),
        isEmpty: isEmpty,
        onRetry: onRetry,
        emptyTitle: emptyTitle,
        emptyMessage: emptyMessage,
        emptyIcon: emptyIcon,
        emptyActions: emptyActions,
        permissionActions: permissionActions,
        loading: loading,
      ),
    );
  }
}
