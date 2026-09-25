import 'package:flutter/material.dart';

import 'app_colors.dart';

/// Minimum interactive size (Material/WCAG touch target).
const double kMinTouchTarget = 48;

/// Builds the light/dark themes from the (possibly server-provided) brand
/// colours. Light is the default (REQUIREMENTS §3).
abstract final class AppTheme {
  static const fontFamily = 'IBMPlexSansArabic';

  static ThemeData light({Color primary = AppColors.electricBlue, Color accent = AppColors.cyan}) =>
      _build(Brightness.light, primary, accent);

  static ThemeData dark({Color primary = AppColors.electricBlue, Color accent = AppColors.cyan}) =>
      _build(Brightness.dark, primary, accent);

  static ThemeData _build(Brightness brightness, Color primary, Color accent) {
    final isDark = brightness == Brightness.dark;
    var scheme = ColorScheme.fromSeed(
      seedColor: primary,
      brightness: brightness,
      dynamicSchemeVariant: DynamicSchemeVariant.fidelity,
    );
    scheme = scheme.copyWith(
      // Keep the exact brand blue in light mode; the seeded tone is used in
      // dark mode where pure #0A5CFF lacks contrast on dark surfaces.
      primary: isDark ? scheme.primary : primary,
      onPrimary: isDark ? scheme.onPrimary : Colors.white,
      // Cyan is decorative (contrast too low for text on white): used for
      // accents/containers, with dark text on top.
      secondary: isDark ? accent : scheme.secondary,
      tertiary: accent,
      onTertiary: const Color(0xFF002F38),
      surface: isDark ? AppColors.darkSurface : AppColors.lightSurface,
    );

    final base = ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      fontFamily: fontFamily,
      scaffoldBackgroundColor: isDark ? AppColors.darkBackground : AppColors.lightBackground,
      materialTapTargetSize: MaterialTapTargetSize.padded,
      visualDensity: VisualDensity.standard,
    );

    final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(16));
    const buttonMin = Size(kMinTouchTarget, kMinTouchTarget);

    return base.copyWith(
      appBarTheme: AppBarThemeData(
        centerTitle: false,
        elevation: 0,
        scrolledUnderElevation: 1,
        backgroundColor: base.scaffoldBackgroundColor,
        foregroundColor: scheme.onSurface,
        titleTextStyle: base.textTheme.titleLarge?.copyWith(
          fontFamily: fontFamily,
          fontWeight: FontWeight.w600,
          color: scheme.onSurface,
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        margin: EdgeInsets.zero,
        color: scheme.surface,
        shape: shape.copyWith(side: BorderSide(color: scheme.outlineVariant)),
        clipBehavior: Clip.antiAlias,
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 72,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        indicatorColor: scheme.primaryContainer,
        backgroundColor: scheme.surface,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: buttonMin,
          shape: shape.copyWith(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: buttonMin,
          shape: shape.copyWith(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(minimumSize: buttonMin)),
      iconButtonTheme: IconButtonThemeData(style: IconButton.styleFrom(minimumSize: buttonMin)),
      inputDecorationTheme: InputDecorationThemeData(
        filled: true,
        fillColor: isDark ? AppColors.darkBackground : AppColors.lightBackground,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
      chipTheme: ChipThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        side: BorderSide(color: scheme.outlineVariant),
        labelStyle: base.textTheme.labelLarge?.copyWith(fontFamily: fontFamily),
      ),
      listTileTheme: const ListTileThemeData(minTileHeight: kMinTouchTarget + 8),
      snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
      dividerTheme: DividerThemeData(color: scheme.outlineVariant, space: 1),
    );
  }
}
