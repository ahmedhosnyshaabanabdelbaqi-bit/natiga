import { DEFAULT_ERROR_MESSAGES } from '../../common/errors/error-codes';
import { AR } from './catalogs/ar';
import { EN } from './catalogs/en';
import {
  interpolate,
  placeholdersOf,
  resolveErrorMessage,
  serverMessage,
  serverMessageText,
  setOverrideLookup,
} from './server-messages';

describe('server message catalogs', () => {
  afterEach(() => setOverrideLookup(() => undefined));

  it('ar and en have exactly the same keys', () => {
    expect(Object.keys(AR).sort()).toEqual(Object.keys(EN).sort());
  });

  it('every entry keeps the same placeholders in both languages and is non-empty', () => {
    for (const key of Object.keys(EN)) {
      expect({ key, p: placeholdersOf(AR[key]) }).toEqual({ key, p: placeholdersOf(EN[key]) });
      expect(AR[key].trim()).not.toBe('');
      expect(EN[key].trim()).not.toBe('');
    }
  });

  it('keys are namespaced (errors / notifications / labels)', () => {
    for (const key of Object.keys(EN))
      expect(key).toMatch(/^(errors|notifications|labels)\.[A-Za-z0-9_.]+$/);
  });

  it('covers every generic error code with the same texts as the error filter defaults', () => {
    for (const [code, text] of Object.entries(DEFAULT_ERROR_MESSAGES)) {
      expect(AR[`errors.${code}`]).toBe(text.ar);
      expect(EN[`errors.${code}`]).toBe(text.en);
    }
  });

  it('every notification template has a title and a body', () => {
    const templates = new Set(
      Object.keys(EN)
        .filter((k) => k.startsWith('notifications.'))
        .map((k) => k.split('.')[1]),
    );
    for (const t of templates) {
      expect(EN[`notifications.${t}.title`]).toBeDefined();
      expect(EN[`notifications.${t}.body`]).toBeDefined();
    }
  });

  it('interpolates and leaves unknown placeholders visible', () => {
    expect(interpolate('Hi {name}, {missing}', { name: 'Sara' })).toBe('Hi Sara, {missing}');
    expect(serverMessageText('errors.MARKET_IN_USE', 'ar', { code: 'EG' })).toContain('EG');
    expect(serverMessage('notifications.price_changed.title', { car: 'X' })).toEqual({
      ar: 'تحديث سعر X',
      en: 'Price update for X',
    });
  });

  it('applies admin overrides and falls back to the catalog', () => {
    setOverrideLookup((lang, key) =>
      lang === 'en' && key === 'errors.NOT_FOUND' ? 'Nothing here' : undefined,
    );
    expect(resolveErrorMessage('NOT_FOUND', 'en')).toBe('Nothing here');
    expect(resolveErrorMessage('NOT_FOUND', 'ar')).toBe('العنصر المطلوب غير موجود.');
    expect(resolveErrorMessage('NO_SUCH_CODE', 'ar')).toBeUndefined();
  });
});
