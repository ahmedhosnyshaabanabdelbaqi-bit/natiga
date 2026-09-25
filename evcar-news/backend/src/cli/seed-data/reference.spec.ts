import { normalizeSearchText } from '../../common/i18n/arabic-normalize';
import { DEFAULT_CATEGORIES, SEARCH_ALIASES } from './reference';

describe('reference data: default news categories', () => {
  it('covers the categories required by REQUIREMENTS §5', () => {
    expect(DEFAULT_CATEGORIES.map((c) => c.systemKey).sort()).toEqual(
      [
        'batteries_charging',
        'buying_guides',
        'news',
        'reviews',
        'safety',
        'software_ota',
        'test_drives',
      ].sort(),
    );
  });

  it('has unique, well-formed keys and slugs (same rule as the SQL CHECK)', () => {
    const keys = DEFAULT_CATEGORIES.map((c) => c.systemKey);
    const slugs = DEFAULT_CATEGORIES.map((c) => c.slug);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const c of DEFAULT_CATEGORIES) {
      expect(c.systemKey).toMatch(/^[a-z][a-z0-9_]{1,63}$/);
      expect(c.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('names every category in Arabic and English', () => {
    for (const c of DEFAULT_CATEGORIES) {
      for (const locale of ['ar', 'en'] as const) {
        expect(c.translations[locale].name.trim().length).toBeGreaterThan(0);
        expect(c.translations[locale].name.length).toBeLessThanOrEqual(200);
      }
      expect(c.translations.ar.name).toMatch(/[؀-ۿ]/);
    }
  });
});

describe('reference data: search aliases', () => {
  it('has no duplicate (term, canonical) pairs and no blank values', () => {
    const pairs = SEARCH_ALIASES.map((a) => `${a.term}\u0000${a.canonical}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    for (const a of SEARCH_ALIASES) {
      expect(a.term.trim()).toBe(a.term);
      expect(a.canonical.trim()).toBe(a.canonical);
      expect(a.term.length).toBeGreaterThan(0);
      expect(a.term.length).toBeLessThanOrEqual(200);
      expect(a.canonical.length).toBeLessThanOrEqual(200);
    }
  });

  it('only contains aliases that change the normalized query (useful expansions)', () => {
    for (const a of SEARCH_ALIASES) {
      expect(normalizeSearchText(a.term)).not.toBe(normalizeSearchText(a.canonical));
    }
  });

  it('never repeats a term that normalizes to an already seeded (term, canonical)', () => {
    const seen = new Set<string>();
    const repeated: string[] = [];
    for (const a of SEARCH_ALIASES) {
      const key = `${normalizeSearchText(a.term)}→${normalizeSearchText(a.canonical)}`;
      if (seen.has(key)) repeated.push(`${a.term} → ${a.canonical}`);
      seen.add(key);
    }
    // Pre-existing spelling variants that only differ by ى/ي or إ/ا are
    // kept for rows seeded in phase 1 (removing them would not delete them
    // from existing databases); no NEW redundant pairs may be added.
    expect(repeated).toEqual([
      'بى واى دى → BYD',
      'بي إم دبليو → BMW',
      'هيونداى → Hyundai',
      'إم جي → MG',
    ]);
  });
});
