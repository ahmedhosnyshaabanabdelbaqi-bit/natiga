import 'package:evcar_news/app/theme/app_colors.dart';
import 'package:evcar_news/app/theme/app_theme.dart';
import 'package:evcar_news/shared/widgets/kit.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/kit_harness.dart';

/// WCAG relative-luminance contrast ratio.
double contrast(Color a, Color b) {
  final la = a.computeLuminance();
  final lb = b.computeLuminance();
  final hi = la > lb ? la : lb;
  final lo = la > lb ? lb : la;
  return (hi + 0.05) / (lo + 0.05);
}

void main() {
  group('design review: contrast (WCAG AA)', () {
    test('white text passes on every stop of the brand gradient', () {
      for (final p in [AppPalette.light(), AppPalette.dark()]) {
        for (final c in p.brandGradient.colors) {
          expect(contrast(Colors.white, c), greaterThanOrEqualTo(4.5), reason: '$c');
        }
      }
    });

    test('a server accent that is too light is darkened for text', () {
      final p = AppPalette.light(accent: const Color(0xFF7FE0FF));
      expect(contrast(Colors.white, p.brandGradient.colors.last), greaterThanOrEqualTo(4.5));
      // The decorative gradient keeps the exact accent.
      expect(p.accentGradient.colors.last, const Color(0xFF7FE0FF));
    });

    test('dark theme: brand text colour and filled controls', () {
      final dark = AppTheme.dark();
      final scheme = dark.colorScheme;
      expect(scheme.primary, AppColors.electricBlueOnDark);
      expect(contrast(scheme.primary, scheme.surface), greaterThanOrEqualTo(4.5));
      expect(contrast(scheme.primary, dark.scaffoldBackgroundColor), greaterThanOrEqualTo(4.5));
      final filled = dark.filledButtonTheme.style!;
      final bg = filled.backgroundColor!.resolve({})!;
      final fg = filled.foregroundColor!.resolve({})!;
      expect(bg, AppColors.electricBlue);
      expect(contrast(fg, bg), greaterThanOrEqualTo(4.5));
    });

    test('navigation bar: selected icon is white on the brand pill', () {
      for (final theme in [AppTheme.light(), AppTheme.dark()]) {
        final nav = theme.navigationBarTheme;
        final icon = nav.iconTheme!.resolve({WidgetState.selected})!.color!;
        expect(contrast(icon, nav.indicatorColor!), greaterThanOrEqualTo(4.5));
      }
    });
  });

  group('AppMark', () {
    for (final config in kitMatrix) {
      testWidgets('tile and glyph render ($config)', (tester) async {
        final handle = tester.ensureSemantics();
        await pumpKit(tester, const Row(children: [AppMark(size: 64), AppMark.glyph(size: 24)]), config: config);
        expect(tester.takeException(), isNull);
        expect(find.byType(AppMark), findsNWidgets(2));
        // Decorative: nothing announced.
        expect(find.bySemanticsLabel(RegExp('.+')), findsNothing);
        handle.dispose();
      });
    }
  });

  testWidgets('StatTileRow: an incomplete last row fills the width', (tester) async {
    await pumpKit(
      tester,
      const StatTileRow(
        minTileWidth: 150,
        tiles: [
          StatTile(label: 'A', value: '1'),
          StatTile(label: 'B', value: '2'),
          StatTile(label: 'C', value: '3'),
        ],
      ),
    );
    final a = tester.getSize(find.ancestor(of: find.text('1'), matching: find.byType(SizedBox)).first);
    final c = tester.getSize(find.ancestor(of: find.text('3'), matching: find.byType(SizedBox)).first);
    expect(c.width, greaterThan(a.width * 1.5));
  });
}
