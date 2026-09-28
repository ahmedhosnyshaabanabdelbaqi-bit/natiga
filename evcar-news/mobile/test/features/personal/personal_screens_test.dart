import 'package:evcar_news/app/router/app_router.dart';
import 'package:evcar_news/app/router/app_routes.dart';
import 'package:evcar_news/core/auth/auth_tokens.dart';
import 'package:evcar_news/core/auth/token_storage.dart';
import 'package:evcar_news/core/notifications/local_notifications.dart';
import 'package:evcar_news/features/calculators/presentation/widgets/calc_result_view.dart';
import 'package:evcar_news/shared/widgets/sign_in_required_view.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/fake_http_adapter.dart';
import '../../helpers/test_app.dart';
import 'personal_models_test.dart' show userVehicleJson;

Map<String, dynamic> _page(List<Object> items) => {
  'data': items,
  'meta': {'page': 1, 'pageSize': 30, 'total': items.length, 'totalPages': 1},
};

/// Fake personal API with synthetic test data only.
FakeHttpAdapter _server() {
  return FakeHttpAdapter()
    ..on('GET /me', (_) => FakeResponse.json(200, {'data': fakeUserJson()}))
    ..on('GET /me/vehicles', (_) => FakeResponse.json(200, _page([userVehicleJson()])))
    ..on('GET /me/vehicles/v1', (_) => FakeResponse.json(200, {'data': userVehicleJson()}))
    ..on('GET /me/notifications/unread-count', (_) => FakeResponse.json(200, {'data': {'count': 1}}))
    ..on(
      'GET /me/notifications',
      (_) => FakeResponse.json(
        200,
        _page([
          {
            'id': 'n1',
            'type': 'news',
            'title': 'Test article published',
            'body': 'Synthetic test notification',
            'deepLink': '/news/test-article',
            'data': {},
            'isRead': false,
            'readAt': null,
            'createdAt': DateTime.now().toUtc().toIso8601String(),
          },
        ]),
      ),
    )
    ..on('POST /me/notifications/n1/read', (_) => FakeResponse.json(200, {
          'data': {'id': 'n1', 'type': 'news', 'title': 'Test article published', 'isRead': true, 'createdAt': '2026-09-27T10:00:00Z'},
        }))
    ..on(
      'GET /me/charging-logs/report',
      (_) => FakeResponse.json(200, {
        'data': {
          'period': {'from': null, 'to': null},
          'vehicleId': null,
          'totals': {
            'sessions': 1,
            'energyKwh': 30,
            'sessionsWithCost': 0,
            'sessionsWithoutCost': 1,
            'spend': [],
            'averageCostPerKwh': [],
          },
          'byLocationType': [
            {'locationType': 'home', 'sessions': 1, 'energyKwh': 30},
          ],
          'months': [
            {'month': '2026-09', 'sessions': 1, 'energyKwh': 30, 'spend': []},
          ],
          'vehicles': [
            {
              'vehicleId': 'v1',
              'displayName': 'Test Brand Model 2025 Long Range',
              'sessions': 1,
              'energyKwh': 30,
              'spend': [],
              'distance': {'km': null, 'status': 'insufficient_data', 'reason': 'fewer_than_two_odometer_readings'},
              'consumption': {
                'kwhPer100km': null,
                'status': 'insufficient_data',
                'reason': 'fewer_than_two_odometer_readings',
                'confidence': null,
                'intervals': 0,
              },
              'costPer100km': {'value': null, 'status': 'insufficient_data', 'reason': 'missing_costs'},
            },
          ],
          'notes': ['Computed only from your entries.'],
        },
      }),
    )
    ..on('POST /trips/plan', (_) => FakeResponse.error(503, 'INTEGRATION_NOT_CONFIGURED', message: 'Routing is not configured'));
}

Future<FakeHttpAdapter> _pump(
  WidgetTester tester, {
  String language = 'en',
  bool signedIn = true,
  bool bigText = false,
  bool dark = false,
}) async {
  tester.view.physicalSize = const Size(360, 780) * 3;
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  if (bigText) {
    tester.platformDispatcher.textScaleFactorTestValue = 1.25;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  }
  final server = _server();
  await pumpTestApp(
    tester,
    language: language,
    adapter: server,
    features: allFeaturesOn,
    tokens: signedIn ? InMemoryTokenStorage(const AuthTokens(accessToken: 'a', refreshToken: 'r')) : null,
    prefs: {if (bigText) 'settings.textScale': 1.6, 'settings.themeMode': dark ? 'dark' : 'light'},
    extraOverrides: [localNotificationsProvider.overrideWithValue(FakeLocalNotificationService())],
  );
  return server;
}

Future<void> _go(WidgetTester tester, String location) async {
  tester.container().read(routerProvider).go(location);
  await tester.pumpAndSettle();
}

