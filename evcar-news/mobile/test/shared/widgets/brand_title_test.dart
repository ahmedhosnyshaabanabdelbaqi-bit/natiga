import 'dart:convert';
import 'dart:typed_data';

import 'package:evcar_news/shared/widgets/brand_title.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/test_app.dart';

/// 1×1 transparent PNG (stands in for the uploaded logo; no network in tests).
final _png = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
);

void main() {
  testWidgets('shows the logo uploaded in the admin next to the app name', (tester) async {
    final requested = <String>[];
    await pumpTestApp(
      tester,
      language: 'en',
      logoUrl: 'https://api.test/media/branding/logo-abc.png',
      extraOverrides: [
        brandLogoImageProvider.overrideWithValue((url) {
          requested.add(url);
          return MemoryImage(_png);
        }),
      ],
    );
    expect(find.byKey(const ValueKey('brand-logo')), findsOneWidget);
    expect(requested, ['https://api.test/media/branding/logo-abc.png']);
    // The name stays (logo is decorative for screen readers).
    expect(find.descendant(of: find.byType(AppBar), matching: find.text('EV Car News')), findsOneWidget);
  });

  testWidgets('without a logo only the app name is shown', (tester) async {
    await pumpTestApp(tester, language: 'en');
    expect(find.byKey(const ValueKey('brand-logo')), findsNothing);
    expect(find.descendant(of: find.byType(BrandTitle), matching: find.text('EV Car News')), findsOneWidget);
  });

  testWidgets('a logo that cannot be loaded falls back to the name', (tester) async {
    await pumpTestApp(
      tester,
      language: 'en',
      logoUrl: 'https://api.test/media/branding/broken.png',
      extraOverrides: [
        brandLogoImageProvider.overrideWithValue((url) => MemoryImage(Uint8List.fromList([1, 2, 3]))),
      ],
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('brand-logo-failed')), findsOneWidget);
    expect(find.descendant(of: find.byType(BrandTitle), matching: find.text('EV Car News')), findsOneWidget);
  });
}
