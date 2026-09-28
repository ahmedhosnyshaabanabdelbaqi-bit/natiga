import {
  categoryAllowed,
  DEFAULT_PREFERENCES,
  isSafeDeepLink,
  quietHoursState,
} from './notification-rules';

describe('categoryAllowed', () => {
  it('follows the per-type switches; account is never muted', () => {
    expect(categoryAllowed(DEFAULT_PREFERENCES, 'news')).toBe(true);
    expect(categoryAllowed({ ...DEFAULT_PREFERENCES, newsEnabled: false }, 'news')).toBe(false);
    expect(categoryAllowed({ ...DEFAULT_PREFERENCES, newsEnabled: false }, 'reminder')).toBe(true);
    const unsub = { ...DEFAULT_PREFERENCES, unsubscribedAt: new Date() };
    for (const c of [
      'news',
      'price_alert',
      'reminder',
      'community',
      'station',
      'campaign',
    ] as const) {
      expect(categoryAllowed(unsub, c)).toBe(false);
    }
    expect(categoryAllowed(unsub, 'account')).toBe(true);
  });
});

describe('quietHoursState', () => {
  // Africa/Cairo is UTC+3 in late September 2026 (DST).
  const tz = 'Africa/Cairo';

  it('window crossing midnight', () => {
    const at = (iso: string) => quietHoursState('22:00', '07:00', tz, new Date(iso));
    expect(at('2026-09-25T20:30:00Z')).toEqual({
      quiet: true,
      endsAt: new Date('2026-09-26T04:00:00Z'),
    }); // 23:30 local
    expect(at('2026-09-26T02:00:00Z')).toEqual({
      quiet: true,
      endsAt: new Date('2026-09-26T04:00:00Z'),
    }); // 05:00 local
    expect(at('2026-09-26T04:00:00Z').quiet).toBe(false); // 07:00 local = end (exclusive)
    expect(at('2026-09-25T12:00:00Z').quiet).toBe(false);
  });

  it('same-day window', () => {
    expect(quietHoursState('13:00', '15:00', tz, new Date('2026-09-25T11:00:00Z'))).toEqual({
      quiet: true,
      endsAt: new Date('2026-09-25T12:00:00Z'),
    });
  });

  it('no / invalid / empty windows are never quiet', () => {
    const now = new Date('2026-09-25T20:30:00Z');
    expect(quietHoursState(null, null, tz, now).quiet).toBe(false);
    expect(quietHoursState('22:00', '07:00', 'Mars/Base', now).quiet).toBe(false);
    expect(quietHoursState('25:00', '07:00', tz, now).quiet).toBe(false);
    expect(quietHoursState('07:00', '07:00', tz, now).quiet).toBe(false);
  });
});

describe('isSafeDeepLink', () => {
  it('accepts app paths and https URLs only', () => {
    expect(isSafeDeepLink('/news/some-slug')).toBe(true);
    expect(isSafeDeepLink('/')).toBe(true);
    expect(isSafeDeepLink('https://evcar.news/cars/x')).toBe(true);
    expect(isSafeDeepLink(null)).toBe(true);
    expect(isSafeDeepLink('//evil.example')).toBe(false);
    expect(isSafeDeepLink('javascript:alert(1)')).toBe(false);
    expect(isSafeDeepLink('http://evcar.news')).toBe(false);
    expect(isSafeDeepLink('/\\evil')).toBe(false);
  });
});
