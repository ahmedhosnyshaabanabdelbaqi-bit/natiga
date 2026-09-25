import 'package:evcar_news/app/router/app_router.dart';
import 'package:evcar_news/shared/widgets/under_construction_view.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../helpers/test_app.dart';

/// Labels of the five tabs, in order.
const _ar = ['الرئيسية', 'السيارات', 'المقارنات', 'الشحن', 'حسابي'];
const _en = ['Home', 'Cars', 'Compare', 'Charging', 'Account'];

Finder navLabel(String label) => find.descendant(of: find.byType(NavigationBar), matching: find.text(label));

void main() {
  for (final (lang, labels, direction) in [('ar', _ar, TextDirection.rtl), ('en', _en, TextDirection.ltr)]) {
    group('shell ($lang)', () {
      testWidgets('shows five localized tabs with the right text direction', (tester) async {
        await pumpTestApp(tester, language: lang, features: allFeaturesOn);
        for (final l in labels) {
          expect(navLabel(l), findsOneWidget, reason: l);
        }
        expect(Directionality.of(tester.element(find.byType(NavigationBar))), direction);
        // Home tab is selected and is an honest placeholder.
        expect(find.byType(UnderConstructionView), findsOneWidget);
        expect(tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex, 0);
      });

      testWidgets('switches tabs', (tester) async {
        await pumpTestApp(tester, language: lang, features: allFeaturesOn);
        final titles = lang == 'ar'
            ? ['دليل السيارات', 'المقارنات', 'محطات الشحن', 'حسابي']
            : ['Car catalog', 'Comparisons', 'Charging stations', 'My account'];
        for (var i = 1; i < 5; i++) {
          await tester.tap(navLabel(labels[i]));
          await tester.pumpAndSettle();
          expect(tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex, i);
          expect(
            find.descendant(of: find.byType(AppBar), matching: find.text(titles[i - 1])),
            findsOneWidget,
            reason: 'tab $i',
          );
        }
        // The guest account card.
        expect(find.text(lang == 'ar' ? 'أنت تتصفح كزائر' : "You're browsing as a guest"), findsOneWidget);
      });

      testWidgets('keeps each tab\'s scroll position when switching tabs', (tester) async {
        await pumpTestApp(tester, language: lang, features: allFeaturesOn);
        await tester.tap(navLabel(labels[4]));
        await tester.pumpAndSettle();

        final list = find.byKey(const PageStorageKey('account-list'));
        await tester.drag(list, const Offset(0, -300));
        await tester.pumpAndSettle();
        final scrollable = find.descendant(of: list, matching: find.byType(Scrollable));
        final offset = tester.state<ScrollableState>(scrollable).position.pixels;
        expect(offset, greaterThan(0));

        await tester.tap(navLabel(labels[0]));
        await tester.pumpAndSettle();
        await tester.tap(navLabel(labels[4]));
        await tester.pumpAndSettle();
        expect(tester.state<ScrollableState>(scrollable).position.pixels, offset);
      });
    });
  }

  testWidgets('deep links open the matching screens (full screen over the shell)', (tester) async {
    await pumpTestApp(tester, language: 'en', features: allFeaturesOn);
    final router = tester.container().read(routerProvider);

    router.go('/n/byd-seal-review');
    await tester.pumpAndSettle();
    expect(find.text('Requested route: /news/byd-seal-review'), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);

    router.go('/compare/Ab12');
    await tester.pumpAndSettle();
    expect(find.text('Requested route: /compare/s/Ab12'), findsOneWidget);

    router.go('/cars/bmw-ix/tour/t-1');
    await tester.pumpAndSettle();
    expect(find.text('360° interior tour'), findsOneWidget);

    router.go('/this/does/not/exist');
    await tester.pumpAndSettle();
    expect(find.text('Page not found'), findsOneWidget);
    await tester.tap(find.text('Back to home'));
    await tester.pumpAndSettle();
    expect(find.byType(NavigationBar), findsOneWidget);
  });

  testWidgets('guests opening an account-only page are sent to sign-in', (tester) async {
    await pumpTestApp(tester, language: 'en');
    final router = tester.container().read(routerProvider);
    router.go('/account/profile');
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, 'Sign in'), findsOneWidget);
    expect(router.routerDelegate.currentConfiguration.uri.queryParameters['from'], '/account/profile');
  });

  testWidgets('personal features explain why an account is needed', (tester) async {
    await pumpTestApp(tester, language: 'ar', features: allFeaturesOn);
    tester.container().read(routerProvider).go('/garage');
    await tester.pumpAndSettle();
    expect(find.text('سجّل الدخول للمتابعة'), findsOneWidget);
    expect(find.text('تسجيل الدخول'), findsOneWidget);
  });

  testWidgets('offline banner appears when connectivity is lost', (tester) async {
    final h = await pumpTestApp(tester, language: 'en');
    expect(find.text('You are offline'), findsNothing);
    h.connectivity.setOnline(false);
    await tester.pumpAndSettle();
    expect(find.text('You are offline'), findsOneWidget);
    h.connectivity.setOnline(true);
    await tester.pumpAndSettle();
    expect(find.text('You are offline'), findsNothing);
  });

  testWidgets('in-app text size multiplies (never replaces) the system font scale', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2.0;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await pumpTestApp(tester, language: 'en', prefs: {'settings.textScale': 1.25});
    final scaler = MediaQuery.textScalerOf(tester.element(find.byType(NavigationBar)));
    expect(scaler.scale(10), closeTo(25, 0.001));
  });

  group('features the server does not announce stay hidden (REQUIREMENTS §21)', () {
    testWidgets('only Home and Account tabs when catalog, comparisons and stations are off', (tester) async {
      await pumpTestApp(tester, language: 'en');
      for (final l in ['Home', 'Account']) {
        expect(navLabel(l), findsOneWidget, reason: l);
      }
      for (final l in ['Cars', 'Compare', 'Charging']) {
        expect(navLabel(l), findsNothing, reason: l);
      }
      // Search and notifications have no content to offer yet.
      expect(find.byTooltip('Search'), findsNothing);
      expect(find.byTooltip('Notifications'), findsNothing);
      // Switching tabs still works with the reduced bar.
      await tester.tap(navLabel('Account'));
      await tester.pumpAndSettle();
      expect(find.descendant(of: find.byType(AppBar), matching: find.text('My account')), findsOneWidget);
      expect(tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex, 1);
    });

    testWidgets('only enabled tabs are shown, in order', (tester) async {
      await pumpTestApp(tester, language: 'en', features: const {'stations': true});
      final bar = tester.widget<NavigationBar>(find.byType(NavigationBar));
      expect(bar.destinations.length, 3);
      await tester.tap(navLabel('Charging'));
      await tester.pumpAndSettle();
      expect(find.descendant(of: find.byType(AppBar), matching: find.text('Charging stations')), findsOneWidget);
    });

    testWidgets('links into a disabled feature land on Home', (tester) async {
      await pumpTestApp(tester, language: 'en');
      final router = tester.container().read(routerProvider);
      for (final location in ['/n/byd-seal', '/cars/bmw-ix', '/compare/Ab12', '/garage', '/search', '/trips']) {
        router.go(location);
        await tester.pumpAndSettle();
        expect(router.routerDelegate.currentConfiguration.uri.path, '/', reason: location);
        expect(find.byType(NavigationBar), findsOneWidget, reason: location);
      }
      // Always-available pages still open.
      router.go('/settings');
      await tester.pumpAndSettle();
      expect(router.routerDelegate.currentConfiguration.uri.path, '/settings');
    });

    testWidgets('account tiles follow the flags', (tester) async {
      await pumpTestApp(tester, language: 'en', features: const {'calculators': true});
      await tester.tap(navLabel('Account'));
      await tester.pumpAndSettle();
      expect(find.text('Charging & running-cost calculators'), findsOneWidget);
      for (final hidden in ['My garage', 'Favorites', 'Charging log', 'Reminders', 'EV encyclopedia']) {
        expect(find.text(hidden), findsNothing, reason: hidden);
      }
      // Offline reading of saved items is local and always available.
      expect(find.text('Saved for offline reading'), findsOneWidget);
    });
  });
}
