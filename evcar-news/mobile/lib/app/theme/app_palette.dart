import 'package:flutter/material.dart';

import 'app_colors.dart';

/// Semantic tone of badges, pills, banners and icons.
///
/// A tone is never the only signal: widgets that use it always show an icon
/// and/or text as well (REQUIREMENTS §3 "لا تعتمد على اللون وحده").
enum AppTone { neutral, brand, info, success, warning, danger, demo, sponsored }

/// Container / content / border colours for one [AppTone].
@immutable
class ToneColors {
  const ToneColors({required this.container, required this.onContainer, required this.border});

  final Color container;
  final Color onContainer;
  final Color border;

  static ToneColors lerp(ToneColors a, ToneColors b, double t) => ToneColors(
    container: Color.lerp(a.container, b.container, t)!,
    onContainer: Color.lerp(a.onContainer, b.onContainer, t)!,
    border: Color.lerp(a.border, b.border, t)!,
  );
}

/// Brand-specific colours that [ColorScheme] does not cover. Read with
/// `AppPalette.of(context)` (or `context.palette`).
@immutable
class AppPalette extends ThemeExtension<AppPalette> {
  const AppPalette({
    required this.brightness,
    required this.brandGradient,
    required this.imageScrim,
    required this.skeletonBase,
    required this.skeletonHighlight,
    required this.cardShadow,
    required this.tones,
  });

  final Brightness brightness;

  /// Electric blue → cyan, for hero headers, the 360° badge and key CTAs.
  final LinearGradient brandGradient;

  /// Bottom-up dark gradient drawn over images that carry text.
  final LinearGradient imageScrim;

  final Color skeletonBase;
  final Color skeletonHighlight;

  /// Soft elevation for cards in light mode (empty in dark mode, where
  /// surfaces are separated by tone and outline instead).
  final List<BoxShadow> cardShadow;

  final Map<AppTone, ToneColors> tones;

  ToneColors tone(AppTone tone) => tones[tone]!;

  static AppPalette of(BuildContext context) =>
      Theme.of(context).extension<AppPalette>() ??
      (Theme.of(context).brightness == Brightness.dark ? AppPalette.dark() : AppPalette.light());

