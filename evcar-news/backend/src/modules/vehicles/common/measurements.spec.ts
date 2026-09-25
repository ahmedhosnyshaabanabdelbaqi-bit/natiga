import { AppException } from '../../../common/errors/app.exception';
import {
  normalizeChargingTime,
  normalizeConsumption,
  normalizeCurvePoints,
  normalizeRange,
} from './measurements';
import { normalizeSpecValue, specValueChanged } from './spec-values';

function codeOf(fn: () => unknown): { code: string; field?: string; status: number } {
  try {
    fn();
  } catch (e) {
    const err = e as AppException;
    const d = (err.details as { field?: string }[] | undefined)?.[0];
    return {
      code: err.code,
      field: Array.isArray(err.details) ? d?.field : undefined,
      status: err.getStatus(),
    };
  }
  throw new Error('expected an error');
}

describe('powertrain rules (BEV vs hybrids)', () => {
  it('a BEV has only electric range and no fuel consumption', () => {
    expect(
      codeOf(() => normalizeRange({ cycle: 'WLTP', rangeType: 'total', value: 900 }, 'BEV')).code,
    ).toBe('NOT_APPLICABLE_TO_POWERTRAIN');
    expect(
      normalizeRange({ cycle: 'WLTP', rangeType: 'electric', value: 500 }, 'BEV').valueKm,
    ).toBe(500);
    expect(
      codeOf(() => normalizeConsumption({ cycle: 'WLTP', kind: 'fuel', value: 5 }, 'BEV')).code,
    ).toBe('NOT_APPLICABLE_TO_POWERTRAIN');
  });

  it('a PHEV keeps electric and total range separately', () => {
    expect(
      normalizeRange({ cycle: 'WLTP', rangeType: 'electric', value: 80 }, 'PHEV').rangeType,
    ).toBe('electric');
    expect(
      normalizeRange({ cycle: 'WLTP', rangeType: 'total', value: 950 }, 'PHEV').rangeType,
    ).toBe('total');
    expect(normalizeConsumption({ cycle: 'WLTP', kind: 'fuel', value: 1.2 }, 'PHEV').value).toBe(
      1.2,
    );
  });

  it('a HEV has no plug: no electric range, electricity use or charging data', () => {
    expect(
      codeOf(() => normalizeRange({ cycle: 'WLTP', rangeType: 'electric', value: 3 }, 'HEV')).code,
    ).toBe('NOT_APPLICABLE_TO_POWERTRAIN');
    expect(
      codeOf(() =>
        normalizeChargingTime(
          { currentType: 'AC', fromSoc: 0, toSoc: 100, duration: 60, chargerPowerKw: 3.6 },
          'HEV',
        ),
      ).code,
    ).toBe('NOT_APPLICABLE_TO_POWERTRAIN');
    expect(normalizeConsumption({ cycle: 'WLTP', kind: 'fuel', value: 4.5 }, 'HEV').kind).toBe(
      'fuel',
    );
  });
});

describe('ranges and consumption', () => {
  it('converts miles and consumption units, keeps the cycle', () => {
    expect(
      normalizeRange({ cycle: 'EPA', rangeType: 'electric', value: 300, unit: 'mi' }, 'BEV'),
    ).toMatchObject({
      cycle: 'EPA',
      valueKm: 482.8,
      originalValue: '300',
      originalUnit: 'mi',
    });
    expect(
      normalizeConsumption(
        { cycle: 'WLTP', kind: 'electricity', value: 6.2, unit: 'km/kWh' },
        'BEV',
      ).value,
    ).toBeCloseTo(161.29, 2);
    expect(
      normalizeConsumption({ cycle: 'WLTP', kind: 'fuel', value: 20, unit: 'km/L' }, 'PHEV').value,
    ).toBe(5);
  });

  it('OTHER needs a cycle name; values must be positive', () => {
    expect(
      codeOf(() => normalizeRange({ cycle: 'OTHER', rangeType: 'electric', value: 400 }, 'BEV'))
        .field,
    ).toBe('cycleNote');
    expect(
      normalizeRange(
        { cycle: 'OTHER', cycleNote: 'JC08', rangeType: 'electric', value: 400 },
        'BEV',
      ).cycleNote,
    ).toBe('JC08');
    expect(
      codeOf(() => normalizeRange({ cycle: 'WLTP', rangeType: 'electric', value: 0 }, 'BEV'))
        .status,
    ).toBe(422);
    expect(
      codeOf(() =>
        normalizeConsumption(
          { cycle: 'WLTP', kind: 'electricity', value: 150, unit: 'L/100km' },
          'BEV',
        ),
      ).field,
    ).toBe('unit');
  });
});

