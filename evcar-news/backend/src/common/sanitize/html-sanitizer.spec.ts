import {
  escapeHtml,
  htmlToPlainText,
  sanitizeArticleHtml,
  sanitizePlainText,
} from './html-sanitizer';

describe('sanitizeArticleHtml', () => {
  it('removes scripts, event handlers and javascript: URLs', () => {
    const out = sanitizeArticleHtml(
      '<p onclick="alert(1)">Hi<script>alert(1)</script></p><a href="javascript:alert(1)">x</a><img src="x" onerror="alert(1)">',
    );
    expect(out).not.toMatch(/script|onclick|onerror|javascript:/i);
    expect(out).toContain('<p>Hi</p>');
  });

  it('keeps tables, headings, lists and https links with safe rel', () => {
    const out = sanitizeArticleHtml(
      '<h2>Specs</h2><table><thead><tr><th scope="col">kWh</th></tr></thead><tbody><tr><td colspan="2">60</td></tr></tbody></table><ul><li>a</li></ul><a href="https://evcar.news/x">link</a>',
    );
    expect(out).toContain('<h2>Specs</h2>');
    expect(out).toContain('<th scope="col">kWh</th>');
    expect(out).toContain('<td colspan="2">60</td>');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
  });

  it('allows only https images unless the origin is explicitly allowed', () => {
    expect(sanitizeArticleHtml('<img src="http://evil.test/a.jpg">')).toBe('');
    expect(sanitizeArticleHtml('<img src="data:image/png;base64,AAAA">')).toBe('');
    expect(sanitizeArticleHtml('<img src="https://cdn.evcar.news/a.jpg" alt="a">')).toContain(
      'src="https://cdn.evcar.news/a.jpg"',
    );
    expect(
      sanitizeArticleHtml('<img src="http://localhost:3000/media/a.jpg">', {
        extraImageOrigins: ['http://localhost:3000'],
      }),
    ).toContain('http://localhost:3000/media/a.jpg');
  });

  it('allows iframes only from the video allowlist and sandboxes them', () => {
    const yt = sanitizeArticleHtml(
      '<iframe src="https://www.youtube-nocookie.com/embed/abc" allowfullscreen></iframe>',
    );
    expect(yt).toContain('src="https://www.youtube-nocookie.com/embed/abc"');
    expect(yt).toContain('sandbox=');
    expect(sanitizeArticleHtml('<iframe src="https://evil.test/embed"></iframe>')).not.toContain(
      'evil.test',
    );
    expect(
      sanitizeArticleHtml('<iframe src="http://www.youtube.com/embed/abc"></iframe>'),
    ).not.toContain('youtube');
  });

  it('drops style attributes and forms', () => {
    const out = sanitizeArticleHtml('<p style="color:red">t</p><form><input></form>');
    expect(out).toBe('<p>t</p>');
  });

  it('keeps dir attributes for mixed RTL/LTR text', () => {
    expect(sanitizeArticleHtml('<p dir="rtl">مرحبا <span dir="ltr">BYD</span></p>')).toBe(
      '<p dir="rtl">مرحبا <span dir="ltr">BYD</span></p>',
    );
  });
});

describe('htmlToPlainText', () => {
  it('extracts readable text', () => {
    expect(
      htmlToPlainText(
        '<h2>Title</h2><p>A &amp; B&nbsp;&lt;C&gt;</p><script>x()</script><p>سيارة</p>',
      ),
    ).toBe('Title A & B <C> سيارة');
  });
});

describe('sanitizePlainText', () => {
  it('strips markup and control characters', () => {
    expect(sanitizePlainText('<b>Screen</b>\u0000 12.8" <img src=x onerror=alert(1)>')).toBe(
      'Screen 12.8"',
    );
  });
  it('limits length', () => {
    expect(sanitizePlainText('abcdef', 3)).toBe('abc');
  });
});

describe('escapeHtml', () => {
  it('escapes special characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});
