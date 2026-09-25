/**
 * Synthetic catalog for the comparisons / recommendations e2e specs. Every
 * row is FICTIONAL test data (names start with "E2E", flagged is_demo) and
 * lives only in the per-run test database.
 */
import type { PrismaService } from '../src/prisma/prisma.service';

export interface TestCatalog {
  sourceId: string;
  brandId: string;
  modelId: string;
  modelYear2025: string;
  modelYear2026: string;
  /** BEV, WLTP 520 km, DC 10–80 % 28 min, EG + SA prices. */
  a: string;
  /** BEV, WLTP 400 km (published as 248.5 mi), DC 10–80 % 35 min, cheaper. */
  b: string;
  /** BEV, CLTC 600 km only, DC 30–80 % 20 min (mixed cycle / SoC window). */
  c: string;
  /** PHEV, WLTP electric 90 + total 900, AC inlet only. */
  d: string;
  /** BEV sedan without any price. */
  e: string;
  /** Draft (not public). */
  draft: string;
}

const NOTE = 'E2E synthetic test data — not a real car.';

export async function seedTestCatalog(prisma: PrismaService): Promise<TestCatalog> {
  const source = await prisma.specificationSource.create({
    data: { type: 'other', title: 'E2E test source (synthetic)', isDemo: true },
  });
  const brand = await prisma.brand.create({
    data: {
      slug: 'e2e-volt',
      nameEn: 'E2E Volt',
      nameAr: 'فولت اختبار',
      status: 'published',
      isDemo: true,
    },
  });
  const model = await prisma.carModel.create({
    data: {
      brandId: brand.id,
      slug: 'e2e-volt-one',
      nameEn: 'One',
      nameAr: 'ون',
      bodyType: 'suv',
      status: 'published',
      isDemo: true,
    },
  });
  const generation = await prisma.generation.create({
    data: { modelId: model.id, slug: 'gen-1', nameEn: 'Gen 1', nameAr: 'الجيل 1', isDemo: true },
  });
  const [y2025, y2026] = await Promise.all(
    [2025, 2026].map((year) =>
      prisma.modelYear.create({ data: { generationId: generation.id, year, isDemo: true } }),
    ),
  );

  const variant = async (
    slug: string,
    nameEn: string,
    powertrainType: 'BEV' | 'PHEV',
    extra: { bodyType?: 'suv' | 'sedan'; status?: 'published' | 'draft'; seats?: number } = {},
  ) =>
    (
      await prisma.vehicleVariant.create({
        data: {
          modelYearId: y2025.id,
          slug,
          nameEn,
          nameAr: `${nameEn} (اختبار)`,
          powertrainType,
          bodyType: extra.bodyType ?? 'suv',
          driveType: 'rwd',
          seats: extra.seats ?? 5,
          doors: 5,
          status: extra.status ?? 'published',
          publishedAt: new Date('2025-01-01T00:00:00Z'),
          isDemo: true,
        },
      })
    ).id;

  const a = await variant('e2e-volt-one-a', 'A Long Range', 'BEV');
  const b = await variant('e2e-volt-one-b', 'B Standard', 'BEV');
  const c = await variant('e2e-volt-one-c', 'C China', 'BEV');
  const d = await variant('e2e-volt-one-d', 'D Hybrid', 'PHEV');
  const e = await variant('e2e-volt-one-e', 'E Sedan', 'BEV', { bodyType: 'sedan' });
  const draft = await variant('e2e-volt-one-draft', 'Draft', 'BEV', { status: 'draft' });

  for (const id of [a, b, c, d, e, draft]) {
    await prisma.variantMarket.create({
      data: { variantId: id, marketCode: 'EG', availability: 'available', notes: NOTE },
    });
  }
  await prisma.variantMarket.create({
    data: { variantId: a, marketCode: 'SA', availability: 'available', notes: NOTE },
  });

  const meta = { sourceId: source.id, reliability: 'manufacturer_claim' as const };
  const price = (variantId: string, marketCode: string, amount: string, currencyCode: string) =>
    prisma.priceHistory.create({
      data: {
        variantId,
        marketCode,
        amount,
        currencyCode,
        priceType: 'official_msrp',
        effectiveFrom: new Date('2025-01-01'),
        isDemo: true,
        notes: NOTE,
        ...meta,
      },
    });
  await price(a, 'EG', '1500000', 'EGP');
  await price(a, 'SA', '150000', 'SAR');
  await price(b, 'EG', '1200000', 'EGP');
  await price(c, 'EG', '1300000', 'EGP');
  await price(d, 'EG', '1100000', 'EGP');

  await prisma.rangeMeasurement.createMany({
    data: [
      { variantId: a, cycle: 'WLTP', rangeType: 'electric', valueKm: '520', ...meta },
      {
        variantId: b,
        cycle: 'WLTP',
        rangeType: 'electric',
        valueKm: '399.9',
        originalValue: '248.5',
        originalUnit: 'mi',
        ...meta,
      },
      { variantId: c, cycle: 'CLTC', rangeType: 'electric', valueKm: '600', ...meta },
      { variantId: d, cycle: 'WLTP', rangeType: 'electric', valueKm: '90', ...meta },
      { variantId: d, cycle: 'WLTP', rangeType: 'total', valueKm: '900', ...meta },
      { variantId: e, cycle: 'WLTP', rangeType: 'electric', valueKm: '450', ...meta },
    ],
  });
  await prisma.consumptionMeasurement.createMany({
    data: [
      { variantId: a, cycle: 'WLTP', kind: 'electricity', mode: 'combined', value: '150', ...meta },
      { variantId: b, cycle: 'WLTP', kind: 'electricity', mode: 'combined', value: '170', ...meta },
      { variantId: c, cycle: 'CLTC', kind: 'electricity', mode: 'combined', value: '140', ...meta },
      { variantId: d, cycle: 'WLTP', kind: 'electricity', mode: 'weighted', value: '180', ...meta },
      { variantId: d, cycle: 'WLTP', kind: 'fuel', mode: 'weighted', value: '1.5', ...meta },
    ],
  });
  await prisma.chargingTimeMeasurement.createMany({
    data: [
      {
        variantId: a,
        currentType: 'DC',
        fromSoc: '10',
        toSoc: '80',
        durationMinutes: '28',
        chargerPowerKw: '350',
        averagePowerKw: '110',
        ...meta,
      },
      {
        variantId: b,
        currentType: 'DC',
        fromSoc: '10',
        toSoc: '80',
        durationMinutes: '35',
        chargerPowerKw: '350',
        averagePowerKw: '70',
        ...meta,
      },
      {
        variantId: c,
        currentType: 'DC',
        fromSoc: '30',
        toSoc: '80',
        durationMinutes: '20',
        chargerPowerKw: '350',
        ...meta,
      },
    ],
  });

  const spec = (variantId: string, specKey: string, valueNum: string, unit: string | null) => ({
    variantId,
    specKey,
    valueNum,
    unit,
    ...meta,
  });
  await prisma.vehicleSpecification.createMany({
    data: [
      spec(a, 'battery.usable_kwh', '75', 'kWh'),
      spec(a, 'charging.dc_peak_kw', '200', 'kW'),
      spec(a, 'charging.ac_max_kw', '11', 'kW'),
      spec(a, 'practicality.trunk_l', '500', 'l'),
      spec(a, 'performance.accel_0_100_s', '6', 's'),
      spec(b, 'battery.usable_kwh', '60', 'kWh'),
      spec(b, 'charging.dc_peak_kw', '120', 'kW'),
      spec(b, 'charging.ac_max_kw', '11', 'kW'),
      spec(b, 'practicality.trunk_l', '420', 'l'),
      spec(b, 'performance.accel_0_100_s', '7.5', 's'),
      spec(c, 'battery.usable_kwh', '70', 'kWh'),
      spec(c, 'charging.dc_peak_kw', '150', 'kW'),
      spec(c, 'charging.ac_max_kw', '7', 'kW'),
      spec(c, 'practicality.trunk_l', '450', 'l'),
      spec(c, 'performance.accel_0_100_s', '6.5', 's'),
      spec(d, 'battery.usable_kwh', '18', 'kWh'),
      spec(d, 'charging.ac_max_kw', '6.6', 'kW'),
      spec(d, 'practicality.trunk_l', '380', 'l'),
      spec(d, 'performance.accel_0_100_s', '8', 's'),
    ],
  });

  // Inlets per market (structured): D has an AC inlet only → no DC fast charging.
  const vmD = await prisma.variantMarket.findUniqueOrThrow({
    where: { variantId_marketCode: { variantId: d, marketCode: 'EG' } },
  });
  await prisma.variantMarketInlet.create({
    data: {
      variantMarketId: vmD.id,
      connectorTypeCode: 'type2',
      currentType: 'AC',
      maxPowerKw: '6.6',
      ...meta,
    },
  });
  const vmA = await prisma.variantMarket.findUniqueOrThrow({
    where: { variantId_marketCode: { variantId: a, marketCode: 'EG' } },
  });
  await prisma.variantMarketInlet.createMany({
    data: [
      {
        variantMarketId: vmA.id,
        connectorTypeCode: 'ccs2',
        currentType: 'DC',
        maxPowerKw: '200',
        ...meta,
      },
      {
        variantMarketId: vmA.id,
        connectorTypeCode: 'type2',
        currentType: 'AC',
        maxPowerKw: '11',
        ...meta,
      },
    ],
  });

  return {
    sourceId: source.id,
    brandId: brand.id,
    modelId: model.id,
    modelYear2025: y2025.id,
    modelYear2026: y2026.id,
    a,
    b,
    c,
    d,
    e,
    draft,
  };
}

/** Item body for (variant, market) in model year 2025. */
export const item = (variantId: string, market = 'EG', modelYear = 2025) => ({
  variantId,
  modelYear,
  market,
});
