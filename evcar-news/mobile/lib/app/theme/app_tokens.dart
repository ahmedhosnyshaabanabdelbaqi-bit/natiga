import 'package:flutter/widgets.dart';

/// Spacing scale (dp). Use these instead of magic numbers so every screen
/// shares the same rhythm.
abstract final class AppSpacing {
  static const double xxs = 2;
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double xxl = 32;
  static const double xxxl = 48;

  /// Horizontal page gutter on phones (see [pageGutter] for wider screens).
  static const double gutter = 16;

  /// Gap between cards in lists and grids.
  static const double cardGap = 12;

  /// Gap between home/detail sections.
  static const double sectionGap = 24;

  /// Page gutter for the available width: 16 on phones, 24 on tablets and
  /// landscape, 32 on large screens.
  static double pageGutter(double width) => width >= 1200
      ? xxl
      : width >= 600
      ? xl
      : gutter;
}

/// Corner radii.
abstract final class AppRadii {
  static const double xs = 6;
  static const double sm = 10;
  static const double md = 14;
  static const double lg = 20;
  static const double xl = 28;

  static const BorderRadius card = BorderRadius.all(Radius.circular(lg));
  static const BorderRadius image = BorderRadius.all(Radius.circular(md));
  static const BorderRadius control = BorderRadius.all(Radius.circular(md));
  static const BorderRadius pill = BorderRadius.all(Radius.circular(999));
  static const BorderRadius sheet = BorderRadius.vertical(top: Radius.circular(xl));
}

/// Motion: short, restrained, and switched off when the user asked the OS to
/// reduce animations.
abstract final class AppMotion {
  static const Duration fast = Duration(milliseconds: 150);
  static const Duration medium = Duration(milliseconds: 250);
  static const Duration slow = Duration(milliseconds: 400);

  /// Skeleton shimmer period.
  static const Duration shimmer = Duration(milliseconds: 1400);

  static const Curve standard = Curves.easeOutCubic;
  static const Curve emphasized = Curves.easeInOutCubicEmphasized;

  /// Whether animations should run (false when "remove animations" is on).
  static bool enabled(BuildContext context) => !(MediaQuery.maybeDisableAnimationsOf(context) ?? false);

  /// [base], or zero when animations are disabled.
  static Duration of(BuildContext context, [Duration base = medium]) => enabled(context) ? base : Duration.zero;
}

/// Width classes (Material 3 window size classes).
enum WindowSize {
  /// Phones in portrait (< 600dp).
  compact,

  /// Large phones in landscape, small tablets (600–839dp).
  medium,

  /// Tablets, landscape tablets, desktop preview (≥ 840dp).
  expanded;

  static WindowSize forWidth(double width) => width >= 840
      ? WindowSize.expanded
      : width >= 600
      ? WindowSize.medium
      : WindowSize.compact;
}

/// Layout helpers: `context.windowSize`, `context.isLandscape`, …
extension ResponsiveContext on BuildContext {
  Size get screenSize => MediaQuery.sizeOf(this);

  WindowSize get windowSize => WindowSize.forWidth(screenSize.width);

  bool get isCompact => windowSize == WindowSize.compact;

  bool get isLandscape => MediaQuery.orientationOf(this) == Orientation.landscape;

  /// Page gutter for the current width.
  double get pageGutter => AppSpacing.pageGutter(screenSize.width);

  /// Current text scale for 14sp text (1.0 = default, 2.0 = 200%).
  double get textScale => MediaQuery.textScalerOf(this).scale(14) / 14;
}

/// Readable content width: text columns never exceed this on wide screens.
const double kMaxReadableWidth = 720;

/// Maximum width of full-width layouts (grids, dashboards).
const double kMaxContentWidth = 1200;
