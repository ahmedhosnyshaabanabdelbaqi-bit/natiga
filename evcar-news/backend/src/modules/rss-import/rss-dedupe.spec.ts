import {
  canonicalizeUrl,
  contentHashOf,
  dedupeKeys,
  draftPolicy,
  needsPermission,
  normalizeLanguage,
  sha256Hex,
  toLicenseMode,
  toUsagePolicy,
} from './rss-dedupe';

describe('RSS de-duplication keys', () => {
  it('canonicalizes URLs (case, fragment, default port, tracking params, order, slash)', () => {
    expect(
      canonicalizeUrl(
        'HTTPS://News.Example.COM:443/Cars/Seal/?utm_source=x&b=2&a=1&fbclid=abc#comments',
      ),
    ).toBe('https://news.example.com/Cars/Seal?a=1&b=2');
    expect(canonicalizeUrl('http://example.com:80/')).toBe('http://example.com/');
    expect(canonicalizeUrl('https://user:pw@example.com/a')).toBe('https://example.com/a');
    expect(canonicalizeUrl('https://example.com:8443/a')).toBe('https://example.com:8443/a');
  });

  it('refuses non-http(s) and invalid URLs', () => {
    expect(canonicalizeUrl('javascript:alert(1)')).toBeNull();
    expect(canonicalizeUrl('ftp://example.com/x')).toBeNull();
    expect(canonicalizeUrl('not a url')).toBeNull();
  });

  it('same story through tracking links → same urlHash', () => {
    const a = dedupeKeys({
      url: 'https://example.com/story?utm_campaign=rss',
      guid: 'g-1',
      title: 'T',
      summary: null,
    });
    const b = dedupeKeys({
      url: 'https://EXAMPLE.com/story#top',
      guid: 'g-2',
      title: 'T',
      summary: null,
    });
    expect(a!.urlHash).toBe(b!.urlHash);
    expect(a!.guidHash).toBe(sha256Hex('g-1'));
    expect(a!.guidHash).not.toBe(b!.guidHash);
    expect(a!.urlHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('content hash ignores Arabic spelling variants, diacritics, case and spacing', () => {
    expect(contentHashOf('إطلاق  سيارة كهربائيّة', 'ملخص')).toBe(
      contentHashOf('اطلاق سياره كهربائية', ' ملخص '),
    );
    expect(contentHashOf('Tesla Model Y', null)).toBe(contentHashOf('tesla model y', ''));
    expect(contentHashOf('A', 'x')).not.toBe(contentHashOf('A', 'y'));
  });

  it('no keys without a usable URL', () => {
    expect(
      dedupeKeys({ url: 'mailto:x@example.com', guid: null, title: 'x', summary: null }),
    ).toBeNull();
  });
});

describe('RSS licence modes', () => {
  it('maps API modes to the database policy and back', () => {
    for (const mode of ['link_only', 'summary_only', 'full_permitted'] as const) {
      expect(toLicenseMode(toUsagePolicy(mode))).toBe(mode);
    }
    expect(toUsagePolicy('link_only')).toBe('headline_link_only');
  });

  it('anything beyond headline + link, or images, needs a recorded permission', () => {
    expect(needsPermission('link_only', false)).toBe(false);
    expect(needsPermission('link_only', true)).toBe(true);
    expect(needsPermission('summary_only', false)).toBe(true);
    expect(needsPermission('full_permitted', false)).toBe(true);
  });

  it('drafts respect the licence (never more than the feed allows)', () => {
    expect(draftPolicy('link_only', false)).toEqual({ summary: false, body: false, image: false });
    expect(draftPolicy('summary_only', false)).toEqual({
      summary: true,
      body: false,
      image: false,
    });
    expect(draftPolicy('full_permitted', true)).toEqual({ summary: true, body: true, image: true });
  });

  it('normalizes item languages', () => {
    expect(normalizeLanguage('en-US')).toBe('en');
    expect(normalizeLanguage('AR_eg')).toBe('ar');
    expect(normalizeLanguage('fr')).toBeNull();
    expect(normalizeLanguage(null)).toBeNull();
  });
});