Future<void> _scrollThrough(WidgetTester tester) async {
  final scrollable = find.byType(Scrollable).first;
  for (var i = 0; i < 12; i++) {
    await tester.drag(scrollable, const Offset(0, -400));
    await tester.pump();
  }
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('home charging calculator computes the §23 vector on the device (guest, offline-capable)', (tester) async {
    final server = await _pump(tester, signedIn: false);
    await _go(tester, AppRoutes.calculator(CalculatorKinds.homeCharging));
    await tester.enterText(find.byKey(const Key('calc-batteryUsableKwh')), '60');
    await tester.enterText(find.byKey(const Key('calc-fromSocPercent')), '20');
    await tester.enterText(find.byKey(const Key('calc-toSocPercent')), '80');
    await tester.enterText(find.byKey(const Key('calc-efficiency')), '0.9');
    await tester.enterText(find.byKey(const Key('calc-tariff.energyPerKwh')), '2');
    await tester.ensureVisible(find.text('Calculate'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Calculate'));
    await tester.pumpAndSettle();
    expect(find.byType(CalcResultPanel), findsOneWidget);
    expect(find.textContaining('36 kWh × (80% − 20%)'), findsNothing); // formula of the backend: usable × (to − from)
    expect(find.text('60 kWh × (80% − 20%) = 36 kWh'), findsOneWidget);
    expect(find.text('36 kWh ÷ 0.9 = 40 kWh'), findsOneWidget);
    expect(find.text('EGP 80'), findsWidgets);
    expect(find.text('Price date not given'), findsOneWidget);
    // Nothing was sent to the server.
    expect(server.requests.where((r) => r.path.startsWith('/calculators')), isEmpty);
  });

  testWidgets('invalid calculator input is shown on the field, no result', (tester) async {
    await _pump(tester, signedIn: false, language: 'ar');
    await _go(tester, AppRoutes.calculator(CalculatorKinds.homeCharging));
    await tester.enterText(find.byKey(const Key('calc-batteryUsableKwh')), '0');
    await tester.enterText(find.byKey(const Key('calc-fromSocPercent')), '20');
    await tester.enterText(find.byKey(const Key('calc-toSocPercent')), '80');
    await tester.enterText(find.byKey(const Key('calc-tariff.energyPerKwh')), '2');
    await tester.ensureVisible(find.text('احسب'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('احسب'));
    await tester.pumpAndSettle();
    expect(find.text('يجب أن تكون القيمة أكبر من صفر.'), findsOneWidget);
    expect(find.byType(CalcResultPanel), findsNothing);
  });

  testWidgets('guests see the sign-in explanation on personal screens', (tester) async {
    await _pump(tester, signedIn: false);
    for (final location in [AppRoutes.garage, AppRoutes.chargingLogs, AppRoutes.reminders, AppRoutes.notifications]) {
      await _go(tester, location);
      expect(find.byType(SignInRequiredView), findsOneWidget, reason: location);
    }
  });

  testWidgets('garage lists the car with market warning; report shows insufficient data, never 0', (tester) async {
    await _pump(tester);
    await _go(tester, AppRoutes.garage);
    expect(find.text('Test Brand Model 2025 Long Range'), findsWidgets);
    expect(find.text('Not sold in this market'), findsOneWidget);
    await _go(tester, AppRoutes.chargingLogReports);
    expect(find.textContaining('1 session has no cost'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Insufficient data: some costs missing'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Insufficient data: needs 2+ odometer readings'), findsWidgets);
    expect(find.text('Insufficient data: some costs missing'), findsOneWidget);
    expect(find.text('0 km'), findsNothing);
  });

  testWidgets('tapping a notification marks it read and opens its in-app link', (tester) async {
    final server = await _pump(tester);
    await _go(tester, AppRoutes.notifications);
    expect(find.text('Test article published'), findsOneWidget);
    expect(find.text('New'), findsOneWidget);
    await tester.tap(find.text('Test article published'));
    await tester.pumpAndSettle();
    expect(server.requestsTo('POST /me/notifications/n1/read'), hasLength(1));
    final router = tester.container().read(routerProvider);
    // Pushed on top of the notification centre.
    expect(router.routerDelegate.currentConfiguration.matches.last.matchedLocation, '/news/test-article');
  });

  testWidgets('trip planner refuses honestly when routing is not configured', (tester) async {
    await _pump(tester);
    await _go(tester, AppRoutes.trips);
    expect(find.text('Trip planner'), findsWidgets);
    // Without the required inputs nothing is sent.
    await tester.ensureVisible(find.text('Plan my trip'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Plan my trip'));
    await tester.pumpAndSettle();
    expect(find.text('Choose where you start.'), findsOneWidget);
  });

  group('layouts at 200% text', () {
    for (final (lang, dark) in [('ar', true), ('en', false)]) {
      testWidgets('personal screens do not overflow ($lang, dark: $dark)', (tester) async {
        await _pump(tester, language: lang, bigText: true, dark: dark);
        for (final location in [
          AppRoutes.account,
          AppRoutes.garage,
          AppRoutes.garageVehicle('v1'),
          AppRoutes.garageAdd,
          AppRoutes.chargingLogReports,
          AppRoutes.chargingLogNew,
          AppRoutes.reminderNew,
          AppRoutes.notifications,
          AppRoutes.calculators,
          AppRoutes.calculator(CalculatorKinds.totalCostOfOwnership),
          AppRoutes.calculator(CalculatorKinds.publicCharging),
          AppRoutes.trips,
        ]) {
          await _go(tester, location);
          await _scrollThrough(tester);
          expect(tester.takeException(), isNull, reason: location);
        }
      });
    }
  });
}
