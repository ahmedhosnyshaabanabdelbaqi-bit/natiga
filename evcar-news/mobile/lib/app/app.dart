import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/app_config/app_config_controller.dart';
import '../core/formatting/formatters.dart';
import '../core/l10n/l10n.dart';
import '../core/notifications/local_notifications.dart';
import '../core/platform/platform_capabilities.dart';
import '../core/settings/settings_controller.dart';
import '../features/auth/domain/auth_state.dart';
import '../features/auth/presentation/auth_controller.dart';
import 'di/providers.dart';
import 'router/app_router.dart';
import 'router/app_routes.dart';
import 'theme/app_colors.dart';
import 'theme/app_theme.dart';
import 'theme/text_scaling.dart';

/// Root widget: `MaterialApp.router` wired to settings (language, theme,
/// text size, digits), server branding colours and the router.
class EvCarApp extends ConsumerStatefulWidget {
  const EvCarApp({super.key});

  @override
  ConsumerState<EvCarApp> createState() => _EvCarAppState();
}

class _EvCarAppState extends ConsumerState<EvCarApp> with WidgetsBindingObserver {
  final _messengerKey = GlobalKey<ScaffoldMessengerState>();
  StreamSubscription<String>? _notificationTaps;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // After the first frame: open the screen of a tapped local notification
    // (reminders). Initializing never asks for permission.
    WidgetsBinding.instance.addPostFrameCallback((_) => _listenToNotificationTaps());
  }

  Future<void> _listenToNotificationTaps() async {
    if (!mounted) return;
    final notifications = ref.read(localNotificationsProvider);
    if (!notifications.isSupported) return;
    _notificationTaps = notifications.taps.listen(_openNotificationRoute);
    final launch = await notifications.launchRoute();
    if (launch != null) _openNotificationRoute(launch);
  }

  void _openNotificationRoute(String route) {
    // Payloads are app paths we scheduled ourselves; still validated.
    final safe = AppRoutes.safeReturnPath(route);
    if (safe == null || !mounted) return;
    ref.read(routerProvider).push(safe);
  }

  @override
  void dispose() {
    _notificationTaps?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeLocales(List<Locale>? locales) {
    // "Device language" setting follows system changes live.
    ref.invalidate(deviceLocalesProvider);
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    final settings = ref.watch(settingsControllerProvider);
    final language = ref.watch(effectiveLanguageProvider);
    final branding = ref.watch(appConfigProvider.select((c) => c.branding));
    final primary = AppColors.parseHex(branding.primaryColor, AppColors.electricBlue);
    final accent = AppColors.parseHex(branding.accentColor, AppColors.cyan);

    ref.listen<AuthState>(authControllerProvider, (previous, next) {
      if (next is AuthGuest && next.sessionExpired) {
        final l10n = lookupAppLocalizations(Locale(language));
        _messengerKey.currentState?.showSnackBar(SnackBar(content: Text(l10n.shellSessionExpired)));
        ref.read(authControllerProvider.notifier).acknowledgeSessionExpired();
      }
    });

    final formatters = AppFormatters(languageCode: language, arabicIndicDigits: settings.arabicIndicDigits);
    final webPreview = ref.watch(platformCapabilitiesProvider).isWebPreview;

    return MaterialApp.router(
      routerConfig: router,
      scaffoldMessengerKey: _messengerKey,
      debugShowCheckedModeBanner: false,
      onGenerateTitle: (_) => branding.appName,
      locale: Locale(language),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      theme: AppTheme.light(primary: primary, accent: accent),
      darkTheme: AppTheme.dark(primary: primary, accent: accent),
      themeMode: settings.themeMode,
      builder: (context, child) {
        final mq = MediaQuery.of(context);
        Widget app = MediaQuery(
          // User text size multiplies (never replaces) the system font scale.
          data: mq.copyWith(textScaler: MultipliedTextScaler(mq.textScaler, settings.textScale)),
          child: FormattingScope(formatters: formatters, child: child ?? const SizedBox.shrink()),
        );
        if (webPreview) {
          // The web build is a design preview only (production: Android/iOS).
          app = Banner(
            message: lookupAppLocalizations(Locale(language)).commonWebPreviewBanner,
            location: BannerLocation.topEnd,
            color: AppColors.electricBlue,
            child: app,
          );
        }
        return app;
      },
    );
  }
}
