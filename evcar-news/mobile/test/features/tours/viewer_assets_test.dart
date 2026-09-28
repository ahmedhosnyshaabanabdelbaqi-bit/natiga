import 'package:evcar_news/features/tours/domain/viewer_protocol.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// Static checks of the bundled viewer page. Its behaviour in a real
/// browser engine is checked by `browser/viewer_browser_check.mjs`
/// (headless Chromium; see docs/decisions/mobile-tours.md §7).
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('viewer page: strict CSP, only bundled scripts, no remote resources', () async {
    final html = await rootBundle.loadString('assets/panorama/viewer.html');
    final csp = RegExp(r'content="(default-src[^"]+)"').firstMatch(html)!.group(1)!;
    expect(csp, contains("default-src 'none'"));
    expect(csp, contains("script-src 'self' file:"));
    expect(csp, contains('connect-src blob:'));
    expect(csp, contains("object-src 'none'"));
    expect(csp, contains("frame-src 'none'"));
    expect(csp, isNot(contains('unsafe-inline')));
    expect(csp, isNot(contains('unsafe-eval')));
    expect(RegExp(r'''(src|href)="(https?:)?//''').hasMatch(html), isFalse, reason: 'no remote resources');
  });

  test('viewer bridge: protocol version, text-only DOM, no eval, CSP narrowing', () async {
    final js = await rootBundle.loadString('assets/panorama/viewer.js');
    expect(js, contains('var VERSION = $kViewerProtocolVersion;'));
    expect(js, contains('EvcarBridge'));
    expect(js, contains('textContent'));
    expect(js, contains('restrictToMediaOrigin'));
    expect(js, contains('Object.freeze'));
    for (final banned in ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'http://', 'https://']) {
      expect(js.contains(banned), isFalse, reason: banned);
    }
    final css = await rootBundle.loadString('assets/panorama/viewer.css');
    expect(css, isNot(contains('url(')), reason: 'no external resources from CSS');
  });

  test('every message type the app parses exists in the viewer', () async {
    final js = await rootBundle.loadString('assets/panorama/viewer.js');
    for (final type in ['ready', 'needImages', 'sceneShown', 'hotspot', 'multiresFailed', 'error']) {
      expect(js, contains("type: '$type'"), reason: type);
    }
    for (final type in ['init', 'image', 'show', 'useMultires', 'resetView', 'zoom', 'look', 'pause', 'resume', 'destroy']) {
      expect(js, contains("case '$type'"), reason: type);
    }
  });
}
