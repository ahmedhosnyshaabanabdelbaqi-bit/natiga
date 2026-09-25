import '../../core/app_config/features.dart';
import '../../features/auth/domain/auth_state.dart';
import 'app_routes.dart';

/// Hosts whose links the app handles (Android App Links / iOS Universal
/// Links; see android/app/src/main/AndroidManifest.xml).
const deepLinkHosts = {'evcar.news', 'www.evcar.news'};

/// Maps public web URLs (`https://evcar.news/...`, served by the backend
/// `share` module) to in-app routes. Returns `null` when [uri] is already an
/// app route.
///
/// | Web URL                    | App route                 |
/// |----------------------------|---------------------------|
/// | `/n/<slug>`                | `/news/<slug>`            |
/// | `/cars/<slug>`             | `/cars/<slug>` (same)     |
/// | `/compare/<shareId>`       | `/compare/s/<shareId>`    |
/// | `/verify-email?token=`     | `/auth/verify-email?token=` |
/// | `/reset-password?token=`   | `/auth/reset-password?token=` |
String? deepLinkRedirect(Uri uri) {
  final segments = uri.pathSegments.where((s) => s.isNotEmpty).toList();
  final query = uri.hasQuery ? '?${uri.query}' : '';

  if (segments.length == 2 && segments[0] == 'n') {
    return '${AppRoutes.article(segments[1])}$query';
  }
  if (segments.length == 2 && segments[0] == 'compare' && segments[1] != 's') {
    return '${AppRoutes.sharedComparison(segments[1])}$query';
  }
  if (segments.length == 1 && segments[0] == 'verify-email') {
    return '${AppRoutes.verifyEmailPath}$query';
  }
  if (segments.length == 1 && segments[0] == 'reset-password') {
    return '${AppRoutes.resetPasswordPath}$query';
  }
  // Trailing slash on a known route (`/cars/x/`) → canonical form.
  if (uri.path.length > 1 && uri.path.endsWith('/')) {
    return '/${segments.map(Uri.encodeComponent).join('/')}$query';
  }
  return null;
}

/// Top-level redirect: deep-link mapping, auth-only routes, and bouncing
/// signed-in users away from the sign-in/register screens.
/// Locations of features the server does not announce (see [Features]) go
/// to Home: an unfinished feature is never reachable, not even by a link.
String? appRedirect(Uri uri, AuthState auth, {bool Function(String flag)? isFeatureEnabled}) {
  final mapped = deepLinkRedirect(uri);
  if (mapped != null) return mapped;

  final path = uri.path;
  if (isFeatureEnabled != null && !isLocationEnabled(path, isFeatureEnabled)) {
    return AppRoutes.home;
  }
  if (AppRoutes.requiresAuth(path) && auth is AuthGuest) {
    return AppRoutes.login(from: uri.toString());
  }
  if (auth is AuthSignedIn && (path == AppRoutes.loginPath || path == AppRoutes.registerPath)) {
    return AppRoutes.safeReturnPath(uri.queryParameters['from']) ?? AppRoutes.account;
  }
  return null;
}
