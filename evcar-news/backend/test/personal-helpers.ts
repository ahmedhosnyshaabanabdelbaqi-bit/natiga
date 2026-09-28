/**
 * Helpers of the personal-* e2e specs (garage, charging logs, reminders,
 * calculators, notifications, trips). Synthetic test data only.
 */
import { createVariantWithInlets } from './stations-helpers';
import type { TestApp } from './utils/test-app';

export interface TestCarSpecs {
  usableKwh?: number;
  acMaxKw?: number;
  dcPeakKw?: number;
  /** Wh/km, WLTP combined. */
  consumptionWhKm?: number;
  curve?: [number, number][];
  inlets?: { type: string; current: 'AC' | 'DC'; kw: number | null }[];
}

/** A published synthetic BEV trim in `market` with optional catalog values. Returns the variant id. */
export async function createTestCar(
  t: TestApp,
  market = 'EG',
  specs: TestCarSpecs = {},
): Promise<string> {
  const variantId = await createVariantWithInlets(
    t,
    market,
    (
      specs.inlets ?? [
        { type: 'type2', current: 'AC', kw: 11 },
        { type: 'ccs2', current: 'DC', kw: 150 },
      ]
    ).map((i) => ({ ...i, reliability: 'verified' as const })),
  );
  const source = await t.prisma.specificationSource.create({
    data: { type: 'manufacturer', title: 'Test source (synthetic)' },
  });
  const spec = (specKey: string, valueNum: number) =>
    t.prisma.vehicleSpecification.create({
      data: { variantId, specKey, valueNum, reliability: 'verified', sourceId: source.id },
    });
  if (specs.usableKwh !== undefined) await spec('battery.usable_kwh', specs.usableKwh);
  if (specs.acMaxKw !== undefined) await spec('charging.ac_max_kw', specs.acMaxKw);
  if (specs.dcPeakKw !== undefined) await spec('charging.dc_peak_kw', specs.dcPeakKw);
  if (specs.consumptionWhKm !== undefined) {
    await t.prisma.consumptionMeasurement.create({
      data: {
        variantId,
        cycle: 'WLTP',
        kind: 'electricity',
        mode: 'combined',
        value: specs.consumptionWhKm,
        reliability: 'manufacturer_claim',
        sourceId: source.id,
      },
    });
  }
  if (specs.curve) {
    await t.prisma.chargingCurve.create({
      data: {
        variantId,
        currentType: 'DC',
        reliability: 'verified',
        sourceId: source.id,
        points: { create: specs.curve.map(([socPercent, powerKw]) => ({ socPercent, powerKw })) },
      },
    });
  }
  return variantId;
}
