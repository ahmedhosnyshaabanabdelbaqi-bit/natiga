import '../../../core/api/api_exception.dart';
import 'app_user.dart';

/// Session state of the app. Guests can use every public feature.
sealed class AuthState {
  const AuthState();

  AppUser? get user => switch (this) {
    AuthSignedIn(:final user) => user,
    _ => null,
  };

  bool get isSignedIn => this is AuthSignedIn;
  bool get isGuest => this is AuthGuest;
}

/// Startup: stored tokens are being validated. [error] is set when that
/// failed for a transient reason and no saved profile exists (retryable).
class AuthRestoring extends AuthState {
  const AuthRestoring({this.error});

  final ApiException? error;
}

/// No session. [sessionExpired] is true when a session just ended because
/// the server rejected it (the UI shows a one-time notice).
class AuthGuest extends AuthState {
  const AuthGuest({this.sessionExpired = false});

  final bool sessionExpired;
}

/// Signed in. [offline] means the profile shown is the saved copy because
/// the server could not be reached at startup.
class AuthSignedIn extends AuthState {
  const AuthSignedIn(this.user, {this.offline = false});

  @override
  final AppUser user;
  final bool offline;
}
