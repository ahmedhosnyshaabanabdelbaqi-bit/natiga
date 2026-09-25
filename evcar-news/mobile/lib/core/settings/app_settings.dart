import 'package:flutter/material.dart';

/// Languages the app ships translations for.
const supportedLanguageCodes = ['ar', 'en'];

/// User preferences stored on the device.
///
/// Language and market are independent (REQUIREMENTS §1): Egyptian content
/// can be read in English and Emirati content in Arabic.
@immutable
class AppSettings {
  const AppSettings({
    this.languageCode,
    this.marketCode,
    this.themeMode = ThemeMode.light,
    this.textScale = 1.0,
    this.arabicIndicDigits = false,
  });

  /// `ar`, `en`, or `null` to follow the device language.
  final String? languageCode;

  /// e.g. `EG`; `null` = the default market from `/app-config`.
  final String? marketCode;

  /// Light is the product default (ARCHITECTURE §6); dark is optional.
  final ThemeMode themeMode;

  /// Extra multiplier applied on top of the system font scale (never
  /// replacing it). Range [minTextScale]..[maxTextScale].
  final double textScale;

  /// Use Arabic-Indic digits (٠١٢٣) when the UI language is Arabic.
  final bool arabicIndicDigits;

  static const double minTextScale = 0.85;
  static const double maxTextScale = 1.6;

  static double clampTextScale(double v) => v.clamp(minTextScale, maxTextScale).toDouble();

  AppSettings copyWith({
    String? Function()? languageCode,
    String? Function()? marketCode,
    ThemeMode? themeMode,
    double? textScale,
    bool? arabicIndicDigits,
  }) {
    return AppSettings(
      languageCode: languageCode != null ? languageCode() : this.languageCode,
      marketCode: marketCode != null ? marketCode() : this.marketCode,
      themeMode: themeMode ?? this.themeMode,
      textScale: textScale != null ? clampTextScale(textScale) : this.textScale,
      arabicIndicDigits: arabicIndicDigits ?? this.arabicIndicDigits,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is AppSettings &&
      other.languageCode == languageCode &&
      other.marketCode == marketCode &&
      other.themeMode == themeMode &&
      other.textScale == textScale &&
      other.arabicIndicDigits == arabicIndicDigits;

  @override
  int get hashCode => Object.hash(languageCode, marketCode, themeMode, textScale, arabicIndicDigits);

  @override
  String toString() =>
      'AppSettings(lang: $languageCode, market: $marketCode, theme: ${themeMode.name}, '
      'textScale: $textScale, arabicIndicDigits: $arabicIndicDigits)';
}

/// Picks the UI language: explicit choice → first supported device locale →
/// [fallback] (the server's default language, `ar` by default).
String resolveLanguageCode(String? chosen, List<Locale> deviceLocales, {String fallback = 'ar'}) {
  if (chosen != null && supportedLanguageCodes.contains(chosen)) return chosen;
  for (final l in deviceLocales) {
    if (supportedLanguageCodes.contains(l.languageCode)) return l.languageCode;
  }
  return supportedLanguageCodes.contains(fallback) ? fallback : 'ar';
}
