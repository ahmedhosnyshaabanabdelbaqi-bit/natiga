import type { PrismaClient } from '../../generated/prisma/client';

/**
 * Demo seed — ONLY clearly labelled FICTIONAL sample data for local/demo
 * environments (never production). Every row has isDemo = true where the
 * table supports it, names carry "Demo"/"تجريبي", and no real brand, real
 * news, real price or real address is used. Stable ids make it idempotent.
 */
export const DEMO_IDS = {
  source: 'd0000000-0000-4000-8000-000000000001',
  brand: 'd0000000-0000-4000-8000-000000000010',
  model: 'd0000000-0000-4000-8000-000000000011',
  generation: 'd0000000-0000-4000-8000-000000000012',
  modelYear: 'd0000000-0000-4000-8000-000000000013',
  variantBev: 'd0000000-0000-4000-8000-000000000014',
  variantPhev: 'd0000000-0000-4000-8000-000000000015',
  curve: 'd0000000-0000-4000-8000-000000000016',
  category: 'd0000000-0000-4000-8000-000000000020',
  article: 'd0000000-0000-4000-8000-000000000021',
  tag: 'd0000000-0000-4000-8000-000000000022',
  comparison: 'd0000000-0000-4000-8000-000000000040',
  operator: 'd0000000-0000-4000-8000-000000000030',
  station: 'd0000000-0000-4000-8000-000000000031',
  point: 'd0000000-0000-4000-8000-000000000032',
  connectorDc: 'd0000000-0000-4000-8000-000000000033',
  connectorAc: 'd0000000-0000-4000-8000-000000000034',
  tariff: 'd0000000-0000-4000-8000-000000000035',
} as const;

const DEMO_NOTE = 'FICTIONAL demo data for testing layouts — not a real product, price or place.';

/**
 * Demo station position: open water in the Mediterranean, far from any
 * address, so a demo marker can never be mistaken for a real place.
 */
export const DEMO_STATION_LOCATION = { latitude: 32.5, longitude: 30.5 } as const;

export interface DemoSeedSummary {
  variants: number;
  articles: number;
  comparisons: number;
  stations: number;
}

