import { normalizeEmbedUrl, prepareArticleHtml, readingMinutes } from './article-html';

describe('article HTML policy', () => {
  it('keeps structure: headings, lists, tables, figures, links', () => {
    const { html } = prepareArticleHtml(
      '<h2>Specs</h2><ul><li>Range</li></ul><table><thead><tr><th scope="col">A</th></tr></thead><tbody><tr><td colspan="2">1</td></tr></tbody></table>' +
        '<figure><img src="https://cdn.evcar.news/x.webp" alt="x"><figcaption>© Brand</figcaption></figure>' +
        '<p><a href="https://example.com">link</a></p>',
    );
    expect(html).toContain('<h2>Specs</h2>');
    expect(html).toContain('<th scope="col">A</th>');
    expect(html).toContain('<td colspan="2">1</td>');
    expect(html).toContain('<figcaption>© Brand</figcaption>');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it('strips scripts, event handlers, styles, forms and javascript/data URLs', () => {
    const { html, text } = prepareArticleHtml(
      '<p onclick="steal()" style="color:red">Hi<script>alert(1)</script></p>' +
        '<a href="javascript:alert(1)">x</a><img src="data:image/png;base64,AAAA">' +
        '<form action="https://evil"><input name="p"></form><style>p{}</style>' +
        '<object data="x"></object><svg><script>1</script></svg>',
    );
    expect(html).not.toMatch(/<script|onclick|style=|javascript:|data:|<form|<input|<object|<svg/);
    expect(text).toBe('Hi x');
  });

  it('reports every image source for the media-rights check', () => {
    const r = prepareArticleHtml(
      '<img src="https://a.example/1.jpg"><p><img src=" https://b.example/2.jpg "></p><img>',
    );
    expect(r.imageSources).toEqual(['https://a.example/1.jpg', 'https://b.example/2.jpg', '']);
  });

  it('rewrites YouTube embeds to youtube-nocookie and keeps only safe parameters', () => {
    const { html, rejectedEmbeds } = prepareArticleHtml(
      '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&start=30&mute=1" onload="x()"></iframe>',
    );
    expect(rejectedEmbeds).toEqual([]);
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=30"');
    expect(html).toContain('sandbox=');
    expect(html).not.toMatch(/autoplay|onload/);
  });

  it('accepts Vimeo players (with Do-Not-Track) and rejects any other iframe', () => {
    expect(normalizeEmbedUrl('https://player.vimeo.com/video/123456?h=abc&autoplay=1')).toBe(
      'https://player.vimeo.com/video/123456?h=abc&dnt=1',
    );
    const r = prepareArticleHtml(
      '<iframe src="https://evil.example/embed"></iframe><iframe src="https://www.youtube.com/watch?v=dQw4w9WgXcQ"></iframe><iframe></iframe>',
    );
    expect(r.rejectedEmbeds).toEqual([
      'https://evil.example/embed',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      '',
    ]);
    expect(r.html).not.toContain('<iframe');
  });

  it('non-https players are refused', () => {
    expect(normalizeEmbedUrl('http://www.youtube.com/embed/dQw4w9WgXcQ')).toBeNull();
    expect(normalizeEmbedUrl('https://youtube.com.evil.example/embed/dQw4w9WgXcQ')).toBeNull();
  });

  it('reading time', () => {
    expect(readingMinutes('')).toBeNull();
    expect(readingMinutes('one two')).toBe(1);
    expect(readingMinutes(Array(1000).fill('w').join(' '))).toBe(5);
  });
});
