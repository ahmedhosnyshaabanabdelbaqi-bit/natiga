import { isValidContentSlug, slugFromTexts, uniqueSlug } from './slug';

describe('content slugs', () => {
  it('validates format and refuses ids / reserved words', () => {
    expect(isValidContentSlug('byd-seal-2026')).toBe(true);
    expect(isValidContentSlug('سيارة-كهربائية')).toBe(true);
    expect(isValidContentSlug('Upper-Case')).toBe(false);
    expect(isValidContentSlug('double--dash')).toBe(false);
    expect(isValidContentSlug('-lead')).toBe(false);
    expect(isValidContentSlug('01a0d874-9850-70ff-a37b-c700bbbb988b')).toBe(false);
    expect(isValidContentSlug('preview')).toBe(false);
  });

  it('builds slugs from the first usable text (Arabic kept, normalized)', () => {
    expect(slugFromTexts([null, 'BYD Seal: 2026 review!'])).toBe('byd-seal-2026-review');
    expect(slugFromTexts(['إطلاق سيارة كهربائيّة'])).toBe('اطلاق-سياره-كهرباييه');
    expect(slugFromTexts(['!!!'])).toMatch(/^n-[0-9a-f]{8}$/);
  });

  it('adds a counter when taken', async () => {
    const taken = new Set(['a', 'a-2']);
    expect(await uniqueSlug('a', (s) => Promise.resolve(taken.has(s)))).toBe('a-3');
    expect(await uniqueSlug('b', (s) => Promise.resolve(taken.has(s)))).toBe('b');
  });
});
