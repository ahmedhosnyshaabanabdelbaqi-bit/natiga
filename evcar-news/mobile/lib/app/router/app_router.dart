import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/app_config/app_config_controller.dart';
import '../../core/l10n/l10n.dart';
import '../../core/platform/platform_capabilities.dart';
import '../../features/account/presentation/account_screen.dart';
import '../../features/account/presentation/delete_account_screen.dart';
import '../../features/account/presentation/profile_screen.dart';
import '../../features/account/presentation/sessions_screen.dart';
import '../../features/auth/presentation/auth_controller.dart';
import '../../features/auth/presentation/forgot_password_screen.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/register_screen.dart';
import '../../features/auth/presentation/reset_password_screen.dart';
import '../../features/auth/presentation/verify_email_screen.dart';
import '../../features/calculators/presentation/calculator_screen.dart';
import '../../features/calculators/presentation/calculators_screen.dart';
import '../../features/cars/presentation/brand_screen.dart';
import '../../features/cars/presentation/brands_screen.dart';
import '../../features/cars/presentation/car_detail_screen.dart';
import '../../features/cars/presentation/car_gallery_screen.dart';
import '../../features/cars/presentation/cars_catalog_screen.dart';
import '../../features/cars/presentation/variant_detail_screen.dart';
import '../../features/charging/presentation/charging_filters_screen.dart';
import '../../features/charging/presentation/charging_location_screen.dart';
import '../../features/charging/presentation/charging_screen.dart';
import '../../features/charging/presentation/station_check_in_screen.dart';
import '../../features/charging/presentation/station_detail_screen.dart';
import '../../features/charging/presentation/station_report_screen.dart';
import '../../features/charging/presentation/station_suggest_screen.dart';
import '../../features/charging_logs/presentation/charging_log_edit_screen.dart';
import '../../features/charging_logs/presentation/charging_log_reports_screen.dart';
import '../../features/charging_logs/presentation/charging_logs_screen.dart';
import '../../features/community/presentation/article_comments_screen.dart';
import '../../features/community/presentation/ask_question_screen.dart';
import '../../features/community/presentation/car_reviews_screen.dart';
import '../../features/community/presentation/question_detail_screen.dart';
import '../../features/community/presentation/questions_screen.dart';
import '../../features/community/presentation/write_review_screen.dart';
import '../../features/compare/presentation/compare_picker_screen.dart';
import '../../features/compare/presentation/compare_screen.dart';
import '../../features/compare/presentation/recommendations_screen.dart';
import '../../features/compare/presentation/shared_comparison_screen.dart';
import '../../features/encyclopedia/presentation/encyclopedia_entry_screen.dart';
import '../../features/encyclopedia/presentation/encyclopedia_screen.dart';
import '../../features/favorites/presentation/favorites_screen.dart';
import '../../features/favorites/presentation/saved_offline_screen.dart';
import '../../features/garage/presentation/garage_screen.dart';
import '../../features/garage/presentation/garage_vehicle_edit_screen.dart';
import '../../features/garage/presentation/garage_vehicle_screen.dart';
import '../../features/home/presentation/home_screen.dart';
import '../../features/news/presentation/article_detail_screen.dart';
import '../../features/news/presentation/news_category_screen.dart';
import '../../features/news/presentation/news_list_screen.dart';
import '../../features/news/presentation/news_tag_screen.dart';
import '../../features/notifications/presentation/notification_preferences_screen.dart';
import '../../features/notifications/presentation/notifications_screen.dart';
import '../../features/reminders/presentation/reminder_edit_screen.dart';
import '../../features/reminders/presentation/reminders_screen.dart';
import '../../features/search/presentation/search_screen.dart';
import '../../features/services_directory/presentation/service_provider_screen.dart';
import '../../features/services_directory/presentation/services_directory_screen.dart';
import '../../features/settings/presentation/settings_screen.dart';
import '../../features/tours/presentation/tour_viewer_screen.dart';
import '../../features/tours/presentation/tours_screen.dart';
import '../../features/trips/presentation/trip_planner_screen.dart';
import '../../shared/widgets/async_state_view.dart';
import '../../shared/widgets/gallery/design_kit_gallery.dart';
import 'app_routes.dart';
import 'deep_links.dart';
import 'scaffold_with_nav_bar.dart';

