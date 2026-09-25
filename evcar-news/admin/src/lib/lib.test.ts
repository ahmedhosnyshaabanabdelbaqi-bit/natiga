import { describe, expect, it } from 'vitest';
import { contrastRatio, parseHex } from './color';
import { computeDiff, previewValue } from './diff';
import { isDecimalString, normalizeDigits, parseNumberInput } from './numbers';
import { alternativeUnits, roundTo, toCanonical } from './units';

describe('computeDiff', () => {
  it('lists added, removed and changed fields with dotted paths', () => {
    const before = {
      title: 'Old',
      status: 'draft',
      tags: ['a', 'b'],
      meta: { views: 1, legacy: true },
    };
    const after = {
      title: 'New',
      status: 'draft',
      tags: ['a', 'c', 'd'],
      meta: { views: 2 },
      slug: 'new',
    };
    expect(computeDiff(before, after)).toEqual([
      { path: 'meta.legacy', kind: 'removed', before: true },
      { path: 'meta.views', kind: 'changed', before: 1, after: 2 },
      { path: 'slug', kind: 'added', after: 'new' },
      { path: 'tags[1]', kind: 'changed', before: 'b', after: 'c' },
      { path: 'tags[2]', kind: 'added', after: 'd' },
      { path: 'title', kind: 'changed', before: 'Old', after: 'New' },
    ]);
  });

  it('treats create (no before) and delete (no after) as whole-object changes', () => {
    expect(computeDiff(null, { a: 1 })).toEqual([
      { path: '(root)', kind: 'added', after: { a: 1 } },
    ]);
    expect(computeDiff({ a: 1 }, undefined)).toEqual([
      { path: '(root)', kind: 'removed', before: { a: 1 } },
    ]);
    expect(computeDiff(undefined, undefined)).toEqual([]);
  });

  it('distinguishes null from missing and ignores equal values', () => {
    expect(computeDiff({ a: null, b: 1 }, { a: 0, b: 1 })).toEqual([
      { path: 'a', kind: 'changed', before: null, after: 0 },
    ]);
  });

  it('previews long values compactly', () => {
    expect(previewValue('x'.repeat(300), 20)).toHaveLength(20);
    expect(previewValue(null)).toBe('null');
    expect(previewValue({ a: 1 })).toBe('{"a":1}');
  });
});

describe('numbers', () => {
  it('normalises Arabic-Indic digits and separators', () => {
    expect(normalizeDigits('١٢٣٫٥')).toBe('123.5');
    expect(normalizeDigits('۱۲۳')).toBe('123');
    expect(normalizeDigits('١٬٢٥٠')).toBe('1250');
  });
  it('keeps empty input as null (never 0)', () => {
    expect(parseNumberInput('')).toBeNull();
    expect(parseNumberInput('   ')).toBeNull();
    expect(parseNumberInput(null)).toBeNull();
    expect(parseNumberInput('abc')).toBeNull();
    expect(parseNumberInput('0')).toBe(0);
    expect(parseNumberInput('٤٥٫٥')).toBe(45.5);
    expect(parseNumberInput('1,250.75')).toBe(1250.75);
  });
  it('validates decimal strings for money', () => {
    expect(isDecimalString('1250000.50')).toBe(true);
    expect(isDecimalString('1250000.505')).toBe(false);
    expect(isDecimalString('-5')).toBe(false);
    expect(isDecimalString('1e5')).toBe(false);
  });
});

describe('units', () => {
  it('converts alternative units to canonical ones', () => {
    expect(roundTo(toCanonical(100, 'mi', 'km')!, 3)).toBe(160.934);
    expect(toCanonical(15, 'kWh/100km', 'Wh/km')).toBe(150);
    expect(roundTo(toCanonical(4, 'mi/kWh', 'Wh/km')!, 1)).toBe(155.3);
    expect(toCanonical(1.5, 'h', 'min')).toBe(90);
    expect(toCanonical(42, 'km', 'km')).toBe(42);
  });
  it('returns null for unknown conversions, null input and division by zero', () => {
    expect(toCanonical(10, 'furlong', 'km')).toBeNull();
    expect(toCanonical(null, 'mi', 'km')).toBeNull();
    expect(toCanonical(0, 'mi/kWh', 'Wh/km')).toBeNull();
    expect(toCanonical(Number.NaN, 'km', 'km')).toBeNull();
  });
  it('never offers conversions between range test cycles', () => {
    expect(alternativeUnits('km')).toEqual(['mi']);
  });
});

describe('colour contrast', () => {
  it('computes WCAG ratios', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#0A5CFF', '#FFFFFF')!).toBeGreaterThan(4.5);
    expect(contrastRatio('#00C2E0', '#FFFFFF')!).toBeLessThan(4.5);
    expect(contrastRatio('nope', '#fff')).toBeNull();
  });
});
