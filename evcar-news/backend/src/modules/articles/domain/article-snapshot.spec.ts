import {
  buildSnapshot,
  diffSnapshots,
  parseSnapshot,
  textChanged,
  wordDiff,
} from './article-snapshot';

const base = {
  slug: 's',
  type: 'news',
  categoryId: null,
  authorId: 'u1',
  authorName: null,
  coverAssetId: null,
  originalLanguage: 'en',
  eventDate: new Date('2026-09-20T00:00:00Z'),
  sourceName: null,
  sourceUrl: null,
  isFeatured: false,
  isSponsored: false,
  sponsorName: null,
  allowComments: true,
  markets: [{ marketCode: 'SA' }, { marketCode: 'EG' }],
  tags: [{ tagId: 't2' }, { tagId: 't1' }],
  vehicleLinks: [{ brandId: null, modelId: 'm1', variantId: null }],
  translations: [
    {
      locale: 'en',
      title: 'Title',
      summary: null,
      bodyHtml: '<p>One two three</p>',
      seoTitle: null,
      seoDescription: null,
      isMachineTranslated: false,
      humanReviewedAt: null,
      humanReviewedById: null,
    },
  ],
};

describe('article snapshots', () => {
  it('are normalized (sorted lists, date-only event date)', () => {
    const s = buildSnapshot(base);
    expect(s.marketCodes).toEqual(['EG', 'SA']);
    expect(s.tagIds).toEqual(['t1', 't2']);
    expect(s.eventDate).toBe('2026-09-20');
    expect(parseSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(parseSnapshot({ foo: 1 })).toBeNull();
  });

  it('diff lists changed fields only; text changes are detected', () => {
    const a = buildSnapshot(base);
    const b = buildSnapshot({
      ...base,
      tags: [{ tagId: 't1' }],
      translations: [{ ...base.translations[0], title: 'New title' }],
    });
    expect(diffSnapshots(a, b)).toEqual([
      { field: 'tagIds', before: ['t1', 't2'], after: ['t1'] },
      { field: 'translations.en.title', before: 'Title', after: 'New title' },
    ]);
    expect(textChanged(a, b)).toBe(true);
    const c = buildSnapshot({ ...base, isFeatured: true });
    expect(textChanged(a, c)).toBe(false);
    expect(diffSnapshots(a, buildSnapshot(base))).toEqual([]);
  });

  it('a new language counts as a text change', () => {
    const a = buildSnapshot(base);
    const b = buildSnapshot({
      ...base,
      translations: [...base.translations, { ...base.translations[0], locale: 'ar', title: 'ع' }],
    });
    expect(diffSnapshots(a, b).map((c) => c.field)).toEqual(['translations.ar']);
    expect(textChanged(a, b)).toBe(true);
  });

  it('word diff', () => {
    expect(wordDiff('the quick brown fox', 'the slow brown fox jumps')).toEqual([
      { op: 'equal', text: 'the' },
      { op: 'delete', text: 'quick' },
      { op: 'insert', text: 'slow' },
      { op: 'equal', text: 'brown fox' },
      { op: 'insert', text: 'jumps' },
    ]);
    expect(wordDiff('a '.repeat(3000), 'b', 2000)).toBeNull();
  });
});