describe('charging times and curves', () => {
  const base = { currentType: 'DC', fromSoc: 10, toSoc: 80, duration: 30, chargerPowerKw: 150 };

  it('SoC is 0–100 with from < to', () => {
    expect(
      codeOf(() => normalizeChargingTime({ ...base, fromSoc: 80, toSoc: 10 }, 'BEV')).field,
    ).toBe('toSoc');
    expect(
      codeOf(() => normalizeChargingTime({ ...base, fromSoc: 50, toSoc: 50 }, 'BEV')).field,
    ).toBe('toSoc');
    expect(codeOf(() => normalizeChargingTime({ ...base, toSoc: 101 }, 'BEV')).field).toBe('toSoc');
    expect(codeOf(() => normalizeChargingTime({ ...base, fromSoc: -1 }, 'BEV')).field).toBe(
      'toSoc',
    );
  });

  it('always states the charger condition; average power never above peak', () => {
    expect(
      codeOf(() => normalizeChargingTime({ ...base, chargerPowerKw: null }, 'BEV')).field,
    ).toBe('chargerPowerKw');
    expect(
      normalizeChargingTime(
        { ...base, chargerPowerKw: null, conditions: 'Public 150 kW charger' },
        'BEV',
      ).conditions,
    ).toBe('Public 150 kW charger');
    expect(
      codeOf(() => normalizeChargingTime({ ...base, peakPowerKw: 100, averagePowerKw: 120 }, 'BEV'))
        .field,
    ).toBe('averagePowerKw');
  });

  it('converts the duration to minutes', () => {
    expect(
      normalizeChargingTime({ ...base, duration: 1.5, durationUnit: 'h' }, 'BEV').durationMinutes,
    ).toBe(90);
    expect(
      normalizeChargingTime({ ...base, duration: 90, durationUnit: 's' }, 'BEV').durationMinutes,
    ).toBe(1.5);
  });

  it('curve points are sorted, unique and within 0–100%', () => {
    expect(
      normalizeCurvePoints([
        { socPercent: 80, powerKw: 50 },
        { socPercent: 10, powerKw: 150 },
      ]),
    ).toEqual([
      { socPercent: 10, powerKw: 150 },
      { socPercent: 80, powerKw: 50 },
    ]);
    expect(codeOf(() => normalizeCurvePoints([{ socPercent: 10, powerKw: 1 }])).status).toBe(422);
    expect(
      codeOf(() =>
        normalizeCurvePoints([
          { socPercent: 10, powerKw: 1 },
          { socPercent: 10, powerKw: 2 },
        ]),
      ).field,
    ).toBe('points.1.socPercent');
    expect(
      codeOf(() =>
        normalizeCurvePoints([
          { socPercent: 10, powerKw: 1 },
          { socPercent: 110, powerKw: 2 },
        ]),
      ).field,
    ).toBe('points.1.socPercent');
  });
});

describe('spec values', () => {
  const num = {
    key: 'battery.usable_kwh',
    group: 'battery',
    dataType: 'number' as const,
    unit: 'kWh',
  };
  const count = { key: 'safety.airbags', group: 'safety', dataType: 'number' as const, unit: null };
  const text = {
    key: 'battery.chemistry',
    group: 'battery',
    dataType: 'text' as const,
    unit: null,
  };
  const bool = { key: 'safety.aeb', group: 'safety', dataType: 'boolean' as const, unit: null };

  it('stores values in the column of their data type', () => {
    expect(normalizeSpecValue(num, { value: 60 })).toMatchObject({
      valueNum: 60,
      valueText: null,
      valueBool: null,
      unit: 'kWh',
    });
    expect(normalizeSpecValue(text, { value: ' LFP ' })).toMatchObject({
      valueNum: null,
      valueText: 'LFP',
    });
    expect(normalizeSpecValue(bool, { value: false })).toMatchObject({
      valueBool: false,
      valueNum: null,
    });
  });

  it('rejects wrong types, negative numbers, fractional counts and units on text', () => {
    expect(codeOf(() => normalizeSpecValue(num, { value: '60' })).field).toBe('value');
    expect(codeOf(() => normalizeSpecValue(num, { value: -1 })).field).toBe('value');
    expect(codeOf(() => normalizeSpecValue(count, { value: 6.5 })).field).toBe('value');
    expect(codeOf(() => normalizeSpecValue(text, { value: 'x', unit: 'kWh' })).field).toBe('unit');
    expect(codeOf(() => normalizeSpecValue(bool, { value: 'yes' })).field).toBe('value');
    expect(codeOf(() => normalizeSpecValue(text, { value: '   ' })).field).toBe('value');
  });

  it('0 is a real value when the source says so (never a stand-in for missing)', () => {
    expect(
      normalizeSpecValue({ ...num, key: 'practicality.frunk_l', unit: 'l' }, { value: 0 }).valueNum,
    ).toBe(0);
  });

  it('detects value changes only', () => {
    const stored = normalizeSpecValue(num, { value: 60 });
    expect(
      specValueChanged({ valueNum: '60.000000', valueText: null, valueBool: null }, stored),
    ).toBe(false);
    expect(specValueChanged({ valueNum: '61', valueText: null, valueBool: null }, stored)).toBe(
      true,
    );
    expect(specValueChanged({ valueNum: null, valueText: null, valueBool: true }, stored)).toBe(
      true,
    );
  });
});
