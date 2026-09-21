import 'package:flutter/material.dart';

/// ثيم عربي RTL بألوان هادئة مطابقة لواجهة الويب.
class AppTheme {
  static const Color brand = Color(0xFF0F766E);
  static const Color brandDark = Color(0xFF115E59);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color background = Color(0xFFF6F7F9);
  static const Color danger = Color(0xFFB91C1C);
  static const Color warn = Color(0xFFB45309);
  static const Color success = Color(0xFF15803D);

  static ThemeData build() {
    final base = ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(seedColor: brand, brightness: Brightness.light),
      scaffoldBackgroundColor: background,
      fontFamily: 'IBMPlexSansArabic',
    );

    return base.copyWith(
      appBarTheme: const AppBarTheme(
        backgroundColor: brand,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: Color(0xFFE3E6EA)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: brand,
          minimumSize: const Size.fromHeight(48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
      ),
    );
  }
}
