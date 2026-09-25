import 'package:evcar_news/app/di/providers.dart';
import 'package:evcar_news/core/app_config/app_config_controller.dart';
import 'package:evcar_news/core/settings/app_settings.dart';
import 'package:evcar_news/core/settings/settings_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/fake_http_adapter.dart';
import '../../helpers/test_app.dart';

Future<ProviderContainer> makeContainer(Map<String, Object> prefs, {FakeHttpAdapter? adapter}) async {
  SharedPreferences.setMockInitialValues(prefs);
  final sp = await SharedPreferences.getInstance();
  final http = adapter ?? FakeHttpAdapter();
  http.routes.putIfAbsent(
    'GET /app-config',
    () =>
        (_) => FakeResponse.json(200, fakeAppConfigJson()),
  );
  final c = ProviderContainer(
    retry: (_, _) => null,
    overrides: [
      sharedPreferencesProvider.overrideWithValue(sp),
      httpClientAdapterProvider.overrideWithValue(http),
      deviceLocalesProvider.overrideWithValue(const [Locale('fr'), Locale('en', 'GB')]),
    ],
  );
  addTearDown(c.dispose);
  return c;
}

void main() {
  test('defaults: follow device language, default market, light theme', () async {
    final c = await makeContainer({});
    final s = c.read(settingsControllerProvider);
    expect(s.languageCode, isNull);
    expect(s.marketCode, isNull);
    expect(s.themeMode, ThemeMode.light);
    expect(s.textScale, 1.0);
    expect(s.arabicIndicDigits, isFalse);
    // fr is unsupported → first supported device locale (en).
    expect(c.read(effectiveLanguageProvider), 'en');
  });

  test('changes persist to SharedPreferences and reload', () async {
    final c = await makeContainer({});
    final ctrl = c.read(settingsControllerProvider.notifier);
    await ctrl.setLanguage('ar');
    await ctrl.setMarket('sa');
    await ctrl.setThemeMode(ThemeMode.dark);
    await ctrl.setTextScale(1.3);
    await ctrl.setArabicIndicDigits(true);

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('settings.language'), 'ar');
    expect(prefs.getString('settings.market'), 'SA');
    expect(prefs.getString('settings.themeMode'), 'dark');
    expect(prefs.getDouble('settings.textScale'), 1.3);
    expect(prefs.getBool('settings.arabicIndicDigits'), isTrue);

    final c2 = ProviderContainer(overrides: [sharedPreferencesProvider.overrideWithValue(prefs)]);
    addTearDown(c2.dispose);
    expect(
      c2.read(settingsControllerProvider),
      const AppSettings(
        languageCode: 'ar',
        marketCode: 'SA',
        themeMode: ThemeMode.dark,
        textScale: 1.3,
        arabicIndicDigits: true,
      ),
    );
  });

  test('language is independent of market', () async {
    final c = await makeContainer({'settings.language': 'en', 'settings.market': 'EG'});
    await c.read(appConfigControllerProvider.future);
    expect(c.read(effectiveLanguageProvider), 'en');
    expect(c.read(effectiveMarketProvider).code, 'EG');
    await c.read(settingsControllerProvider.notifier).setMarket('SA');
    expect(c.read(effectiveLanguageProvider), 'en');
    expect(c.read(effectiveMarketProvider).currency, 'SAR');
    expect(c.read(requestLocaleProvider).marketCode, 'SA');
  });

  test('an unknown/disabled market falls back to the server default', () async {
    final c = await makeContainer({'settings.market': 'ZZ'});
    await c.read(appConfigControllerProvider.future);
    expect(c.read(effectiveMarketProvider).code, 'EG');
  });

  test('"follow device" clears the stored language; invalid codes are rejected', () async {
    final c = await makeContainer({'settings.language': 'ar'});
    final ctrl = c.read(settingsControllerProvider.notifier);
    await ctrl.setLanguage(null);
    expect(c.read(settingsControllerProvider).languageCode, isNull);
    expect((await SharedPreferences.getInstance()).containsKey('settings.language'), isFalse);
    expect(() => ctrl.setLanguage('fr'), throwsArgumentError);
  });

  test('text scale is clamped and corrupt values are ignored', () async {
    final c = await makeContainer({
      'settings.textScale': 9.0,
      'settings.themeMode': 'purple',
      'settings.language': 'xx',
    });
    final s = c.read(settingsControllerProvider);
    expect(s.textScale, AppSettings.maxTextScale);
    expect(s.themeMode, ThemeMode.light);
    expect(s.languageCode, isNull);
  });

  test('resolveLanguageCode', () {
    expect(resolveLanguageCode('en', const [Locale('ar')]), 'en');
    expect(resolveLanguageCode(null, const [Locale('fr'), Locale('ar', 'EG')]), 'ar');
    expect(resolveLanguageCode(null, const [Locale('fr')]), 'ar');
    expect(resolveLanguageCode(null, const [Locale('fr')], fallback: 'en'), 'en');
    expect(resolveLanguageCode('de', const []), 'ar');
  });
}
