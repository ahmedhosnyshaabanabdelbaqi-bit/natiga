import { AppException } from '../../../common/errors/app.exception';
import { normalizeUnit, toCanonical } from './catalog-units';

function fieldOf(fn: () => unknown): { status: number; field?: string; rule?: string } {
  try {
    fn();
  } catch (e) {
    const err = e as AppException;
    const d = (err.details as { field: string; constraints: Record<string, string> }[])?.[0];
    return {
      status: err.getStatus(),
      field: d?.field,
      rule: d ? Object.keys(d.constraints)[0] : undefined,
    };
  }
  throw new Error('expected an error');
}

describe('catalog units', () => {
  it('normalizes unit spellings', () => {
    expect(normalizeUnit('KWH')).toBe('kWh');
    expect(normalizeUnit('kwh/100 km')).toBe('kWh/100km');
    expect(normalizeUnit('miles')).toBe('mi');
    expect(normalizeUnit('years')).toBe('year');
    expect(normalizeUnit('سنوات')).toBe('year');
    expect(normalizeUnit('  ')).toBeNull();
    expect(normalizeUnit('parsecs')).toBeNull();
  });

  it('keeps canonical values as they are, without an original value', () => {
    expect(toCanonical(75, undefined, 'kWh')).toEqual({
      value: 75,
      originalValue: null,
      originalUnit: null,
    });
    expect(toCanonical(75, 'kWh', 'kWh')).toEqual({
      value: 75,
      originalValue: null,
      originalUnit: null,
    });
  });

  it('converts to the canonical unit and keeps the published value', () => {
    expect(toCanonical(310.7, 'mi', 'km', { decimals: 1 })).toEqual({
      value: 500,
      originalValue: '310.7',
      originalUnit: 'mi',
    });
    expect(toCanonical(80000, 'Wh', 'kWh')).toMatchObject({ value: 80, originalUnit: 'Wh' });
    expect(toCanonical(16.5, 'kWh/100km', 'Wh/km')).toMatchObject({ value: 165 });
    expect(toCanonical(0.5, 'h', 'min')).toMatchObject({ value: 30 });
    expect(toCanonical(340, 'PS', 'kW', { decimals: 2 }).value).toBeCloseTo(250.07, 2);
  });

  it('an explicit original value wins over the automatic one', () => {
    expect(toCanonical(500, undefined, 'km', { originalValue: '311', originalUnit: 'mi' })).toEqual(
      { value: 500, originalValue: '311', originalUnit: 'mi' },
    );
  });

  it('refuses unknown units, other dimensions and units on unitless values', () => {
    expect(fieldOf(() => toCanonical(1, 'parsec', 'km'))).toMatchObject({
      status: 422,
      rule: 'unknownUnit',
    });
    expect(fieldOf(() => toCanonical(1, 'kWh', 'km'))).toMatchObject({
      status: 422,
      rule: 'unitDimension',
    });
    expect(fieldOf(() => toCanonical(1, 'km', null))).toMatchObject({
      status: 422,
      rule: 'unitNotAllowed',
    });
    expect(fieldOf(() => toCanonical(1, 'months', 'year'))).toMatchObject({
      status: 422,
      rule: 'unknownUnit',
    });
    expect(fieldOf(() => toCanonical(1, 'km', 'year', { field: 'items.0.unit' }))).toMatchObject({
      field: 'items.0.unit',
      rule: 'unitDimension',
    });
  });

  it('never converts between range test cycles (only units)', () => {
    // WLTP 500 km stays 500 km; nothing in the unit table maps one cycle to another.
    expect(normalizeUnit('WLTP')).toBeNull();
  });
});
