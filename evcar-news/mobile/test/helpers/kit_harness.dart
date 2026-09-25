import 'package:evcar_news/app/theme/app_theme.dart';
import 'package:evcar_news/core/connectivity/connectivity_service.dart';
import 'package:evcar_news/core/formatting/formatters.dart';
import 'package:evcar_news/core/l10n/l10n.dart';
import 'package:evcar_news/core/settings/settings_controller.dart';
import 'package:evcar_news/shared/widgets/image_with_fallback.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// An image that fails immediately (no network in widget tests), so
/// `ImageWithFallback` shows its fallback deterministically.
class FailingImage extends ImageProvider<FailingImage> {
  const FailingImage();

  @override
  Future<FailingImage> obtainKey(ImageConfiguration configuration) => SynchronousFuture(this);

  @override
  ImageStreamCompleter loadImage(FailingImage key, ImageDecoderCallback decode) =>
      OneFrameImageStreamCompleter(Future<ImageInfo>.error(StateError('no network in tests')));
}

/// One visual configuration a kit widget must survive.
class KitConfig {
  const KitConfig(this.lang, {this.dark = false, this.textScale = 1.0});

  final String lang;
  final bool dark;
  final double textScale;

  @override
  String toString() => '$lang${dark ? ' dark' : ''} ×$textScale';
}

/// ar/en × light/dark × 100%/200% text.
const kitMatrix = [
  KitConfig('ar'),
  KitConfig('en'),
  KitConfig('ar', dark: true),
  KitConfig('en', dark: true),
  KitConfig('ar', textScale: 2.0),
  KitConfig('en', textScale: 2.0),
  KitConfig('ar', dark: true, textScale: 2.0),
];

/// Pumps [child] inside the real theme + localizations + formatting scope on
/// a phone-sized screen (360×780 dp). Layout overflows fail the test.
Future<void> pumpKit(
  WidgetTester tester,
  Widget child, {
  KitConfig config = const KitConfig('en'),
  Size size = const Size(360, 780),
  bool scroll = true,
  bool disableAnimations = false,
  List<Override> overrides = const [],
  Map<String, Object> prefs = const {},
  bool online = true,
}) async {
  tester.view.physicalSize = size * 3;
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  SharedPreferences.setMockInitialValues(prefs);
  final sharedPrefs = await SharedPreferences.getInstance();

  await tester.pumpWidget(
    ProviderScope(
      retry: (_, _) => null,
      overrides: [
        sharedPreferencesProvider.overrideWithValue(sharedPrefs),
        networkImageProviderFactory.overrideWithValue((_) => const FailingImage()),
        connectivityServiceProvider.overrideWithValue(FakeConnectivityService(online: online)),
        ...overrides,
      ],
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        locale: Locale(config.lang),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        theme: AppTheme.light(),
        darkTheme: AppTheme.dark(),
        themeMode: config.dark ? ThemeMode.dark : ThemeMode.light,
        builder: (context, app) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(config.textScale), disableAnimations: disableAnimations),
          child: FormattingScope(
            formatters: AppFormatters(languageCode: config.lang),
            child: app!,
          ),
        ),
        home: Scaffold(
          body: scroll ? SingleChildScrollView(padding: const EdgeInsets.all(16), child: child) : child,
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 300));
}
