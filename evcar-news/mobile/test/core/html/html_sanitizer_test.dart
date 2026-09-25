import 'package:evcar_news/core/html/html_sanitizer.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final s = HtmlSanitizer(baseUrl: 'https://evcar.news', mediaLinkText: 'Video');

  test('keeps structural markup and allowed attributes', () {
    const input =
        '<h2>Title</h2><p dir="rtl">نص <strong>مهم</strong> <a href="https://example.com/x" title="t">link</a></p>'
        '<table><tr><th colspan="2">h</th></tr><tr><td>1</td><td>2</td></tr></table>';
    final out = s.sanitize(input);
    expect(out, contains('<h2>Title</h2>'));
    expect(out, contains('<p dir="rtl">'));
    expect(out, contains('<a href="https://example.com/x" title="t">link</a>'));
    expect(out, contains('<th colspan="2">h</th>'));
  });

  test('removes scripts, styles, event handlers and forms', () {
    const input =
        '<p onclick="steal()" style="color:red">ok</p><script>alert(1)</script>'
        '<style>p{}</style><form action="x"><input name="p"></form><svg><script>x</script></svg>';
    final out = s.sanitize(input);
    expect(out, '<p>ok</p>');
  });

  test('blocks javascript:, data: and obfuscated schemes', () {
    final out = s.sanitize(
      '<a href="javascript:alert(1)">a</a><a href="java\nscript:alert(1)">b</a>'
      '<a href=" JAVASCRIPT:alert(1)">c</a><img src="data:image/png;base64,AAA"><a href="//evil.com/x">d</a>',
    );
    expect(out, 'abcd');
  });

  test('relative URLs resolve against the base URL; http images are dropped by default', () {
    final out = s.sanitize('<a href="/n/x">rel</a><img src="/media/a.jpg" alt="A"><img src="http://x.test/b.jpg">');
    expect(out, contains('<a href="https://evcar.news/n/x">rel</a>'));
    expect(out, contains('<img src="https://evcar.news/media/a.jpg" alt="A">'));
    expect(out, isNot(contains('x.test')));
  });

  test('embedded media become plain links (https only)', () {
    final out = s.sanitize(
      '<iframe src="https://www.youtube.com/embed/abc"></iframe><video src="http://insecure/v.mp4"></video>',
    );
    expect(out, '<p><a href="https://www.youtube.com/embed/abc">Video</a></p>');
  });

  test('unknown tags are unwrapped, h1 becomes h2, comments dropped', () {
    final out = s.sanitize('<custom-el><h1>T</h1><!-- c --><marquee>m</marquee></custom-el>');
    expect(out, '<h2>T</h2>m');
  });

  test('text is escaped on output', () {
    final out = s.sanitize('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    expect(out, '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });
}
