import 'package:flutter/material.dart';

/// Brand and semantic colours. Brand colours can be overridden from the
/// admin branding settings (`/app-config` → `branding`).
abstract final class AppColors {
  static const electricBlue = Color(0xFF0A5CFF);
  static const cyan = Color(0xFF00C2E0);

  /// Deep cyan-blue: the end of the text-safe brand gradient. White text on
  /// it passes WCAG AA (4.8:1); pure [cyan] (2.1:1) never carries text.
  static const deepCyan = Color(0xFF0077BE);

  /// Brand blue for text and icons on dark surfaces (7.8:1 on
  /// [darkSurface]); filled controls keep [electricBlue] with white text.
  static const electricBlueOnDark = Color(0xFF86ADFF);

  static const lightBackground = Color(0xFFF4F7FC);
  static const lightSurface = Color(0xFFFFFFFF);
  static const darkBackground = Color(0xFF0A1020);
  static const darkSurface = Color(0xFF121A2E);

  // Semantic colours. Never used alone to convey meaning: always paired with
  // an icon and text (REQUIREMENTS §3).
  static const success = Color(0xFF1B7F3B);
  static const info = Color(0xFF0A5CFF);
  static const warning = Color(0xFF9A5B00);
  static const neutral = Color(0xFF5B6475);
  static const danger = Color(0xFFB3261E);

  /// Parses `#RGB`, `#RRGGBB` or `#AARRGGBB`; returns [fallback] if invalid.
  static Color parseHex(String? hex, Color fallback) {
    if (hex == null) return fallback;
    var h = hex.trim();
    if (h.startsWith('#')) h = h.substring(1);
    if (h.length == 3) h = h.split('').map((c) => '$c$c').join();
    if (h.length == 6) h = 'FF$h';
    if (h.length != 8) return fallback;
    final v = int.tryParse(h, radix: 16);
    return v == null ? fallback : Color(v);
  }
}
