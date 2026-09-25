import '../../l10n/generated/app_localizations.dart';
import '../api/api_exception.dart';

/// A device permission (location, motion sensors, …) was refused.
///
/// Throw it from providers so `AsyncStateView` renders the
/// permission-denied state with a way forward (open settings / choose a
/// place manually), as required by REQUIREMENTS §3 and §19.
class PermissionDeniedException implements Exception {
  const PermissionDeniedException({required this.permission, this.permanentlyDenied = false});

  /// e.g. `location`, `motion`.
  final String permission;

  /// True when the OS will not show the prompt again (only settings can fix it).
  final bool permanentlyDenied;

  @override
  String toString() => 'PermissionDeniedException($permission, permanent: $permanentlyDenied)';
}

/// Visual state an error maps to.
enum ErrorStateKind { error, offline, permissionDenied, notConfigured }

/// Title/message pair to show for an error.
class ErrorPresentation {
  const ErrorPresentation(this.kind, this.title, this.message, {this.retryable = true});

  final ErrorStateKind kind;
  final String title;
  final String message;
  final bool retryable;
}

/// Classifies an error into the visual state it should produce.
ErrorStateKind classifyError(Object error) {
  if (error is PermissionDeniedException) return ErrorStateKind.permissionDenied;
  if (error is ApiException) {
    if (error.isConnectivityProblem) return ErrorStateKind.offline;
    if (error.kind == ApiErrorKind.notConfigured) return ErrorStateKind.notConfigured;
  }
  return ErrorStateKind.error;
}

/// Maps any error to a localized, user-facing presentation.
///
/// Server messages are already localized via `Accept-Language`, so they are
/// preferred for 4xx errors; transport errors use app strings.
ErrorPresentation presentError(AppLocalizations l10n, Object error) {
  if (error is PermissionDeniedException) {
    return ErrorPresentation(
      ErrorStateKind.permissionDenied,
      l10n.commonPermissionDeniedTitle,
      l10n.commonPermissionDeniedMessage,
    );
  }
  if (error is ApiException) {
    switch (error.kind) {
      case ApiErrorKind.network:
        return ErrorPresentation(ErrorStateKind.offline, l10n.commonOfflineTitle, l10n.commonOfflineMessage);
      case ApiErrorKind.timeout:
        return ErrorPresentation(ErrorStateKind.offline, l10n.commonOfflineTitle, l10n.commonTimeoutMessage);
      case ApiErrorKind.notConfigured:
        return ErrorPresentation(
          ErrorStateKind.notConfigured,
          l10n.commonNotConfiguredTitle,
          error.message ?? l10n.commonNotConfiguredMessage,
          retryable: false,
        );
      case ApiErrorKind.forbidden:
        return ErrorPresentation(
          ErrorStateKind.error,
          l10n.commonErrorTitle,
          error.message ?? l10n.commonForbiddenMessage,
          retryable: false,
        );
      case ApiErrorKind.notFound:
        return ErrorPresentation(
          ErrorStateKind.error,
          l10n.commonErrorTitle,
          error.message ?? l10n.commonNotFoundMessage,
          retryable: false,
        );
      case ApiErrorKind.rateLimited:
        return ErrorPresentation(
          ErrorStateKind.error,
          l10n.commonErrorTitle,
          error.message ?? l10n.commonRateLimitedMessage,
        );
      case ApiErrorKind.server:
        return ErrorPresentation(ErrorStateKind.error, l10n.commonErrorTitle, l10n.commonServerErrorMessage);
      case ApiErrorKind.cancelled:
      case ApiErrorKind.badRequest:
      case ApiErrorKind.unauthorized:
      case ApiErrorKind.conflict:
      case ApiErrorKind.validation:
      case ApiErrorKind.notImplemented:
      case ApiErrorKind.badResponse:
      case ApiErrorKind.unknown:
        return ErrorPresentation(ErrorStateKind.error, l10n.commonErrorTitle, error.message ?? l10n.commonErrorGeneric);
    }
  }
  return ErrorPresentation(ErrorStateKind.error, l10n.commonErrorTitle, l10n.commonErrorGeneric);
}

/// Short message for snackbars / inline form errors.
String errorMessage(AppLocalizations l10n, Object error) => presentError(l10n, error).message;