export async function runDemoSeed(prisma: PrismaClient): Promise<DemoSeedSummary> {
  const market = await prisma.market.findUnique({ where: { code: 'EG' } });
  if (!market) throw new Error('Run the reference seed (npm run db:seed) before the demo seed.');

  await prisma.$transaction(
    async (tx) => {
      const I = DEMO_IDS;
      await tx.specificationSource.upsert({
        where: { id: I.source },
        create: {
          id: I.source,
          type: 'other',
          title: 'Demo data (fictional)',
          notes: DEMO_NOTE,
          isDemo: true,
        },
        update: {},
      });

      // --- vehicle hierarchy -------------------------------------------------
      await tx.brand.upsert({
        where: { id: I.brand },
        create: {
          id: I.brand,
          slug: 'demo-motors',
          nameEn: 'Demo Motors',
          nameAr: 'ديمو موتورز (تجريبي)',
          descriptionEn: DEMO_NOTE,
          descriptionAr: 'بيانات تجريبية وهمية لاختبار الواجهات.',
          status: 'published',
          isDemo: true,
        },
        update: {},
      });
      await tx.carModel.upsert({
        where: { id: I.model },
        create: {
          id: I.model,
          brandId: I.brand,
          slug: 'demo-motors-ev-one',
          nameEn: 'Demo EV One',
          nameAr: 'ديمو EV ون (تجريبي)',
          bodyType: 'crossover',
          status: 'published',
          isDemo: true,
        },
        update: {},
      });
      await tx.generation.upsert({
        where: { id: I.generation },
        create: {
          id: I.generation,
          modelId: I.model,
          slug: 'gen-1',
          nameEn: 'First generation (demo)',
          nameAr: 'الجيل الأول (تجريبي)',
          startYear: 2025,
          isDemo: true,
        },
        update: {},
      });
      await tx.modelYear.upsert({
        where: { id: I.modelYear },
        create: { id: I.modelYear, generationId: I.generation, year: 2025, isDemo: true },
        update: {},
      });
      // Same trim name, two powertrains: they are separate variants and never share specs.
      for (const v of [
        { id: I.variantBev, slug: 'demo-ev-one-2025-standard-bev', powertrainType: 'BEV' as const },
        {
          id: I.variantPhev,
          slug: 'demo-ev-one-2025-standard-phev',
          powertrainType: 'PHEV' as const,
        },
      ]) {
        await tx.vehicleVariant.upsert({
          where: { id: v.id },
          create: {
            id: v.id,
            modelYearId: I.modelYear,
            slug: v.slug,
            nameEn: 'Standard (demo)',
            nameAr: 'ستاندرد (تجريبي)',
            powertrainType: v.powertrainType,
            bodyType: 'crossover',
            driveType: 'fwd',
            seats: 5,
            doors: 5,
            status: 'published',
            publishedAt: new Date('2025-01-01T00:00:00Z'),
            isDemo: true,
          },
          update: {},
        });
        await tx.variantMarket.upsert({
          where: { variantId_marketCode: { variantId: v.id, marketCode: 'EG' } },
          create: {
            variantId: v.id,
            marketCode: 'EG',
            availability: 'available',
            driveSide: 'lhd',
            notes: DEMO_NOTE,
          },
          update: {},
        });
      }

      const specs: {
        variantId: string;
        specKey: string;
        valueNum?: string;
        valueText?: string;
        valueBool?: boolean;
        unit?: string;
      }[] = [
        { variantId: I.variantBev, specKey: 'battery.gross_kwh', valueNum: '64', unit: 'kWh' },
        { variantId: I.variantBev, specKey: 'battery.usable_kwh', valueNum: '60', unit: 'kWh' },
        { variantId: I.variantBev, specKey: 'charging.ac_max_kw', valueNum: '11', unit: 'kW' },
        { variantId: I.variantBev, specKey: 'charging.dc_peak_kw', valueNum: '150', unit: 'kW' },
        { variantId: I.variantBev, specKey: 'performance.power_kw', valueNum: '150', unit: 'kW' },
        { variantId: I.variantBev, specKey: 'charging.v2l', valueBool: true },
        { variantId: I.variantPhev, specKey: 'battery.usable_kwh', valueNum: '18', unit: 'kWh' },
        { variantId: I.variantPhev, specKey: 'charging.ac_max_kw', valueNum: '6.6', unit: 'kW' },
      ];
      for (const s of specs) {
        // Global rows (market_code NULL); unique per variant × key via a partial index.
        const exists = await tx.vehicleSpecification.findFirst({
          where: { variantId: s.variantId, specKey: s.specKey, marketCode: null },
          select: { id: true },
        });
        if (!exists) {
          await tx.vehicleSpecification.create({
            data: { ...s, sourceId: I.source, reliability: 'unverified', notes: DEMO_NOTE },
          });
        }
      }

      // Consumption always with its test cycle; the PHEV value is the weighted one.
      if (
        (await tx.consumptionMeasurement.count({
          where: { variantId: { in: [I.variantBev, I.variantPhev] } },
        })) === 0
      ) {
        await tx.consumptionMeasurement.createMany({
          data: [
            {
              variantId: I.variantBev,
              cycle: 'WLTP',
              kind: 'electricity',
              mode: 'combined',
              value: '160',
              sourceId: I.source,
              reliability: 'unverified',
              conditions: DEMO_NOTE,
            },
            {
              variantId: I.variantPhev,
              cycle: 'WLTP',
              kind: 'fuel',
              mode: 'weighted',
              value: '1.5',
              sourceId: I.source,
              reliability: 'unverified',
              conditions: DEMO_NOTE,
            },
          ],
        });
      }

      // Charging inlets per market (structured, for station compatibility).
      const bevEg = await tx.variantMarket.findUniqueOrThrow({
        where: { variantId_marketCode: { variantId: I.variantBev, marketCode: 'EG' } },
        select: { id: true },
      });
      for (const inlet of [
        { connectorTypeCode: 'ccs2', currentType: 'DC' as const, maxPowerKw: '150' },
        { connectorTypeCode: 'type2', currentType: 'AC' as const, maxPowerKw: '11' },
      ]) {
        await tx.variantMarketInlet.upsert({
          where: {
            variantMarketId_connectorTypeCode_currentType: {
              variantMarketId: bevEg.id,
              connectorTypeCode: inlet.connectorTypeCode,
              currentType: inlet.currentType,
            },
          },
          create: {
            variantMarketId: bevEg.id,
            ...inlet,
            sourceId: I.source,
            reliability: 'unverified',
            notes: DEMO_NOTE,
          },
          update: {},
        });
      }

      // Ranges carry their cycle; PHEV has separate electric and total range.
      if (
        (await tx.rangeMeasurement.count({
          where: { variantId: { in: [I.variantBev, I.variantPhev] } },
        })) === 0
      ) {
        await tx.rangeMeasurement.createMany({
          data: [
            {
              variantId: I.variantBev,
              cycle: 'WLTP',
              rangeType: 'electric',
              valueKm: '420',
              sourceId: I.source,
              reliability: 'unverified',
            },
            {
              variantId: I.variantPhev,
              cycle: 'WLTP',
              rangeType: 'electric',
              valueKm: '90',
              sourceId: I.source,
              reliability: 'unverified',
            },
            {
              variantId: I.variantPhev,
              cycle: 'WLTP',
              rangeType: 'total',
              valueKm: '900',
              sourceId: I.source,
              reliability: 'unverified',
            },
          ],
        });
        await tx.chargingTimeMeasurement.create({
          data: {
            variantId: I.variantBev,
            currentType: 'DC',
            fromSoc: '10',
            toSoc: '80',
            durationMinutes: '30',
            chargerPowerKw: '150',
            peakPowerKw: '150',
            conditions: DEMO_NOTE,
            sourceId: I.source,
            reliability: 'unverified',
          },
        });
      }
      await tx.chargingCurve.upsert({
        where: { id: I.curve },
        create: {
          id: I.curve,
          variantId: I.variantBev,
          currentType: 'DC',
          label: 'Demo curve (fictional)',
          chargerMaxPowerKw: '150',
          sourceId: I.source,
          reliability: 'unverified',
          points: {
            create: [
              { socPercent: '10', powerKw: '140' },
              { socPercent: '30', powerKw: '150' },
              { socPercent: '50', powerKw: '120' },
              { socPercent: '80', powerKw: '60' },
              { socPercent: '100', powerKw: '10' },
            ],
          },
        },
        update: {},
      });
      if ((await tx.priceHistory.count({ where: { variantId: I.variantBev } })) === 0) {
        await tx.priceHistory.create({
          data: {
            variantId: I.variantBev,
            marketCode: 'EG',
            amount: '1500000',
            currencyCode: 'EGP',
            priceType: 'official_msrp',
            effectiveFrom: new Date('2025-01-01'),
            sourceId: I.source,
            reliability: 'unverified',
            notes: DEMO_NOTE,
            isDemo: true,
          },
        });
      }

      // --- content ---------------------------------------------------------------
      await tx.category.upsert({
        where: { id: I.category },
        create: {
          id: I.category,
          slug: 'demo',
          sortOrder: 999,
          isDemo: true,
          translations: {
            create: [
              { locale: 'ar', name: 'تجريبي' },
              { locale: 'en', name: 'Demo' },
            ],
          },
        },
        // Databases seeded before the flag existed.
        update: { isDemo: true },
      });
      await tx.tag.upsert({
        where: { id: I.tag },
        create: {
          id: I.tag,
          slug: 'demo-tag',
          isDemo: true,
          translations: {
            create: [
              { locale: 'ar', name: 'وسم تجريبي' },
              { locale: 'en', name: 'Demo tag' },
            ],
          },
        },
        update: { isDemo: true },
      });
      await tx.article.upsert({
        where: { id: I.article },
        create: {
          id: I.article,
          slug: 'demo-sample-article',
          type: 'news',
          status: 'published',
          categoryId: I.category,
          authorName: 'Demo',
          originalLanguage: 'ar',
          publishedAt: new Date('2025-01-01T00:00:00Z'),
          isDemo: true,
          translations: {
            create: [
              {
                locale: 'ar',
                title: '[تجريبي] مقال تجريبي لاختبار واجهة الأخبار',
                summary: 'هذا نص تجريبي وهمي لاختبار عرض الأخبار فقط، وليس خبرًا حقيقيًا.',
                bodyHtml:
                  '<p>هذا مقال تجريبي وهمي أُنشئ لاختبار التصميم والقراءة. لا يحتوي على معلومات حقيقية.</p>',
                bodyText:
                  'هذا مقال تجريبي وهمي أُنشئ لاختبار التصميم والقراءة. لا يحتوي على معلومات حقيقية.',
              },
              {
                locale: 'en',
                title: '[DEMO] Sample article for testing the news layout',
                summary: 'Fictional placeholder text for layout testing only. Not real news.',
                bodyHtml:
                  '<p>This is a fictional demo article created to test layout and reading. It contains no real information.</p>',
                bodyText:
                  'This is a fictional demo article created to test layout and reading. It contains no real information.',
              },
            ],
          },
          vehicleLinks: { create: [{ variantId: I.variantBev }] },
          tags: { create: [{ tagId: I.tag }] },
        },
        update: {},
      });

      // --- comparisons -------------------------------------------------------------
      // A curated comparison of the two fictional variants (same trim name,
      // different powertrains): exercises electric vs total range handling.
      await tx.comparison.upsert({
        where: { id: I.comparison },
        create: {
          id: I.comparison,
          shareId: 'demo-cmp-0001',
          titleAr: '[تجريبي] مقارنة تجريبية: كهربائية بالكامل أم هجينة قابلة للشحن',
          titleEn: '[DEMO] Demo comparison: BEV vs PHEV (fictional)',
          marketCode: 'EG',
          isCurated: true,
          curatedStatus: 'published',
          curatedOrder: 999,
          isDemo: true,
          items: {
            create: [
              { variantId: I.variantBev, marketCode: 'EG', position: 1 },
              { variantId: I.variantPhev, marketCode: 'EG', position: 2 },
            ],
          },
        },
        update: {},
      });

      // --- stations (no real address; clearly labelled) ------------------------------
      await tx.chargingOperator.upsert({
        where: { id: I.operator },
        create: {
          id: I.operator,
          name: 'Demo Charging Operator (fictional)',
          nameAr: 'مشغل شحن تجريبي (وهمي)',
          isDemo: true,
        },
        update: {},
      });
      await tx.chargingStation.upsert({
        where: { id: I.station },
        create: {
          id: I.station,
          slug: 'demo-charging-station',
          name: '[DEMO] Demo Charging Station (fictional)',
          nameAr: '[تجريبي] محطة شحن تجريبية (وهمية)',
          nameEn: '[DEMO] Demo Charging Station (fictional)',
          operatorId: I.operator,
          // Open sea ~150 km off the Egyptian coast (Mediterranean): visible when
          // testing the EG map, but never a real street address (§22).
          latitude: DEMO_STATION_LOCATION.latitude,
          longitude: DEMO_STATION_LOCATION.longitude,
          countryCode: 'EG',
          marketCode: 'EG',
          timezone: 'Africa/Cairo',
          isAlwaysOpen: true,
          accessType: 'public',
          operationalStatus: 'operational',
          publicationStatus: 'published',
          dataSource: 'manual',
          attribution: DEMO_NOTE,
          isDemo: true,
        },
        update: {},
      });
      await tx.chargingPoint.upsert({
        where: { id: I.point },
        create: {
          id: I.point,
          stationId: I.station,
          label: 'Demo EVSE 1',
          operationalStatus: 'operational',
        },
        update: {},
      });
      await tx.connector.upsert({
        where: { id: I.connectorDc },
        create: {
          id: I.connectorDc,
          stationId: I.station,
          chargingPointId: I.point,
          connectorTypeCode: 'ccs2',
          format: 'cable',
          currentType: 'DC',
          maxPowerKw: '150',
        },
        update: {},
      });
      await tx.connector.upsert({
        where: { id: I.connectorAc },
        create: {
          id: I.connectorAc,
          stationId: I.station,
          chargingPointId: I.point,
          connectorTypeCode: 'type2',
          format: 'socket',
          currentType: 'AC',
          maxPowerKw: '22',
          phases: 3,
        },
        update: {},
      });
      await tx.tariff.upsert({
        where: { id: I.tariff },
        create: {
          id: I.tariff,
          stationId: I.station,
          name: 'Demo tariff (fictional)',
          currencyCode: 'EGP',
          taxIncluded: null,
          sourceId: I.source,
          reliability: 'unverified',
          notes: DEMO_NOTE,
          isDemo: true,
          elements: {
            create: [
              { componentType: 'energy', price: '5', priceUnit: 'per_kwh', sortOrder: 1 },
              {
                componentType: 'idle',
                price: '2',
                priceUnit: 'per_minute',
                graceMinutes: 15,
                sortOrder: 2,
              },
            ],
          },
        },
        update: {},
      });
    },
    { timeout: 120_000, maxWait: 30_000 },
  );

  return {
    variants: await prisma.vehicleVariant.count({ where: { isDemo: true } }),
    articles: await prisma.article.count({ where: { isDemo: true } }),
    comparisons: await prisma.comparison.count({ where: { isDemo: true } }),
    stations: await prisma.chargingStation.count({ where: { isDemo: true } }),
  };
}
