import { largestRendition } from './media-urls';

describe('largestRendition', () => {
  const urlOf = (key: string) => (key.startsWith('public/') ? `https://cdn.test/${key}` : null);

  it('picks the widest public rendition (private originals are never exposed)', () => {
    expect(
      largestRendition(
        [
          { kind: 'thumbnail', storageKey: 'public/media/a/thumb.webp', width: 3000, height: 1 },
          { kind: 'rendition', storageKey: 'public/media/a/w480.webp', width: 480, height: 320 },
          { kind: 'rendition', storageKey: 'public/media/a/w1600.webp', width: 1600, height: 1067 },
          {
            kind: 'rendition',
            storageKey: 'private/media/a/w2400.webp',
            width: 2400,
            height: 1600,
          },
        ],
        urlOf,
      ),
    ).toEqual({ url: 'https://cdn.test/public/media/a/w1600.webp', width: 1600, height: 1067 });
  });

  it('returns null when no public rendition exists', () => {
    expect(
      largestRendition([{ kind: 'preview', storageKey: 'public/x', width: 10, height: 5 }], urlOf),
    ).toBeNull();
  });
});
