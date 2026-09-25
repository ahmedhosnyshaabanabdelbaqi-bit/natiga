import { decodeFeedBody, FeedParseError, parseFeed, safeHttpUrl, toPlainText } from './feed-parser';

/** Synthetic feeds written for tests (example.invalid domains). */
const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>Synthetic EV Feed</title>
  <link>https://news.example.invalid/</link>
  <language>ar</language>
  <item>
    <title><![CDATA[خبر تجريبي <b>1</b>]]></title>
    <link>https://news.example.invalid/a/1</link>
    <guid isPermaLink="false">item-1</guid>
    <description><![CDATA[<p>Summary &amp; <a href="javascript:alert(1)">details</a></p><script>x()</script>]]></description>
    <content:encoded><![CDATA[<p>FULL ARTICLE BODY MUST NOT BE EXTRACTED</p>]]></content:encoded>
    <dc:creator>Fixture Author</dc:creator>
    <pubDate>Tue, 22 Sep 2026 10:00:00 GMT</pubDate>
    <category>Batteries</category><category>Charging</category><category>Batteries</category>
    <media:content url="https://img.example.invalid/1.jpg" medium="image"/>
  </item>
  <item>
    <title>Relative link item</title>
    <link>/a/2</link>
    <enclosure url="https://img.example.invalid/2.png" type="image/png" length="1"/>
  </item>
  <item><title>Bad link</title><link>javascript:alert(1)</link></item>
  <item><description>no title and no link</description></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en">
  <title>Synthetic Atom</title>
  <link rel="self" href="https://atom.example.invalid/feed.xml"/>
  <link rel="alternate" href="https://atom.example.invalid/"/>
  <entry>
    <id>tag:example.invalid,2026:1</id>
    <title type="html">Atom &lt;em&gt;entry&lt;/em&gt;</title>
    <link rel="alternate" href="https://atom.example.invalid/e/1"/>
    <link rel="enclosure" href="https://atom.example.invalid/e/1.mp3"/>
    <published>2026-09-20T08:00:00Z</published>
    <updated>2026-09-21T08:00:00Z</updated>
    <author><name>Atom Author</name></author>
    <summary>Short summary</summary>
    <category term="software"/>
  </entry>
</feed>`;

const RDF = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel rdf:about="https://rdf.example.invalid/"><title>RDF feed</title><link>https://rdf.example.invalid/</link></channel>
  <item rdf:about="https://rdf.example.invalid/1"><title>RDF item</title><link>https://rdf.example.invalid/1</link><dc:date>2026-09-19T00:00:00Z</dc:date></item>
</rdf:RDF>`;

describe('feed parser', () => {
  it('parses RSS 2.0 items: title, link, guid, excerpt only, author, date, categories, image', () => {
    const { feed, items } = parseFeed(RSS);
    expect(feed).toEqual({
      format: 'rss2',
      title: 'Synthetic EV Feed',
      link: 'https://news.example.invalid/',
      language: 'ar',
    });
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({
      guid: 'item-1',
      url: 'https://news.example.invalid/a/1',
      title: 'خبر تجريبي 1',
      excerpt: 'Summary & details',
      author: 'Fixture Author',
      publishedAt: '2026-09-22T10:00:00.000Z',
      updatedAt: null,
      categories: ['Batteries', 'Charging'],
      imageUrl: 'https://img.example.invalid/1.jpg',
    });
    expect(JSON.stringify(items)).not.toContain('FULL ARTICLE BODY');
    expect(items[1]).toMatchObject({
      url: 'https://news.example.invalid/a/2',
      imageUrl: 'https://img.example.invalid/2.png',
    });
    expect(items[2]).toMatchObject({ title: 'Bad link', url: null });
  });

  it('parses Atom entries with alternate links and summary', () => {
    const { feed, items } = parseFeed(ATOM);
    expect(feed).toMatchObject({
      format: 'atom',
      title: 'Synthetic Atom',
      link: 'https://atom.example.invalid/',
      language: 'en',
    });
    expect(items[0]).toEqual({
      guid: 'tag:example.invalid,2026:1',
      url: 'https://atom.example.invalid/e/1',
      title: 'Atom entry',
      excerpt: 'Short summary',
      author: 'Atom Author',
      publishedAt: '2026-09-20T08:00:00.000Z',
      updatedAt: '2026-09-21T08:00:00.000Z',
      categories: ['software'],
      imageUrl: null,
    });
  });

  it('parses RSS 1.0 (RDF)', () => {
    const { feed, items } = parseFeed(RDF);
    expect(feed.format).toBe('rdf');
    expect(items[0]).toMatchObject({
      title: 'RDF item',
      url: 'https://rdf.example.invalid/1',
      publishedAt: '2026-09-19T00:00:00.000Z',
    });
  });

  it('respects maxItems', () => {
    expect(parseFeed(RSS, 1).items).toHaveLength(1);
  });

  it('rejects entity declarations (billion laughs / XXE)', () => {
    const bomb = `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;">]><rss><channel><title>&lol2;</title></channel></rss>`;
    expect(() => parseFeed(bomb)).toThrow(FeedParseError);
    const xxe = `<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss><channel><title>&x;</title></channel></rss>`;
    expect(() => parseFeed(xxe)).toThrow(/entity declarations/);
  });

  it('rejects HTML pages, non-XML and unknown XML', () => {
    expect(() => parseFeed('<!DOCTYPE html><html><body>hi</body></html>')).toThrow(FeedParseError);
    expect(() => parseFeed('{"json":true}')).toThrow(FeedParseError);
    expect(() => parseFeed('<?xml version="1.0"?><sitemap/>')).toThrow(/Not an RSS/);
  });

  it('decodes the declared charset (e.g. windows-1256 Arabic feeds)', () => {
    // "مصر" in windows-1256
    const body = Buffer.concat([
      Buffer.from('<?xml version="1.0" encoding="windows-1256"?><rss><channel><title>'),
      Buffer.from([0xe3, 0xd5, 0xd1]),
      Buffer.from('</title></channel></rss>'),
    ]);
    expect(parseFeed(decodeFeedBody(body)).feed.title).toBe('مصر');
    expect(decodeFeedBody(Buffer.from('<rss/>'), 'text/xml; charset=utf-8')).toBe('<rss/>');
  });

  it('strips HTML to bounded plain text and keeps only http(s) URLs', () => {
    expect(toPlainText('<p>a&nbsp;<b>b</b></p>')).toBe('a b');
    expect(toPlainText('x'.repeat(600))).toHaveLength(500);
    expect(toPlainText('')).toBeNull();
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html,x')).toBeNull();
    expect(safeHttpUrl('/p', 'https://e.invalid/x/')).toBe('https://e.invalid/p');
  });
});
