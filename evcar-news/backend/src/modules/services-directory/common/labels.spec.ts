import { contactLabel, isStale, sponsorLabelOf, sponsoredNow } from './labels';

const NOW = new Date('2026-09-25T12:00:00Z');

describe('directory labels', () => {
  it('sponsored entries are always labelled; expired ones are not sponsored', () => {
    expect(
      sponsorLabelOf({ isSponsored: true, sponsoredUntil: null, sponsorLabel: null }, 'ar', NOW),
    ).toBe('مُموَّل');
    expect(
      sponsorLabelOf({ isSponsored: true, sponsoredUntil: null, sponsorLabel: '  ' }, 'en', NOW),
    ).toBe('Sponsored');
    expect(
      sponsorLabelOf({ isSponsored: true, sponsoredUntil: null, sponsorLabel: 'Ad' }, 'en', NOW),
    ).toBe('Ad');
    const expired = {
      isSponsored: true,
      sponsoredUntil: new Date('2026-09-01T00:00:00Z'),
      sponsorLabel: 'Ad',
    };
    expect(sponsoredNow(expired, NOW)).toBe(false);
    expect(sponsorLabelOf(expired, 'en', NOW)).toBeNull();
    expect(
      sponsorLabelOf({ isSponsored: false, sponsoredUntil: null, sponsorLabel: 'Ad' }, 'en', NOW),
    ).toBeNull();
  });

  it('contact verification labels and staleness', () => {
    expect(contactLabel(null, false, 'ar')).toBe('لم يتم التحقق من بيانات التواصل');
    expect(contactLabel(new Date('2026-03-03T10:00:00Z'), false, 'en')).toBe(
      'Verified on 3 March 2026',
    );
    expect(isStale(new Date('2025-09-01T00:00:00Z'), NOW)).toBe(true);
    expect(isStale(new Date('2026-01-01T00:00:00Z'), NOW)).toBe(false);
    expect(isStale(null, NOW)).toBe(false);
    expect(contactLabel(new Date('2025-01-01T00:00:00Z'), true, 'en')).toContain('may be outdated');
  });
});
