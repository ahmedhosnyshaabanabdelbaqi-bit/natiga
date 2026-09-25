import 'package:evcar_news/app/router/app_router.dart';
import 'package:evcar_news/app/router/app_routes.dart';
import 'package:evcar_news/core/app_config/features.dart';
import 'package:evcar_news/shared/widgets/sign_in_required_view.dart';
import 'package:evcar_news/shared/widgets/under_construction_view.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers/test_app.dart';

/// Every planned screen and the feature that owns it. Placeholders must
/// exist for all of them so feature teams only edit their own folder.
final _public = <String, String>{
  AppRoutes.newsCategory('ev-batteries'): Features.news,
  AppRoutes.newsTag('byd'): Features.news,
  AppRoutes.article('a1'): Features.news,
  AppRoutes.brands: Features.cars,
  AppRoutes.brand('byd'): Features.cars,
  AppRoutes.car('byd-atto-3'): Features.cars,
  AppRoutes.carGallery('byd-atto-3'): Features.cars,
  AppRoutes.variant('byd-atto-3-extended-2025'): Features.cars,
  AppRoutes.tour('byd-atto-3', 't1'): Features.interiorTours,
  AppRoutes.tours: Features.interiorTours,
  AppRoutes.comparePicker: Features.comparisons,
  AppRoutes.sharedComparison('AbCdEf12'): Features.comparisons,
  AppRoutes.recommendations: Features.comparisons,
  AppRoutes.station('s1'): Features.stations,
  AppRoutes.stationReport('s1'): Features.stations,
  AppRoutes.stationCheckIn('s1'): Features.stations,
  AppRoutes.chargingFilters: Features.stations,
  AppRoutes.chargingLocation: Features.stations,
  AppRoutes.chargingSuggest: Features.stations,
  AppRoutes.trips: Features.tripPlanner,
  AppRoutes.calculators: Features.calculators,
  AppRoutes.calculator(CalculatorKinds.homeCharging): Features.calculators,
  AppRoutes.encyclopedia: Features.encyclopedia,
  AppRoutes.encyclopediaEntry('ccs2'): Features.encyclopedia,
  AppRoutes.services: Features.servicesDirectory,
  AppRoutes.serviceProvider('p1'): Features.servicesDirectory,
  AppRoutes.carReviews('byd-atto-3'): Features.community,
  AppRoutes.articleComments('a1'): Features.community,
  AppRoutes.questions(): Features.community,
  AppRoutes.question('q1'): Features.community,
  AppRoutes.notifications: Features.notifications,
  AppRoutes.favorites: Features.favorites,
};

/// Personal screens: guests see why an account is needed.
final _personal = <String, String>{
  AppRoutes.garage: Features.garage,
  AppRoutes.garageAdd: Features.garage,
  AppRoutes.garageVehicle('v1'): Features.garage,
  AppRoutes.garageVehicleEdit('v1'): Features.garage,
  AppRoutes.chargingLogs: Features.chargingLogs,
  AppRoutes.chargingLogNew: Features.chargingLogs,
  AppRoutes.chargingLogReports: Features.chargingLogs,
  AppRoutes.chargingLogEdit('l1'): Features.chargingLogs,
  AppRoutes.reminders: Features.reminders,
  AppRoutes.reminderNew: Features.reminders,
  AppRoutes.reminderEdit('r1'): Features.reminders,
  AppRoutes.notificationPreferences: Features.notifications,
  AppRoutes.writeCarReview('byd-atto-3'): Features.community,
  AppRoutes.askQuestion: Features.community,
};

void main() {
  test('every planned location maps to its feature flag', () {
    for (final e in {..._public, ..._personal}.entries) {
      expect(featureForLocation(Uri.parse(e.key).path), e.value, reason: e.key);
    }
    expect(featureForLocation('/charging-logs'), Features.chargingLogs, reason: 'not the charging map');
  });

  testWidgets('every public planned route opens its placeholder', (tester) async {
    await pumpTestApp(tester, language: 'en', features: allFeaturesOn);
    final router = tester.container().read(routerProvider);
    for (final location in _public.keys) {
      router.go(location);
      await tester.pumpAndSettle();
      expect(find.byType(UnderConstructionView), findsOneWidget, reason: location);
      expect(find.text('Requested route: $location'), findsOneWidget, reason: location);
    }
  });

  testWidgets('personal routes explain the account requirement to guests', (tester) async {
    await pumpTestApp(tester, language: 'ar', features: allFeaturesOn);
    final router = tester.container().read(routerProvider);
    for (final location in _personal.keys) {
      router.go(location);
      await tester.pumpAndSettle();
      expect(find.byType(SignInRequiredView), findsOneWidget, reason: location);
    }
  });

  testWidgets('routes of features the server does not announce go home', (tester) async {
    await pumpTestApp(tester, language: 'en');
    final router = tester.container().read(routerProvider);
    for (final location in [..._public.keys, ..._personal.keys]) {
      router.go(location);
      await tester.pumpAndSettle();
      expect(router.routerDelegate.currentConfiguration.uri.path, AppRoutes.home, reason: location);
    }
  });
}
