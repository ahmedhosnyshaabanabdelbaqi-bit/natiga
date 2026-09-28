import { normalizeSearchText } from '../../../common/i18n/arabic-normalize';
import {
  highlightRanges,
  prefixTsQuery,
  snippetAround,
  trigramSimilarity,
} from '../common/text-match';
import { buildQueryPlan, type AliasEntry } from './query-plan';

const alias = (term: string, canonical: string, extra: Partial<AliasEntry> = {}): AliasEntry => ({
  id: `${term}-${canonical}`,
  term,
  canonical,
  termNormalized: normalizeSearchText(term),
  canonicalNormalized: normalizeSearchText(canonical),
  entityType: null,
  entityId: null,
  ...extra,
});

const ALIASES = [
  alias('بي واي دي', 'BYD'),
  alias('بى واى دى', 'BYD'),
  alias('تسلا', 'Tesla'),
  alias('زيكر', 'Zeekr', { entityType: 'brand', entityId: 'b-zeekr' }),
];

describe('buildQueryPlan', () => {
  it('normalizes the query (hamza forms incl. ئ→ي, taa marbuta, alef maqsura, diacritics)', () => {
    const plan = buildQueryPlan('أَسعار السيارة الكهربائيّة في مصرَ ومستوى', []);
    expect(plan.normalized).toBe('اسعار السياره الكهرباييه في مصر ومستوي');
    expect(plan.variants).toEqual([{ text: plan.normalized, weight: 1, via: 'query' }]);
  });

  it('expands a multi-word alias inside the query both ways', () => {
    const plan = buildQueryPlan('سعر بي واي دي سيل', ALIASES);
    const texts = plan.variants.map((v) => v.text);
    expect(texts[0]).toBe('سعر بي واي دي سيل');
    expect(texts).toContain('سعر byd سيل');
    expect(plan.expansions).toEqual([{ term: 'بي واي دي', canonical: 'BYD' }]);

    const back = buildQueryPlan('BYD Seal', ALIASES);
    expect(back.variants.map((v) => v.text)).toContain('بي واي دي seal');
  });

  it('matches alias spellings after normalization (ى/ي)', () => {
    const plan = buildQueryPlan('بى واى دى', ALIASES);
    expect(plan.variants.map((v) => v.text)).toContain('byd');
  });

  it('only whole tokens trigger an exact alias ("تسلاتي" is not "تسلا")', () => {
    const plan = buildQueryPlan('تسلاتي', ALIASES);
    expect(plan.variants.some((v) => v.via === 'alias')).toBe(false);
  });

  it('typo close to an alias uses it with a lower weight', () => {
    const plan = buildQueryPlan('زيكرر', ALIASES);
    const fuzzy = plan.variants.filter((v) => v.via === 'fuzzy_alias');
    expect(fuzzy.map((v) => v.text)).toContain('zeekr');
    expect(fuzzy.every((v) => v.weight < 1)).toBe(true);
    expect(plan.pinned).toEqual([{ entityType: 'brand', entityId: 'b-zeekr' }]);
  });

  it('caps the number of variants', () => {
    const many = Array.from({ length: 20 }, (_, i) => alias(`كلمه${i}`, `word${i}`));
    const plan = buildQueryPlan(many.map((a) => a.term).join(' '), many);
    expect(plan.variants.length).toBeLessThanOrEqual(8);
    expect(plan.variants[0].via).toBe('query');
  });
});

describe('text-match', () => {
  it('highlights in the original text using normalized matching', () => {
    const title = 'أساسيات الشحن المنزليّ';
    const ranges = highlightRanges(title, ['اساسيات', 'المنزلي']);
    expect(ranges.map((r) => title.slice(r.start, r.end))).toEqual(['أساسيات', 'المنزليّ']);
  });

  it('highlights Latin case-insensitively and merges overlaps', () => {
    const r = highlightRanges('Tesla Model 3', ['tesla', 'tes', 'model']);
    expect(r).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 11 },
    ]);
  });

  it('single-letter needles only match at word start', () => {
    expect(highlightRanges('abc bcd', ['b'])).toEqual([{ start: 4, end: 5 }]);
  });

  it('snippets cut around the first match with ellipses', () => {
    const text = `${'مقدمة طويلة '.repeat(40)}الشحن السريع ${'خاتمة '.repeat(40)}`;
    const s = snippetAround(text, ['السريع'], 120)!;
    expect(s.length).toBeLessThanOrEqual(122);
    expect(s).toContain('السريع');
    expect(s.startsWith('…')).toBe(true);
    expect(s.endsWith('…')).toBe(true);
  });

  it('prefix tsquery has no injectable syntax', () => {
    expect(prefixTsQuery("tesla & mod'el:*")).toBe('tesla & mod & el:*');
    expect(prefixTsQuery('!!!')).toBeNull();
  });

  it('trigram similarity is symmetric and 1 for equal words', () => {
    expect(trigramSimilarity('zeekr', 'zeekr')).toBe(1);
    expect(trigramSimilarity('zeekr', 'zeekrr')).toBeCloseTo(trigramSimilarity('zeekrr', 'zeekr'));
    expect(trigramSimilarity('zeekr', 'tesla')).toBe(0);
  });
});
