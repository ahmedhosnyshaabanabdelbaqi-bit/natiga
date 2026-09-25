import 'package:flutter/material.dart';

import 'app_colors.dart';
import 'app_palette.dart';
import 'app_tokens.dart';

/// Minimum interactive size (Material/WCAG touch target).
const double kMinTouchTarget = 48;

/// Builds the light/dark themes from the (possibly server-provided) brand
/// colours. Light is the default (REQUIREMENTS §3).
///
/// Design language: calm light-blue background, white cards with a soft
/// shadow, electric-blue primary, cyan accents, generous spacing, pill
/// chips. Dark mode uses a navy tonal ramp instead of shadows. Components
/// live in `lib/shared/widgets/` (see its README).
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
      // A consistent tonal ramp (the seeded one drifts towards purple).
      surfaceContainerLowest: isDark ? const Color(0xFF0D1426) : const Color(0xFFFFFFFF),
      surfaceContainerLow: isDark ? const Color(0xFF121A2E) : const Color(0xFFF8FAFE),
      surfaceContainer: isDark ? const Color(0xFF172036) : const Color(0xFFF1F4FA),
      surfaceContainerHigh: isDark ? const Color(0xFF1C2640) : const Color(0xFFEAEFF7),
      surfaceContainerHighest: isDark ? const Color(0xFF222D4A) : const Color(0xFFE3E9F3),
      outlineVariant: isDark ? const Color(0xFF2A3550) : const Color(0xFFDCE3EE),
      surfaceTint: Colors.transparent,
    );
    final palette = isDark
        ? AppPalette.dark(primary: primary, accent: accent)
        : AppPalette.light(primary: primary, accent: accent);
    final background = isDark ? AppColors.darkBackground : AppColors.lightBackground;

    final base = ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      fontFamily: fontFamily,
      scaffoldBackgroundColor: background,
      materialTapTargetSize: MaterialTapTargetSize.padded,
      visualDensity: VisualDensity.standard,
    );
    final text = _textTheme(base.textTheme, scheme);

    const controlShape = RoundedRectangleBorder(borderRadius: AppRadii.control);
    const buttonMin = Size(kMinTouchTarget, kMinTouchTarget);
    const buttonPadding = EdgeInsets.symmetric(horizontal: 20, vertical: 12);
    final buttonText = text.labelLarge?.copyWith(fontWeight: FontWeight.w600);

    return base.copyWith(
      textTheme: text,
      extensions: [palette],
      appBarTheme: AppBarThemeData(
        centerTitle: false,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        shadowColor: scheme.outlineVariant,
        surfaceTintColor: Colors.transparent,
        backgroundColor: background,
        foregroundColor: scheme.onSurface,
        titleTextStyle: text.titleLarge?.copyWith(fontWeight: FontWeight.w700, color: scheme.onSurface),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        margin: EdgeInsets.zero,
        color: scheme.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadii.card,
          side: BorderSide(color: scheme.outlineVariant),
        ),
        clipBehavior: Clip.antiAlias,
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 72,
        elevation: 0,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        indicatorColor: scheme.primaryContainer,
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => text.labelMedium?.copyWith(
            fontWeight: states.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
            color: states.contains(WidgetState.selected) ? scheme.onSurface : scheme.onSurfaceVariant,
          ),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: buttonMin,
          padding: buttonPadding,
          shape: controlShape,
          textStyle: buttonText,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          minimumSize: buttonMin,
          padding: buttonPadding,
          shape: controlShape,
          textStyle: buttonText,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: buttonMin,
          padding: buttonPadding,
          shape: controlShape,
          textStyle: buttonText,
          side: BorderSide(color: scheme.outline.withValues(alpha: 0.6)),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(minimumSize: buttonMin, textStyle: buttonText, shape: controlShape),
      ),
      iconButtonTheme: IconButtonThemeData(style: IconButton.styleFrom(minimumSize: buttonMin)),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        elevation: 2,
        highlightElevation: 4,
        backgroundColor: scheme.primary,
        foregroundColor: scheme.onPrimary,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(AppRadii.lg))),
        extendedTextStyle: buttonText,
      ),
      inputDecorationTheme: InputDecorationThemeData(
        filled: true,
        fillColor: isDark ? scheme.surfaceContainerHigh : scheme.surface,
        border: OutlineInputBorder(
          borderRadius: AppRadii.control,
          borderSide: BorderSide(color: scheme.outlineVariant),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: AppRadii.control,
          borderSide: BorderSide(color: scheme.outlineVariant),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: AppRadii.control,
          borderSide: BorderSide(color: scheme.primary, width: 1.6),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: AppRadii.control,
          borderSide: BorderSide(color: scheme.error),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
      chipTheme: ChipThemeData(
        shape: const StadiumBorder(),
        side: BorderSide(color: scheme.outlineVariant),
        backgroundColor: scheme.surface,
        selectedColor: scheme.primaryContainer,
        checkmarkColor: scheme.onPrimaryContainer,
        labelStyle: text.labelLarge?.copyWith(fontWeight: FontWeight.w500),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: SegmentedButton.styleFrom(minimumSize: buttonMin, textStyle: buttonText),
      ),
      tabBarTheme: TabBarThemeData(
        dividerColor: Colors.transparent,
        indicatorSize: TabBarIndicatorSize.label,
        labelStyle: text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
        unselectedLabelStyle: text.titleSmall?.copyWith(fontWeight: FontWeight.w500),
        labelColor: scheme.primary,
        unselectedLabelColor: scheme.onSurfaceVariant,
        tabAlignment: TabAlignment.start,
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        modalBackgroundColor: scheme.surface,
        showDragHandle: true,
        dragHandleColor: scheme.outline.withValues(alpha: 0.5),
        shape: const RoundedRectangleBorder(borderRadius: AppRadii.sheet),
        clipBehavior: Clip.antiAlias,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(AppRadii.xl))),
        titleTextStyle: text.titleLarge?.copyWith(fontWeight: FontWeight.w700, color: scheme.onSurface),
      ),
      listTileTheme: ListTileThemeData(
        minTileHeight: kMinTouchTarget + 8,
        contentPadding: const EdgeInsetsDirectional.only(start: 16, end: 12),
        iconColor: scheme.onSurfaceVariant,
        titleTextStyle: text.bodyLarge?.copyWith(fontWeight: FontWeight.w500, color: scheme.onSurface),
        subtitleTextStyle: text.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: const RoundedRectangleBorder(borderRadius: AppRadii.control),
        contentTextStyle: text.bodyMedium?.copyWith(color: scheme.onInverseSurface),
      ),
      dividerTheme: DividerThemeData(color: scheme.outlineVariant, space: 1, thickness: 1),
      badgeTheme: BadgeThemeData(backgroundColor: scheme.error, textColor: scheme.onError),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: scheme.primary),
      searchBarTheme: SearchBarThemeData(
        elevation: const WidgetStatePropertyAll(0),
        backgroundColor: WidgetStatePropertyAll(isDark ? scheme.surfaceContainerHigh : scheme.surface),
        side: WidgetStatePropertyAll(BorderSide(color: scheme.outlineVariant)),
        shape: const WidgetStatePropertyAll(StadiumBorder()),
        constraints: const BoxConstraints(minHeight: 52),
        textStyle: WidgetStatePropertyAll(text.bodyLarge),
        hintStyle: WidgetStatePropertyAll(text.bodyLarge?.copyWith(color: scheme.onSurfaceVariant)),
      ),
      tooltipTheme: TooltipThemeData(
        textStyle: text.bodySmall?.copyWith(color: scheme.onInverseSurface),
        decoration: BoxDecoration(color: scheme.inverseSurface, borderRadius: AppRadii.image),
      ),
    );
  }

  /// Material 3 type scale in IBM Plex Sans Arabic with Arabic-friendly
  /// metrics: **no letter spacing** (it breaks the joining of Arabic
  /// letters), taller line height for body text, stronger title weights.
  static TextTheme _textTheme(TextTheme base, ColorScheme scheme) {
    TextStyle? s(TextStyle? t, {FontWeight? weight, double? height}) =>
        t?.copyWith(fontFamily: fontFamily, letterSpacing: 0, fontWeight: weight, height: height);
    return base.copyWith(
      displayLarge: s(base.displayLarge, weight: FontWeight.w700, height: 1.15),
      displayMedium: s(base.displayMedium, weight: FontWeight.w700, height: 1.15),
      displaySmall: s(base.displaySmall, weight: FontWeight.w700, height: 1.2),
      headlineLarge: s(base.headlineLarge, weight: FontWeight.w700, height: 1.25),
      headlineMedium: s(base.headlineMedium, weight: FontWeight.w700, height: 1.3),
      headlineSmall: s(base.headlineSmall, weight: FontWeight.w700, height: 1.3),
      titleLarge: s(base.titleLarge, weight: FontWeight.w700, height: 1.35),
      titleMedium: s(base.titleMedium, weight: FontWeight.w600, height: 1.4),
      titleSmall: s(base.titleSmall, weight: FontWeight.w600, height: 1.4),
      bodyLarge: s(base.bodyLarge, height: 1.6),
      bodyMedium: s(base.bodyMedium, height: 1.55),
      bodySmall: s(base.bodySmall, height: 1.5),
      labelLarge: s(base.labelLarge, weight: FontWeight.w600, height: 1.3),
      labelMedium: s(base.labelMedium, weight: FontWeight.w600, height: 1.3),
      labelSmall: s(base.labelSmall, weight: FontWeight.w600, height: 1.3),
    );
  }
}
