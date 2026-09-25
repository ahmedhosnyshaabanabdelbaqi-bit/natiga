/// Every route of the app. Build locations with these helpers instead of
/// string literals so paths stay consistent with the router and deep links.
///
/// Tab roots live inside the bottom-navigation shell; every other route is
/// pushed full-screen on the root navigator, so opening e.g. a car from the
/// Home tab keeps the Home tab (and its scroll position) underneath.
abstract final class AppRoutes {
  // Bottom navigation tabs.
  static const home = '/';
  static const cars = '/cars';
  static const compare = '/compare';
  static const charging = '/charging';
  static const account = '/account';

  // News.
  static const news = '/news';
  static String article(String slug) => '/news/${_seg(slug)}';

  // Car catalog & tours.
  static String car(String slug) => '/cars/${_seg(slug)}';
  static String brand(String slug) => '/brands/${_seg(slug)}';
  static String tour(String carSlug, String tourId) => '/cars/${_seg(carSlug)}/tour/${_seg(tourId)}';

  // Comparisons.
  static String sharedComparison(String shareId) => '/compare/s/${_seg(shareId)}';
  static const recommendations = '/recommendations';

  // Charging.
  static String station(String id) => '/charging/stations/${_seg(id)}';
  static const trips = '/trips';

  // Discovery & tools.
  static String search({String? query}) => _withQuery('/search', {'q': query});
  static const calculators = '/calculators';
  static const encyclopedia = '/encyclopedia';
  static String encyclopediaEntry(String slug) => '/encyclopedia/${_seg(slug)}';
  static const services = '/services';

  // Personal (account needed for sync; screens explain this to guests).
  static const garage = '/garage';
  static const chargingLogs = '/charging-logs';
  static const reminders = '/reminders';
  static const notifications = '/notifications';
  static const favorites = '/favorites';
  static const savedOffline = '/saved';
  static const settings = '/settings';

  // Account (inside the Account tab).
  static const profile = '/account/profile';
  static const sessions = '/account/sessions';
  static const deleteAccount = '/account/delete';

  // Auth.
  static const loginPath = '/auth/login';
  static const registerPath = '/auth/register';
  static const verifyEmailPath = '/auth/verify-email';
  static const forgotPasswordPath = '/auth/forgot-password';
  static const resetPasswordPath = '/auth/reset-password';

  static String login({String? from}) => _withQuery(loginPath, {'from': from});
  static String register({String? from}) => _withQuery(registerPath, {'from': from});
  static String verifyEmail({String? token, String? email}) =>
      _withQuery(verifyEmailPath, {'token': token, 'email': email});
  static const forgotPassword = forgotPasswordPath;
  static String resetPassword({String? token}) => _withQuery(resetPasswordPath, {'token': token});

  /// Routes that redirect guests to sign-in.
  static const authRequired = {profile, sessions, deleteAccount};

  static bool requiresAuth(String path) => authRequired.contains(path);

  /// Validates a post-login return location: must be an in-app absolute path
  /// (prevents open redirects such as `//evil.com` or `https://…`).
  static String? safeReturnPath(String? from) {
    if (from == null || from.isEmpty) return null;
    if (!from.startsWith('/') || from.startsWith('//') || from.contains('\\') || from.contains('://')) {
      return null;
    }
    if (from.startsWith('/auth/')) return null;
    return from;
  }

  static String _seg(String value) => Uri.encodeComponent(value);

  static String _withQuery(String path, Map<String, String?> query) {
    final q = <String, String>{
      for (final e in query.entries)
        if (e.value != null && e.value!.isNotEmpty) e.key: e.value!,
    };
    return q.isEmpty ? path : Uri(path: path, queryParameters: q).toString();
  }
}
