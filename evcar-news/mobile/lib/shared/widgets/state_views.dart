import 'package:flutter/material.dart';

import '../../core/errors/app_errors.dart';
import '../../core/l10n/l10n.dart';
import 'async_state_view.dart';

export 'async_state_view.dart' show AppIllustration, StateAction, StateKind, StateMessageView;

/// "Nothing here yet" with an illustration, a specific title/message and a
/// way forward. Always explain *why* it is empty and what to do next.
///
/// ```dart
/// EmptyState(
///   icon: Icons.ev_station_outlined,
///   title: l10n.chargingNoStationsTitle,
///   message: l10n.chargingNoStationsMessage,
///   actions: [StateAction(label: l10n.chargingZoomOut, onPressed: zoomOut, primary: true)],
/// )
/// ```
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    this.icon = Icons.inbox_outlined,
    this.title,
    this.message,
    this.actions = const [],
    this.compact = false,
  });

  final IconData icon;
  final String? title;
  final String? message;
  final List<StateAction> actions;
  final bool compact;

  @override
  Widget build(BuildContext context) => StateMessageView(
    kind: StateKind.empty,
    icon: icon,
    title: title,
    message: message,
    actions: actions,
    compact: compact,
  );
}

/// Error for any thrown object: offline, not configured (503
/// `INTEGRATION_NOT_CONFIGURED`), permission denied or a generic/server
/// error, with a localized message and retry when retrying can help.
class ErrorState extends StatelessWidget {
  const ErrorState({super.key, required this.error, this.onRetry, this.actions = const [], this.compact = false});

  final Object error;
  final VoidCallback? onRetry;
  final List<StateAction> actions;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final p = presentError(context.l10n, error);
    return StateMessageView(
      kind: AsyncStateView.kindForError(error),
      title: p.title,
      message: p.message,
      onRetry: p.retryable ? onRetry : null,
      actions: actions,
      compact: compact,
    );
  }
}

/// "You're offline" state (use [ErrorState] when you have the error object).
class OfflineState extends StatelessWidget {
  const OfflineState({super.key, this.onRetry, this.message, this.actions = const [], this.compact = false});

  final VoidCallback? onRetry;
  final String? message;
  final List<StateAction> actions;
  final bool compact;

  @override
  Widget build(BuildContext context) =>
      StateMessageView(kind: StateKind.offline, message: message, onRetry: onRetry, actions: actions, compact: compact);
}

/// Device permissions the app asks for (only while in use, only when needed).
enum AppPermission { location, notifications, motion }

/// A permission was refused: explains why it is useful, offers the device
/// settings and — required by REQUIREMENTS §19 — an alternative that works
/// without it (e.g. "Choose a city manually").
class PermissionDeniedState extends StatelessWidget {
  const PermissionDeniedState({
    super.key,
    required this.permission,
    this.onOpenSettings,
    this.alternatives = const [],
    this.message,
    this.compact = false,
  });

  final AppPermission permission;

  /// Opens the OS settings (e.g. `Geolocator.openAppSettings`).
  final VoidCallback? onOpenSettings;
  final List<StateAction> alternatives;
  final String? message;
  final bool compact;

  static IconData iconFor(AppPermission p) => switch (p) {
    AppPermission.location => Icons.location_off_outlined,
    AppPermission.notifications => Icons.notifications_off_outlined,
    AppPermission.motion => Icons.screen_rotation_outlined,
  };

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final (title, defaultMessage) = switch (permission) {
      AppPermission.location => (l10n.commonPermissionLocationTitle, l10n.commonPermissionLocationMessage),
      AppPermission.notifications => (
        l10n.commonPermissionNotificationsTitle,
        l10n.commonPermissionNotificationsMessage,
      ),
      AppPermission.motion => (l10n.commonPermissionMotionTitle, l10n.commonPermissionMotionMessage),
    };
    return StateMessageView(
      kind: StateKind.permissionDenied,
      icon: iconFor(permission),
      title: title,
      message: message ?? defaultMessage,
      compact: compact,
      actions: [
        ...alternatives,
        if (onOpenSettings != null)
          StateAction(label: l10n.commonOpenSettings, icon: Icons.settings_outlined, onPressed: onOpenSettings!),
      ],
    );
  }
}

/// Shown by features that cannot run on the web design preview (360°
/// WebView, local reminders, …). Production targets are Android and iOS.
class NotSupportedOnPlatformState extends StatelessWidget {
  const NotSupportedOnPlatformState({super.key, this.message, this.compact = false});

  final String? message;
  final bool compact;

  @override
  Widget build(BuildContext context) =>
      StateMessageView(kind: StateKind.notSupported, message: message, compact: compact);
}
