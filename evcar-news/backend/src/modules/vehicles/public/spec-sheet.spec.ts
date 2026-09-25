import { Decimal } from '@prisma/client-runtime-utils';
import { pickCurrentPrice, priceView, sortPriceHistory, sortRanges } from '../common/views';
import {
  buildSpecGroups,
  pointsByKey,
  scopeSpecs,
  type SpecDefRow,
  type SpecRow,
} from './spec-sheet';

const row = (over: Partial<SpecRow>): SpecRow => ({
  specKey: 'battery.usable_kwh',
  marketCode: null,
  valueNum: null,
  valueText: null,
  valueBool: null,
  unit: null,
  originalValue: null,
  originalUnit: null,
  reliability: 'unverified',
  verifiedAt: null,
  source: null,
  ...over,
});

const def = (key: string, group: string, over: Partial<SpecDefRow> = {}): SpecDefRow => ({
  key,
  group,
  dataType: 'number',
  unit: 'kWh',
  betterDirection: 'none',
  labelEn: key,
  labelAr: `ع ${key}`,
  descriptionEn: null,
  descriptionAr: null,
  isKeySpec: false,
  sortOrder: 0,
  ...over,
});

describe('spec sheet', () => {
  it('a market row overrides the global row; other markets are ignored', () => {
    const rows = [
      row({ specKey: 'warranty.vehicle_years', valueNum: new Decimal(3), marketCode: null }),
      row({ specKey: 'warranty.vehicle_years', valueNum: new Decimal(5), marketCode: 'EG' }),
      row({ specKey: 'warranty.vehicle_years', valueNum: new Decimal(8), marketCode: 'SA' }),
    ];
    expect(Number(scopeSpecs(rows, 'EG').get('warranty.vehicle_years')!.valueNum)).toBe(5);
    expect(Number(scopeSpecs(rows, 'AE').get('warranty.vehicle_years')!.valueNum)).toBe(3);
  });

  it('derives hp from kW (and kW from hp) only when missing, flagged as derived', () => {
    const kwOnly = pointsByKey(
      [
        row({
          specKey: 'performance.power_kw',
          valueNum: new Decimal(150),
          unit: 'kW',
          reliability: 'verified',
        }),
      ],
      'EG',
    );
    expect(kwOnly.get('performance.power_hp')).toMatchObject({
      value: 201,
      unit: 'hp',
      derived: true,
      reliability: 'verified',
      originalValue: '150',
      originalUnit: 'kW',
    });
    const both = pointsByKey(
      [
        row({ specKey: 'performance.power_kw', valueNum: new Decimal(150), unit: 'kW' }),
        row({ specKey: 'performance.power_hp', valueNum: new Decimal(204), unit: 'hp' }),
      ],
      'EG',
    );
    expect(both.get('performance.power_hp')).toMatchObject({ value: 204, derived: false });
    const hpOnly = pointsByKey(
      [row({ specKey: 'performance.power_hp', valueNum: new Decimal(204), unit: 'hp' })],
      'EG',
    );
    expect(hpOnly.get('performance.power_kw')).toMatchObject({ value: 152.1, derived: true });
  });

  it('lists every definition in group order with null for missing values (never 0)', () => {
    const defs = [
      def('warranty.vehicle_years', 'warranty', { unit: 'year' }),
      def('battery.gross_kwh', 'battery', { sortOrder: 2 }),
      def('battery.usable_kwh', 'battery', { sortOrder: 1, isKeySpec: true }),
      def('extra.thing', 'zzz_custom'),
    ];
    const points = pointsByKey(
      [row({ specKey: 'battery.usable_kwh', valueNum: new Decimal(0) })],
      'EG',
    );
    const groups = buildSpecGroups(defs, points, 'ar');
    expect(groups.map((g) => g.key)).toEqual(['battery', 'warranty', 'zzz_custom']);
    expect(groups[0].label).toBe('البطارية');
    expect(groups[0].items.map((i) => i.key)).toEqual(['battery.usable_kwh', 'battery.gross_kwh']);
    expect(groups[0].items[0].point).toMatchObject({ value: 0 }); // a real 0 stays 0
    expect(groups[0].items[1].point).toBeNull(); // missing stays null
    expect(groups[1].items[0].point).toBeNull();
  });
});

describe('prices', () => {
  const p = (over: Record<string, unknown>) => ({
    id: String(Math.random()),
    variantId: 'v',
    marketCode: 'EG',
    amount: new Decimal('1000000'),
    currencyCode: 'EGP',
    priceType: 'official_msrp' as const,
    effectiveFrom: new Date('2025-01-01'),
    effectiveTo: null as Date | null,
    sourceId: 's',
    verifiedAt: null,
    reliability: 'unverified' as const,
    notes: null,
    isDemo: false,
    createdById: null,
    createdAt: new Date('2025-01-01T10:00:00Z'),
    updatedAt: new Date('2025-01-01T10:00:00Z'),
    source: null,
    ...over,
  });

  it('current price: valid today, official before dealer before estimate, local currency first', () => {
    const prices = [
      p({
        priceType: 'market_estimate',
        currencyCode: 'USD',
        effectiveFrom: new Date('2025-06-01'),
      }),
      p({ priceType: 'dealer', effectiveFrom: new Date('2025-05-01') }),
      p({ id: 'old', effectiveFrom: new Date('2024-01-01'), effectiveTo: new Date('2024-12-31') }),
      p({ id: 'msrp', effectiveFrom: new Date('2025-01-01') }),
      p({ id: 'future', effectiveFrom: new Date('2026-01-01') }),
    ];
    expect(pickCurrentPrice(prices, '2025-07-01', 'EGP')?.id).toBe('msrp');
    expect(pickCurrentPrice(prices, '2024-06-01', 'EGP')?.id).toBe('old');
    expect(
      pickCurrentPrice(
        [p({ priceType: 'market_estimate', currencyCode: 'USD' })],
        '2025-07-01',
        'EGP',
      )?.currencyCode,
    ).toBe('USD');
    expect(pickCurrentPrice([], '2025-07-01', 'EGP')).toBeNull();
  });

  it('history is ordered by effective date (newest first), then by entry time', () => {
    const sorted = sortPriceHistory([
      p({ id: 'a', effectiveFrom: new Date('2025-01-01') }),
      p({
        id: 'c',
        effectiveFrom: new Date('2025-06-01'),
        createdAt: new Date('2025-06-01T09:00:00Z'),
      }),
      p({
        id: 'b',
        effectiveFrom: new Date('2025-06-01'),
        createdAt: new Date('2025-06-02T09:00:00Z'),
      }),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('price view: decimal string money, never converted, labels foreign-currency estimates', () => {
    const v = priceView(
      p({ priceType: 'market_estimate', currencyCode: 'USD', amount: new Decimal('41000.5') }),
      'en',
      '2025-07-01',
      'EGP',
    );
    expect(v).toMatchObject({
      amount: { amount: '41000.50', currency: 'USD' },
      priceTypeLabel: 'Market estimate',
      inMarketCurrency: false,
      isCurrent: true,
    });
  });

  it('ranges: electric first, then cycle order', () => {
    const sorted = sortRanges([
      { rangeType: 'total', cycle: 'WLTP', valueKm: 900 },
      { rangeType: 'electric', cycle: 'CLTC', valueKm: 120 },
      { rangeType: 'electric', cycle: 'WLTP', valueKm: 80 },
    ]);
    expect(sorted.map((r) => `${r.rangeType}/${r.cycle}`)).toEqual([
      'electric/WLTP',
      'electric/CLTC',
      'total/WLTP',
    ]);
  });
});
