import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// Verifies that everything declared in pubspec.yaml is really bundled
/// (there is no Android SDK in CI to build an APK, so this is the check that
/// the asset manifest and font files are valid).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('360° viewer files are bundled with no remote scripts', () async {
    final html = await rootBundle.loadString('assets/panorama/viewer.html');
    expect(html, contains('Content-Security-Policy'));
    expect(html, contains("script-src 'self'"));
    expect(html, contains('src="pannellum/pannellum.js"'));
    expect(html, contains('src="viewer.js"'));
    expect(RegExp(r'<script[^>]+src="https?:').hasMatch(html), isFalse, reason: 'no remote scripts');

    final js = await rootBundle.loadString('assets/panorama/viewer.js');
    expect(js, contains('evcarViewer'));
    expect(js, contains('textContent'));
    expect(js, isNot(contains('innerHTML')), reason: 'hotspot text must never be HTML');

    expect(await rootBundle.loadString('assets/panorama/pannellum/pannellum.js'), contains('pannellum'));
    expect(await rootBundle.loadString('assets/panorama/pannellum/pannellum.css'), contains('.pnlm-container'));
    expect((await rootBundle.loadString('assets/panorama/pannellum/VERSION')).trim(), '2.5.7');
  });

  test('licences of bundled third-party assets are included', () async {
    expect(await rootBundle.loadString('assets/fonts/OFL.txt'), contains('SIL Open Font License'));
    expect(await rootBundle.loadString('assets/panorama/pannellum/COPYING'), contains('Permission is hereby granted'));
  });

  test('IBM Plex Sans Arabic is declared and its font files load', () async {
    final manifest = jsonDecode(await rootBundle.loadString('FontManifest.json')) as List<dynamic>;
    final family = manifest.cast<Map<String, dynamic>>().firstWhere((f) => f['family'] == 'IBMPlexSansArabic');
    final fonts = (family['fonts'] as List).cast<Map<String, dynamic>>();
    expect(fonts.map((f) => f['weight']), containsAll([400, 500, 600, 700]));

    final loader = FontLoader('IBMPlexSansArabicTest');
    for (final f in fonts) {
      final data = await rootBundle.load(f['asset'] as String);
      // TrueType files start with 0x00010000.
      expect(data.getUint32(0), 0x00010000, reason: f['asset'] as String);
      loader.addFont(Future.value(data));
    }
    await loader.load();
  });
}
