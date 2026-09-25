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

  // News (+ reviews/guides via `?type=`).
  static const news = '/news';
  static String newsList({String? type, String? category}) => _withQuery(news, {'type': type, 'category': category});
  static String article(String slug) => '/news/${_seg(slug)}';
  static String newsCategory(String slug) => '/news/category/${_seg(slug)}';
  static String newsTag(String slug) => '/news/tag/${_seg(slug)}';

  // Car catalog & tours.
  static String car(String slug) => '/cars/${_seg(slug)}';
  static String carGallery(String slug) => '/cars/${_seg(slug)}/gallery';
  static const brands = '/brands';
  static String brand(String slug) => '/brands/${_seg(slug)}';

  /// Full spec sheet of one trim (variant slug).
  static String variant(String slug) => '/variants/${_seg(slug)}';
  static String tour(String carSlug, String tourId) => '/cars/${_seg(carSlug)}/tour/${_seg(tourId)}';
  static const tours = '/tours';

  // Comparisons.
  static String sharedComparison(String shareId) => '/compare/s/${_seg(shareId)}';
  static const comparePicker = '/compare/pick';
  static const recommendations = '/recommendations';

  // Charging (`/charging?view=list` opens the list side of map+list).
  static String chargingView({String? view}) => _withQuery(charging, {'view': view});
  static String station(String id) => '/charging/stations/${_seg(id)}';
  static String stationReport(String id) => '/charging/stations/${_seg(id)}/report';
  static String stationCheckIn(String id) => '/charging/stations/${_seg(id)}/check-in';
  static const chargingFilters = '/charging/filters';
  static const chargingLocation = '/charging/location';
  static const chargingSuggest = '/charging/suggest';
  static const trips = '/trips';

  // Discovery & tools.
  static String search({String? query}) => _withQuery('/search', {'q': query});
  static const calculators = '/calculators';

  /// One calculator: see [CalculatorKinds].
  static String calculator(String kind) => '/calculators/${_seg(kind)}';
  static const encyclopedia = '/encyclopedia';
  static String encyclopediaEntry(String slug) => '/encyclopedia/${_seg(slug)}';
  static const services = '/services';
  static String serviceProvider(String id) => '/services/${_seg(id)}';

  // Community (reviews, comments, Q&A).
  static String carReviews(String carSlug) => '/cars/${_seg(carSlug)}/reviews';
  static String writeCarReview(String carSlug) => '/cars/${_seg(carSlug)}/reviews/new';
  static String articleComments(String slug) => '/news/${_seg(slug)}/comments';
  static String questions({String? model}) => _withQuery('/questions', {'model': model});
  static const askQuestion = '/questions/ask';
  static String question(String id) => '/questions/${_seg(id)}';

  // Personal (account needed for sync; screens explain this to guests).
  static const garage = '/garage';
  static const garageAdd = '/garage/add';
  static String garageVehicle(String id) => '/garage/${_seg(id)}';
  static String garageVehicleEdit(String id) => '/garage/${_seg(id)}/edit';
  static const chargingLogs = '/charging-logs';
  static const chargingLogNew = '/charging-logs/new';
  static const chargingLogReports = '/charging-logs/reports';
  static String chargingLogEdit(String id) => '/charging-logs/${_seg(id)}/edit';
  static const reminders = '/reminders';
  static const reminderNew = '/reminders/new';
  static String reminderEdit(String id) => '/reminders/${_seg(id)}/edit';
  static const notifications = '/notifications';
  static const notificationPreferences = '/notifications/preferences';
  static const favorites = '/favorites';
  static const savedOffline = '/saved';
  static const settings = '/settings';

  /// Design-kit gallery (debug builds and the web preview only).
  static const designKit = '/dev/kit';

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

/// Calculator ids used in `/calculators/:kind` (REQUIREMENTS §13).
abstract final class CalculatorKinds {
  static const homeCharging = 'home-charging';
  static const publicCharging = 'public-charging';
  static const chargingTime = 'charging-time';
  static const costPer100Km = 'cost-per-100km';
  static const monthlyCost = 'monthly-cost';
  static const vsPetrol = 'vs-petrol';
  static const totalCostOfOwnership = 'tco';

  static const all = [
    homeCharging,
    publicCharging,
    chargingTime,
    costPer100Km,
    monthlyCost,
    vsPetrol,
    totalCostOfOwnership,
  ];
}
