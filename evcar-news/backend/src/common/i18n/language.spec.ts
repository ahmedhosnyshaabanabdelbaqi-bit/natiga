import { directionOf, parseAcceptLanguage, resolveLanguage } from './language';

describe('language resolution', () => {
  it('parses Accept-Language by quality then order', () => {
    expect(parseAcceptLanguage('fr-CH, fr;q=0.9, en;q=0.8, ar;q=0.95, *;q=0.5')).toEqual([
      'fr-ch',
      'ar',
      'fr',
      'en',
      '*',
    ]);
    expect(parseAcceptLanguage(undefined)).toEqual([]);
    expect(parseAcceptLanguage('en;q=0')).toEqual([]);
  });

  it('prefers ?lang, then Accept-Language, then the default', () => {
    expect(resolveLanguage('en', 'ar', 'ar')).toBe('en');
    expect(resolveLanguage('EN', undefined, 'ar')).toBe('en');
    expect(resolveLanguage('fr', 'en-US,en;q=0.9', 'ar')).toBe('en');
    expect(resolveLanguage(undefined, 'ar-EG', 'en')).toBe('ar');
    expect(resolveLanguage(undefined, 'de, fr', 'ar')).toBe('ar');
    expect(resolveLanguage(undefined, undefined, 'en')).toBe('en');
  });

  it('knows text direction', () => {
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('en')).toBe('ltr');
  });
});
