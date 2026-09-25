import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app_settings.dart';

/// Must be overridden in `main()` / tests with an initialized instance.
final sharedPreferencesProvider = Provider<SharedPreferences>(
  (ref) => throw UnimplementedError('sharedPreferencesProvider must be overridden'),
);

/// Persists [AppSettings] in SharedPreferences (non-sensitive values only).
class SettingsController extends Notifier<AppSettings> {
  static const _kLanguage = 'settings.language';
  static const _kMarket = 'settings.market';
  static const _kTheme = 'settings.themeMode';
  static const _kTextScale = 'settings.textScale';
  static const _kArabicDigits = 'settings.arabicIndicDigits';

  SharedPreferences get _prefs => ref.read(sharedPreferencesProvider);

  @override
  AppSettings build() {
    final prefs = ref.watch(sharedPreferencesProvider);
    final lang = prefs.getString(_kLanguage);
    final theme = prefs.getString(_kTheme);
    return AppSettings(
      languageCode: supportedLanguageCodes.contains(lang) ? lang : null,
      marketCode: prefs.getString(_kMarket),
      themeMode: ThemeMode.values.firstWhere((m) => m.name == theme, orElse: () => ThemeMode.light),
      textScale: AppSettings.clampTextScale(prefs.getDouble(_kTextScale) ?? 1.0),
      arabicIndicDigits: prefs.getBool(_kArabicDigits) ?? false,
    );
  }

  /// `null` follows the device language.
  Future<void> setLanguage(String? code) async {
    if (code != null && !supportedLanguageCodes.contains(code)) {
      throw ArgumentError.value(code, 'code', 'Unsupported language');
    }
    state = state.copyWith(languageCode: () => code);
    if (code == null) {
      await _prefs.remove(_kLanguage);
    } else {
      await _prefs.setString(_kLanguage, code);
    }
  }

  /// `null` uses the server's default market.
  Future<void> setMarket(String? code) async {
    final normalized = code?.trim().toUpperCase();
    state = state.copyWith(marketCode: () => normalized);
    if (normalized == null || normalized.isEmpty) {
      await _prefs.remove(_kMarket);
    } else {
      await _prefs.setString(_kMarket, normalized);
    }
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    state = state.copyWith(themeMode: mode);
    await _prefs.setString(_kTheme, mode.name);
  }

  Future<void> setTextScale(double scale) async {
    state = state.copyWith(textScale: scale);
    await _prefs.setDouble(_kTextScale, state.textScale);
  }

  Future<void> setArabicIndicDigits(bool value) async {
    state = state.copyWith(arabicIndicDigits: value);
    await _prefs.setBool(_kArabicDigits, value);
  }
}

final settingsControllerProvider = NotifierProvider<SettingsController, AppSettings>(SettingsController.new);
