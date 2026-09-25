import {
  addMoney,
  convertMoneyEstimate,
  formatMoney,
  MoneyError,
  multiplyMoney,
  toMoney,
  toMoneyOrNull,
} from './money';

describe('money', () => {
  it('uses decimal strings with fixed minor units', () => {
    expect(toMoney('1234567.5', 'EGP')).toEqual({ amount: '1234567.50', currency: 'EGP' });
    expect(toMoney(0.1 + 0.2, 'SAR')).toEqual({ amount: '0.30', currency: 'SAR' });
    expect(toMoney('2.345', 'AED')).toEqual({ amount: '2.35', currency: 'AED' });
  });

  it('keeps missing as null', () => {
    expect(toMoneyOrNull(null, 'EGP')).toBeNull();
    expect(toMoneyOrNull('10', null)).toBeNull();
  });

  it('rejects invalid currency and mixed currencies', () => {
    expect(() => toMoney('1', 'egp')).toThrow(MoneyError);
    expect(() => addMoney(toMoney('1', 'EGP'), toMoney('1', 'SAR'))).toThrow(/Cannot add/);
  });

  it('adds and multiplies exactly', () => {
    expect(addMoney(toMoney('0.10', 'EGP'), toMoney('0.20', 'EGP')).amount).toBe('0.30');
    expect(multiplyMoney(toMoney('2.50', 'EGP'), '36').amount).toBe('90.00');
  });

  it('labels converted prices as estimates', () => {
    const est = convertMoneyEstimate(toMoney('1000', 'SAR'), '13.1234', 'EGP');
    expect(est).toMatchObject({
      amount: '13123.40',
      currency: 'EGP',
      isEstimate: true,
      original: { amount: '1000.00', currency: 'SAR' },
      label: { ar: 'تقديري بعد التحويل' },
    });
    expect(() => convertMoneyEstimate(toMoney('1', 'SAR'), 0, 'EGP')).toThrow(/> 0/);
  });

  it('formats per language', () => {
    expect(formatMoney(toMoney('1500', 'EGP'), 'en')).toContain('1,500.00');
    expect(formatMoney(toMoney('1500', 'EGP'), 'ar')).toMatch(/١٬?٥٠٠|1,500/);
  });
});
