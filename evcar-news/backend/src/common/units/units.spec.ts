import { convertUnit, dimensionOf, hpToKw, kwToHp, roundTo, UnitConversionError } from './units';

describe('convertUnit', () => {
  it.each<[number, string, string, number]>([
    [100, 'mi', 'km', 160.9344],
    [1, 'km', 'mm', 1_000_000],
    [4.5, 'm', 'mm', 4500],
    [60000, 'Wh', 'kWh', 60],
    [100, 'kW', 'hp', 134.1022],
    [100, 'PS', 'kW', 73.5499],
    [15, 'kWh/100km', 'Wh/km', 150],
    [4, 'mi/kWh', 'Wh/km', 155.3428],
    [250, 'Wh/mi', 'Wh/km', 155.3428],
    [6.25, 'km/kWh', 'Wh/km', 160],
    [300, 'lb-ft', 'Nm', 406.7454],
    [30, 'mpg(US)', 'L/100km', 7.8405],
    [90, 'min', 's', 5400],
    [15, 'cu ft', 'l', 424.7527],
    [60, 'mph', 'km/h', 96.5606],
  ])('%d %s → %s', (value, from, to, expected) => {
    expect(roundTo(convertUnit(value, from, to), 4)).toBeCloseTo(expected, 4);
  });

  it('keeps null/undefined as null (missing is never 0)', () => {
    expect(convertUnit(null, 'km', 'mi')).toBeNull();
    expect(convertUnit(undefined, 'km', 'mi')).toBeNull();
  });

  it('keeps zero as zero for linear units', () => {
    expect(convertUnit(0, 'kWh', 'Wh')).toBe(0);
  });

  it('rejects zero for inverse units instead of producing Infinity', () => {
    expect(() => convertUnit(0, 'mi/kWh', 'Wh/km')).toThrow(UnitConversionError);
  });

  it('rejects mixed dimensions and unknown units', () => {
    expect(() => convertUnit(1, 'km', 'kWh')).toThrow(/Cannot convert/);
    expect(() => convertUnit(1, 'parsec', 'km')).toThrow(/Unknown unit/);
    expect(() => convertUnit(Number.NaN, 'km', 'm')).toThrow(/finite/);
  });

  it('round-trips', () => {
    const wh = convertUnit(4.2, 'mi/kWh', 'Wh/km');
    expect(convertUnit(wh, 'Wh/km', 'mi/kWh')).toBeCloseTo(4.2, 10);
  });

  it('knows dimensions', () => {
    expect(dimensionOf('kWh/100km')).toBe('energy_per_distance');
  });
});

describe('power helpers', () => {
  it('converts kW <-> hp', () => {
    expect(roundTo(kwToHp(150), 1)).toBe(201.2);
    expect(roundTo(hpToKw(201.2), 1)).toBe(150);
  });
});

describe('roundTo', () => {
  it('rounds half away from zero', () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(-1.005, 2)).toBe(-1.01);
    expect(roundTo(2.5, 0)).toBe(3);
  });
});
