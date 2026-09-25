import { containsArabic, normalizeSearchText, slugify } from './arabic-normalize';

describe('normalizeSearchText', () => {
  it.each([
    ['أحمد', 'احمد'],
    ['إسلام', 'اسلام'],
    ['آمال', 'امال'],
    ['ٱلكتاب', 'الكتاب'],
    ['على', 'علي'],
    ['سيارة', 'سياره'],
    ['مؤسسة', 'موسسه'],
    ['كهربائية', 'كهرباييه'],
    ['ســــيارة', 'سياره'],
    ['السَّيَّارَةُ الكَهْرَبَائِيَّةُ', 'السياره الكهرباييه'],
    ['ﻻ', 'لا'],
    ['٢٠٢٥', '2025'],
    ['۱۲۳', '123'],
    ['ی ک', 'ي ك'],
    ['  BYD   Seal  ', 'byd seal'],
    ['Škoda Enyaq', 'skoda enyaq'],
    ['Citroën ë-C4', 'citroen e-c4'],
  ])('normalizes %s → %s', (input, expected) => {
    expect(normalizeSearchText(input)).toBe(expected);
  });

  it('treats alef variants as equal', () => {
    const variants = ['أودي', 'إودي', 'آودي', 'اودي'];
    const normalized = new Set(variants.map((v) => normalizeSearchText(v)));
    expect(normalized.size).toBe(1);
  });

  it('makes common spelling variants of brand names match', () => {
    expect(normalizeSearchText('تِسْلا')).toBe(normalizeSearchText('تسلا'));
    expect(normalizeSearchText('شاومى')).toBe(normalizeSearchText('شاومي'));
  });

  it('returns null for null/undefined and empty string for blanks', () => {
    expect(normalizeSearchText(null)).toBeNull();
    expect(normalizeSearchText(undefined)).toBeNull();
    expect(normalizeSearchText('   ')).toBe('');
  });

  it('is idempotent', () => {
    const once = normalizeSearchText('السَّيَّارَةُ أ إ آ ى ة ٣');
    expect(normalizeSearchText(once)).toBe(once);
  });
});

describe('containsArabic', () => {
  it('detects Arabic script', () => {
    expect(containsArabic('BYD بي واي دي')).toBe(true);
    expect(containsArabic('Tesla Model 3')).toBe(false);
  });
});

describe('slugify', () => {
  it('builds latin slugs', () => {
    expect(slugify('BYD Seal 2025 — Premium AWD')).toBe('byd-seal-2025-premium-awd');
  });
  it('keeps (normalized) Arabic letters', () => {
    expect(slugify('سيارة كهربائية جديدة!')).toBe('سياره-كهرباييه-جديده');
  });
  it('trims to max length on a word boundary', () => {
    const slug = slugify('alpha beta gamma delta', 12);
    expect(slug).toBe('alpha-beta');
  });
});