  factory AppPalette.light({Color primary = AppColors.electricBlue, Color accent = AppColors.cyan}) => AppPalette(
    brightness: Brightness.light,
    brandGradient: LinearGradient(
      begin: AlignmentDirectional.topStart,
      end: AlignmentDirectional.bottomEnd,
      colors: [primary, accent],
    ),
    imageScrim: const LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [Color(0x00000000), Color(0x66000000), Color(0xE6000000)],
      stops: [0.15, 0.5, 1],
    ),
    skeletonBase: const Color(0xFFE6EBF3),
    skeletonHighlight: const Color(0xFFF6F8FC),
    cardShadow: const [
      BoxShadow(color: Color(0x0F0A1F44), blurRadius: 18, offset: Offset(0, 6)),
      BoxShadow(color: Color(0x0A0A1F44), blurRadius: 3, offset: Offset(0, 1)),
    ],
    tones: const {
      AppTone.neutral: ToneColors(
        container: Color(0xFFEEF1F6),
        onContainer: Color(0xFF3D4656),
        border: Color(0xFFD5DBE6),
      ),
      AppTone.brand: ToneColors(
        container: Color(0xFFE3ECFF),
        onContainer: Color(0xFF0A3FB0),
        border: Color(0xFFB9CCFF),
      ),
      AppTone.info: ToneColors(container: Color(0xFFDDF6FA), onContainer: Color(0xFF005766), border: Color(0xFFA6E4EF)),
      AppTone.success: ToneColors(
        container: Color(0xFFE3F4E8),
        onContainer: Color(0xFF14602C),
        border: Color(0xFFB2DDBF),
      ),
      AppTone.warning: ToneColors(
        container: Color(0xFFFFF1D6),
        onContainer: Color(0xFF7A4700),
        border: Color(0xFFF2D08F),
      ),
      AppTone.danger: ToneColors(
        container: Color(0xFFFDE7E5),
        onContainer: Color(0xFF8C1D18),
        border: Color(0xFFF3B8B3),
      ),
      AppTone.demo: ToneColors(container: Color(0xFFFFF4CC), onContainer: Color(0xFF5E4400), border: Color(0xFFE8C95C)),
      AppTone.sponsored: ToneColors(
        container: Color(0xFFF1E9FF),
        onContainer: Color(0xFF5B2DA3),
        border: Color(0xFFD5C0F5),
      ),
    },
  );

  factory AppPalette.dark({Color primary = AppColors.electricBlue, Color accent = AppColors.cyan}) => AppPalette(
    brightness: Brightness.dark,
    brandGradient: LinearGradient(
      begin: AlignmentDirectional.topStart,
      end: AlignmentDirectional.bottomEnd,
      colors: [Color.lerp(primary, Colors.white, 0.12)!, accent],
    ),
    imageScrim: const LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [Color(0x00000000), Color(0x73000000), Color(0xEB000000)],
      stops: [0.15, 0.5, 1],
    ),
    skeletonBase: const Color(0xFF1B2438),
    skeletonHighlight: const Color(0xFF26314A),
    cardShadow: const [],
    tones: const {
      AppTone.neutral: ToneColors(
        container: Color(0xFF232B3D),
        onContainer: Color(0xFFC9D1E0),
        border: Color(0xFF394358),
      ),
      AppTone.brand: ToneColors(
        container: Color(0xFF16295A),
        onContainer: Color(0xFFB9CCFF),
        border: Color(0xFF2D4A94),
      ),
      AppTone.info: ToneColors(container: Color(0xFF0E3440), onContainer: Color(0xFF8FE3F2), border: Color(0xFF1C5666)),
      AppTone.success: ToneColors(
        container: Color(0xFF143321),
        onContainer: Color(0xFF8EDBA5),
        border: Color(0xFF245236),
      ),
      AppTone.warning: ToneColors(
        container: Color(0xFF3A2A08),
        onContainer: Color(0xFFFFCF7A),
        border: Color(0xFF5C4412),
      ),
      AppTone.danger: ToneColors(
        container: Color(0xFF3F1614),
        onContainer: Color(0xFFFFB4AB),
        border: Color(0xFF66241F),
      ),
      AppTone.demo: ToneColors(container: Color(0xFF3A300A), onContainer: Color(0xFFFFE08A), border: Color(0xFF6B5716)),
      AppTone.sponsored: ToneColors(
        container: Color(0xFF2C1F47),
        onContainer: Color(0xFFD7C2FF),
        border: Color(0xFF4A3673),
      ),
    },
  );

  @override
  AppPalette copyWith({LinearGradient? brandGradient}) => AppPalette(
    brightness: brightness,
    brandGradient: brandGradient ?? this.brandGradient,
    imageScrim: imageScrim,
    skeletonBase: skeletonBase,
    skeletonHighlight: skeletonHighlight,
    cardShadow: cardShadow,
    tones: tones,
  );

  @override
  AppPalette lerp(covariant AppPalette? other, double t) {
    if (other == null) return this;
    return AppPalette(
      brightness: t < 0.5 ? brightness : other.brightness,
      brandGradient: LinearGradient.lerp(brandGradient, other.brandGradient, t)!,
      imageScrim: LinearGradient.lerp(imageScrim, other.imageScrim, t)!,
      skeletonBase: Color.lerp(skeletonBase, other.skeletonBase, t)!,
      skeletonHighlight: Color.lerp(skeletonHighlight, other.skeletonHighlight, t)!,
      cardShadow: BoxShadow.lerpList(cardShadow, other.cardShadow, t) ?? const [],
      tones: {for (final k in AppTone.values) k: ToneColors.lerp(tone(k), other.tone(k), t)},
    );
  }
}

extension AppPaletteContext on BuildContext {
  /// Brand palette of the current theme.
  AppPalette get palette => AppPalette.of(this);
}