/// The app's [GoRouter]. Re-evaluates redirects when the auth state changes
/// (without rebuilding the router, so navigation state is kept).
final routerProvider = Provider<GoRouter>((ref) {
  final authChanges = ValueNotifier<int>(0);
  ref.listen(authControllerProvider, (_, _) => authChanges.value++);
  // Feature flags can change when /app-config is (re)loaded.
  ref.listen(appConfigProvider.select((c) => c.features), (_, _) => authChanges.value++);

  final router = createAppRouter(
    refreshListenable: authChanges,
    redirect: (context, state) => appRedirect(
      state.uri,
      ref.read(authControllerProvider),
      isFeatureEnabled: (flag) => ref.read(appConfigProvider).isFeatureEnabled(flag),
    ),
  );
  ref.onDispose(() {
    router.dispose();
    authChanges.dispose();
  });
  return router;
});

/// Builds the router. Exposed for tests (custom initial location).
GoRouter createAppRouter({
  required GoRouterRedirect redirect,
  Listenable? refreshListenable,
  String initialLocation = AppRoutes.home,
}) {
  final rootKey = GlobalKey<NavigatorState>(debugLabel: 'root');

  // Full-screen routes pushed over the tab shell.
  GoRoute page(String path, Widget Function(GoRouterState s) build, {List<RouteBase> routes = const []}) =>
      GoRoute(path: path, parentNavigatorKey: rootKey, builder: (context, state) => build(state), routes: routes);

  // Nested full-screen route (inherits the parent's path parameters).
  GoRoute sub(String path, Widget Function(GoRouterState s) build, {List<RouteBase> routes = const []}) =>
      GoRoute(path: path, parentNavigatorKey: rootKey, builder: (context, state) => build(state), routes: routes);

  String p(GoRouterState s, String name) => s.pathParameters[name]!;
  String? q(GoRouterState s, String name) => s.uri.queryParameters[name];

  return GoRouter(
    navigatorKey: rootKey,
    initialLocation: initialLocation,
    refreshListenable: refreshListenable,
    redirect: redirect,
    errorBuilder: (context, state) => const RouteNotFoundScreen(),
    routes: [
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) => ScaffoldWithNavBar(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [GoRoute(path: AppRoutes.home, builder: (context, state) => const HomeScreen())],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: AppRoutes.cars, builder: (context, state) => const CarsCatalogScreen())],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: AppRoutes.compare, builder: (context, state) => const CompareScreen())],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: AppRoutes.charging, builder: (context, state) => const ChargingScreen())],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.account,
                builder: (context, state) => const AccountScreen(),
                routes: [
                  // Account sub-pages stay inside the Account tab.
                  GoRoute(path: 'profile', builder: (context, state) => const ProfileScreen()),
                  GoRoute(path: 'sessions', builder: (context, state) => const SessionsScreen()),
                  GoRoute(path: 'delete', builder: (context, state) => const DeleteAccountScreen()),
                ],
              ),
            ],
          ),
        ],
      ),

      // News (+ community comments).
      page(AppRoutes.news, (s) => const NewsListScreen()),
      page('/news/category/:slug', (s) => NewsCategoryScreen(slug: p(s, 'slug'))),
      page('/news/tag/:slug', (s) => NewsTagScreen(slug: p(s, 'slug'))),
      page(
        '/news/:slug',
        (s) => ArticleDetailScreen(slug: p(s, 'slug')),
        routes: [sub('comments', (s) => ArticleCommentsScreen(articleSlug: p(s, 'slug')))],
      ),

      // Cars, tours, owner reviews.
      page(
        '/cars/:slug',
        (s) => CarDetailScreen(slug: p(s, 'slug')),
        routes: [
          sub('tour/:tourId', (s) => TourViewerScreen(carSlug: p(s, 'slug'), tourId: p(s, 'tourId'))),
          sub('gallery', (s) => CarGalleryScreen(slug: p(s, 'slug'))),
          sub(
            'reviews',
            (s) => CarReviewsScreen(carSlug: p(s, 'slug')),
            routes: [sub('new', (s) => WriteReviewScreen(carSlug: p(s, 'slug')))],
          ),
        ],
      ),
      page(AppRoutes.brands, (s) => const BrandsScreen()),
      page('/brands/:slug', (s) => BrandScreen(slug: p(s, 'slug'))),
      page('/variants/:slug', (s) => VariantDetailScreen(slug: p(s, 'slug'))),
      page(AppRoutes.tours, (s) => const ToursScreen()),

      // Comparisons.
      page(AppRoutes.comparePicker, (s) => const ComparePickerScreen()),
      page('/compare/s/:shareId', (s) => SharedComparisonScreen(shareId: p(s, 'shareId'))),
      page(AppRoutes.recommendations, (s) => const RecommendationsScreen()),

      // Charging & trips.
      page(AppRoutes.chargingFilters, (s) => const ChargingFiltersScreen()),
      page(AppRoutes.chargingLocation, (s) => const ChargingLocationScreen()),
      page(AppRoutes.chargingSuggest, (s) => const StationSuggestScreen()),
      page(
        '/charging/stations/:id',
        (s) => StationDetailScreen(stationId: p(s, 'id')),
        routes: [
          sub('report', (s) => StationReportScreen(stationId: p(s, 'id'))),
          sub('check-in', (s) => StationCheckInScreen(stationId: p(s, 'id'))),
        ],
      ),
      page(AppRoutes.trips, (s) => const TripPlannerScreen()),

      // Discovery & tools.
      page('/search', (s) => SearchScreen(initialQuery: q(s, 'q'))),
      page(AppRoutes.calculators, (s) => const CalculatorsScreen()),
      page('/calculators/:kind', (s) => CalculatorScreen(kind: p(s, 'kind'))),
      page(AppRoutes.encyclopedia, (s) => const EncyclopediaScreen()),
      page('/encyclopedia/:slug', (s) => EncyclopediaEntryScreen(slug: p(s, 'slug'))),
      page(AppRoutes.services, (s) => const ServicesDirectoryScreen()),
      page('/services/:id', (s) => ServiceProviderScreen(providerId: p(s, 'id'))),

      // Community Q&A.
      page('/questions', (s) => QuestionsScreen(modelSlug: q(s, 'model'))),
      page(AppRoutes.askQuestion, (s) => const AskQuestionScreen()),
      page('/questions/:id', (s) => QuestionDetailScreen(questionId: p(s, 'id'))),

      // Personal.
      page(AppRoutes.garage, (s) => const GarageScreen()),
      page(AppRoutes.garageAdd, (s) => const GarageVehicleEditScreen()),
      page(
        '/garage/:id',
        (s) => GarageVehicleScreen(vehicleId: p(s, 'id')),
        routes: [sub('edit', (s) => GarageVehicleEditScreen(vehicleId: p(s, 'id')))],
      ),
      page(AppRoutes.chargingLogs, (s) => const ChargingLogsScreen()),
      page(AppRoutes.chargingLogNew, (s) => const ChargingLogEditScreen()),
      page(AppRoutes.chargingLogReports, (s) => const ChargingLogReportsScreen()),
      page('/charging-logs/:id/edit', (s) => ChargingLogEditScreen(logId: p(s, 'id'))),
      page(AppRoutes.reminders, (s) => const RemindersScreen()),
      page(AppRoutes.reminderNew, (s) => const ReminderEditScreen()),
      page('/reminders/:id/edit', (s) => ReminderEditScreen(reminderId: p(s, 'id'))),
      page(AppRoutes.notifications, (s) => const NotificationsScreen()),
      page(AppRoutes.notificationPreferences, (s) => const NotificationPreferencesScreen()),
      page(AppRoutes.favorites, (s) => const FavoritesScreen()),
      page(AppRoutes.savedOffline, (s) => const SavedOfflineScreen()),
      page(AppRoutes.settings, (s) => const SettingsScreen()),

      // Design-kit reference: debug builds and the web preview only.
      if (kDebugMode || PlatformCapabilities.current.isWebPreview)
        page(AppRoutes.designKit, (s) => const DesignKitGalleryScreen()),

      // Auth.
      page(AppRoutes.loginPath, (s) => LoginScreen(from: q(s, 'from'))),
      page(AppRoutes.registerPath, (s) => RegisterScreen(from: q(s, 'from'))),
      page(AppRoutes.verifyEmailPath, (s) => VerifyEmailScreen(token: q(s, 'token'), email: q(s, 'email'))),
      page(AppRoutes.forgotPasswordPath, (s) => const ForgotPasswordScreen()),
      page(AppRoutes.resetPasswordPath, (s) => ResetPasswordScreen(token: q(s, 'token'))),
    ],
  );
}

/// Shown for unknown locations (e.g. a web link the app does not handle).
class RouteNotFoundScreen extends StatelessWidget {
  const RouteNotFoundScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(),
      body: StateMessageView(
        kind: StateKind.empty,
        title: l10n.shellRouteNotFoundTitle,
        message: l10n.shellRouteNotFoundMessage,
        actions: [
          StateAction(label: l10n.shellGoHome, icon: Icons.home_outlined, onPressed: () => context.go(AppRoutes.home)),
        ],
      ),
    );
  }
}
