import 'package:flutter/material.dart';

import '../../app/theme/app_colors.dart';

/// The EV Car News brand mark: a charging plug (with a lightning bolt) whose
/// cable becomes a road — the same artwork as the app icon and splash
/// (`tool/brand/mark.cjs` holds the identical path data and generates the
/// launcher icons).
///
/// Decorative: screens show the app name in text next to it, so the mark is
/// excluded from semantics.
///
/// ```dart
/// const AppMark(size: 56)            // brand tile (gradient + white mark)
/// const AppMark.glyph(size: 24)      // mark only, in the current icon colour
/// ```
class AppMark extends StatelessWidget {
  const AppMark({super.key, this.size = 48}) : tile = true, color = null;

  /// The mark without the tile, drawn in [color] (default: the icon colour).
  const AppMark.glyph({super.key, this.size = 24, this.color}) : tile = false;

  final double size;
  final bool tile;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final Widget mark;
    if (tile) {
      mark = Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(size * 0.26),
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppColors.electricBlue, AppColors.deepCyan],
          ),
          boxShadow: [
            BoxShadow(
              color: AppColors.electricBlue.withValues(alpha: 0.28),
              blurRadius: size * 0.3,
              offset: Offset(0, size * 0.08),
            ),
          ],
        ),
        child: CustomPaint(painter: _MarkPainter(color: Colors.white, scale: 0.8)),
      );
    } else {
      mark = SizedBox(
        width: size,
        height: size,
        child: CustomPaint(
          painter: _MarkPainter(color: color ?? IconTheme.of(context).color ?? Colors.black, scale: 1),
        ),
      );
    }
    return ExcludeSemantics(child: mark);
  }
}

class _MarkPainter extends CustomPainter {
  const _MarkPainter({required this.color, required this.scale});

  final Color color;

  /// Mark size relative to the 1024 canvas (0.8 leaves room inside a tile).
  final double scale;

  /// Same outline / bolt / dashes as `tool/brand/mark.cjs` (1024 canvas).
  static final Path _path = () {
    const r26 = Radius.circular(26);
    const r70 = Radius.circular(70);
    final p = Path()..fillType = PathFillType.evenOdd;
    p
      ..moveTo(422, 260)
      ..lineTo(426, 260)
      ..lineTo(426, 176)
      ..arcToPoint(const Offset(478, 176), radius: r26)
      ..lineTo(478, 260)
      ..lineTo(546, 260)
      ..lineTo(546, 176)
      ..arcToPoint(const Offset(598, 176), radius: r26)
      ..lineTo(598, 260)
      ..lineTo(602, 260)
      ..arcToPoint(const Offset(672, 330), radius: r70)
      ..lineTo(672, 400)
      ..arcToPoint(const Offset(602, 470), radius: r70)
      ..lineTo(560, 470)
      ..lineTo(568, 520)
      ..lineTo(760, 850)
      ..quadraticBezierTo(770, 872, 746, 872)
      ..lineTo(278, 872)
      ..quadraticBezierTo(254, 872, 264, 850)
      ..lineTo(456, 520)
      ..lineTo(464, 470)
      ..lineTo(422, 470)
      ..arcToPoint(const Offset(352, 400), radius: r70)
      ..lineTo(352, 330)
      ..arcToPoint(const Offset(422, 260), radius: r70)
      ..close();
    void poly(List<double> xy) {
      p.moveTo(xy[0], xy[1]);
      for (var i = 2; i < xy.length; i += 2) {
        p.lineTo(xy[i], xy[i + 1]);
      }
      p.close();
    }

    // Bolt.
    poly([524, 290, 462, 380, 504, 380, 486, 444, 564, 346, 520, 346, 564, 290]);
    // Road dashes.
    poly([506, 560, 518, 560, 520, 606, 504, 606]);
    poly([503, 652, 521, 652, 524, 722, 500, 722]);
    poly([499, 770, 525, 770, 529, 852, 495, 852]);
    return p;
  }();

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.shortestSide / 1024 * scale;
    canvas
      ..save()
      ..translate(size.width / 2, size.height / 2)
      ..scale(s)
      ..translate(-512, -512)
      ..drawPath(_path, Paint()..color = color)
      ..restore();
  }

  @override
  bool shouldRepaint(_MarkPainter old) => old.color != color || old.scale != scale;
}
