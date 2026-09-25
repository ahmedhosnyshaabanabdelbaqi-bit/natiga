import 'app_config.dart';

/// Feature flags of `GET /app-config` → `features` (backend FEATURE_FLAGS).
///
/// The server only announces a feature when its module is implemented AND
/// enabled by an admin (and its external service is configured), so the app
/// hides the tabs, tiles, routes and home sections of every other feature
/// (REQUIREMENTS §21: unfinished features stay hidden in production).
/// Unknown / missing flags are OFF.
abstract final class Features {
  static const news = 'news';
  static const cars = 'cars';
  static const comparisons = 'comparisons';
  static const interiorTours = 'interiorTours';
  static const stations = 'stations';
  static const calculators = 'calculators';
  static const garage = 'garage';
  static const favorites = 'favorites';
  static const chargingLogs = 'chargingLogs';
  static const reminders = 'reminders';
  static const encyclopedia = 'encyclopedia';
  static const notifications = 'notifications';
  static const community = 'community';
  static const tripPlanner = 'tripPlanner';
  static const servicesDirectory = 'servicesDirectory';
  static const assistant = 'assistant';
  static const ads = 'ads';
  static const exteriorSpin = 'exteriorSpin';

  /// Content that unified search looks through; search is shown when any is on.
  static const searchable = [news, cars, stations, encyclopedia];
}

/// The feature a location belongs to, or null when it is always available
/// (home, account, settings, sign-in, offline items).
String? featureForLocation(String path) {
  bool under(String root) => path == root || path.startsWith('$root/');

  // Community content nested in other features' paths (checked first).
  if (RegExp(r'^/cars/[^/]+/reviews(/|$)').hasMatch(path)) return Features.community;
  if (RegExp(r'^/news/[^/]+/comments$').hasMatch(path)) return Features.community;
  if (under('/questions')) return Features.community;

  if (under('/news')) return Features.news;
  if (RegExp(r'^/cars/[^/]+/tour/').hasMatch(path) || under('/tours')) return Features.interiorTours;
  if (under('/cars') || under('/brands') || under('/variants')) return Features.cars;
  if (under('/compare') || path == '/recommendations') return Features.comparisons;
  if (under('/charging')) return Features.stations;
  if (under('/trips')) return Features.tripPlanner;
  if (under('/calculators')) return Features.calculators;
  if (under('/encyclopedia')) return Features.encyclopedia;
  if (under('/services')) return Features.servicesDirectory;
  if (under('/garage')) return Features.garage;
  if (under('/charging-logs')) return Features.chargingLogs;
  if (under('/reminders')) return Features.reminders;
  if (under('/notifications')) return Features.notifications;
  if (under('/favorites')) return Features.favorites;
  return null;
}

/// Whether [path] may be shown with the given flags.
bool isLocationEnabled(String path, bool Function(String flag) enabled) {
  if (path == '/search') return Features.searchable.any(enabled);
  final flag = featureForLocation(path);
  return flag == null || enabled(flag);
}

/// Home section key (`/app-config` → `homeSections[].key`) → the feature
/// that provides its content.
const homeSectionFeatures = <String, String>{
  'top_story': Features.news,
  'latest_news': Features.news,
  'reviews': Features.news,
  'charging_guides': Features.news,
  'new_cars': Features.cars,
  'featured_comparisons': Features.comparisons,
  'interior_tours': Features.interiorTours,
  'nearby_stations': Features.stations,
};

/// Enabled, ordered home sections whose feature is on (unknown keys are hidden).
List<HomeSectionConfig> visibleHomeSections(AppConfig config) => [
  for (final s in config.orderedHomeSections)
    if (homeSectionFeatures[s.key] case final flag? when config.isFeatureEnabled(flag)) s,
];
