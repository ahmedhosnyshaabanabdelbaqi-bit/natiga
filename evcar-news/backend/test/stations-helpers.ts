/**
 * Helpers of the stations-* e2e specs. Every station, operator and car
 * created here is SYNTHETIC test data (names start with "Test"), lives only
 * in the per-run test database and is never seeded anywhere else.
 */
import { randomBytes } from 'node:crypto';
import type { Prisma } from '../src/generated/prisma/client';
import type { TestApp } from './utils/test-app';

let seq = 0;
export function uniq(prefix: string): string {
  seq += 1;
  return `${prefix} ${randomBytes(3).toString('hex')} ${seq}`;
}

export interface ConnectorSpec {
  type: string;
  current: 'AC' | 'DC';
  kw?: number | null;
  quantity?: number;
  pointIndex?: number | null;
}

export interface StationSpec {
  name?: string;
  lat: number;
  lng: number;
  countryCode?: string;
  marketCode?: string | null;
  timezone?: string;
  publicationStatus?: 'draft' | 'pending_review' | 'published' | 'hidden' | 'rejected';
  operationalStatus?:
    'operational' | 'planned' | 'temporarily_unavailable' | 'permanently_closed' | 'unknown';
  accessType?: 'public' | 'customers_only' | 'restricted' | 'private' | 'unknown';
  operatorId?: string | null;
  openingHours?: Prisma.InputJsonObject | null;
  isAlwaysOpen?: boolean | null;
  amenities?: string[];
  points?: number;
  connectors?: ConnectorSpec[];
  slug?: string;
  dataSource?: 'manual' | 'ocm' | 'csv' | 'partner' | 'user_suggestion';
}

/** Creates a station (+ charge points + connectors) directly in the database. */
export async function createStation(
  t: TestApp,
  spec: StationSpec,
): Promise<{ id: string; pointIds: string[]; connectorIds: string[] }> {
  const s = await t.prisma.chargingStation.create({
    data: {
      name: spec.name ?? uniq('Test Station'),
      slug: spec.slug ?? null,
      latitude: spec.lat,
      longitude: spec.lng,
      countryCode: spec.countryCode ?? 'EG',
      marketCode: spec.marketCode === undefined ? 'EG' : spec.marketCode,
      timezone: spec.timezone ?? 'Africa/Cairo',
      publicationStatus: spec.publicationStatus ?? 'published',
      operationalStatus: spec.operationalStatus ?? 'operational',
      accessType: spec.accessType ?? 'public',
      operatorId: spec.operatorId ?? null,
      openingHours: spec.openingHours ?? undefined,
      isAlwaysOpen: spec.isAlwaysOpen === undefined ? true : spec.isAlwaysOpen,
      amenities: spec.amenities ?? [],
      dataSource: spec.dataSource ?? 'manual',
      attribution: 'Synthetic e2e test data',
    },
  });
  const pointIds: string[] = [];
  for (let i = 0; i < (spec.points ?? 0); i++) {
    const p = await t.prisma.chargingPoint.create({
      data: { stationId: s.id, label: `P${i + 1}`, operationalStatus: 'operational' },
    });
    pointIds.push(p.id);
  }
  const connectorIds: string[] = [];
  for (const c of spec.connectors ?? [{ type: 'type2', current: 'AC', kw: 22 }]) {
    const pointId =
      c.pointIndex !== undefined && c.pointIndex !== null ? pointIds[c.pointIndex] : null;
    const row = await t.prisma.connector.create({
      data: {
        stationId: s.id,
        chargingPointId: pointId,
        connectorTypeCode: c.type,
        currentType: c.current,
        maxPowerKw: c.kw === undefined ? 22 : c.kw,
        quantity: c.quantity ?? 1,
        operationalStatus: 'operational',
      },
    });
    connectorIds.push(row.id);
  }
  return { id: s.id, pointIds, connectorIds };
}

/**
 * A published synthetic BEV trim listed in `market` with the given charging
 * inlets (reliability per inlet). Returns the variant id.
 */
export async function createVariantWithInlets(
  t: TestApp,
  market: string,
  inlets: {
    type: string;
    current: 'AC' | 'DC';
    kw: number | null;
    reliability: 'verified' | 'manufacturer_claim' | 'estimated' | 'unverified' | 'disputed';
  }[],
  opts: { inMarket?: boolean } = {},
): Promise<string> {
  const tag = randomBytes(4).toString('hex');
  const brand = await t.prisma.brand.create({
    data: {
      slug: `test-brand-${tag}`,
      nameEn: `Test Brand ${tag}`,
      nameAr: `ماركة اختبار ${tag}`,
      status: 'published',
    },
  });
  const model = await t.prisma.carModel.create({
    data: {
      brandId: brand.id,
      slug: `test-model-${tag}`,
      nameEn: `Test Model ${tag}`,
      nameAr: `موديل اختبار ${tag}`,
      status: 'published',
    },
  });
  const generation = await t.prisma.generation.create({
    data: { modelId: model.id, slug: 'gen-1', nameEn: 'Gen 1', nameAr: 'الجيل 1' },
  });
  const year = await t.prisma.modelYear.create({
    data: { generationId: generation.id, year: 2026 },
  });
  const variant = await t.prisma.vehicleVariant.create({
    data: {
      modelYearId: year.id,
      slug: `test-variant-${tag}`,
      nameEn: 'Test Trim',
      nameAr: 'فئة اختبار',
      powertrainType: 'BEV',
      status: 'published',
    },
  });
  if (opts.inMarket === false) return variant.id;
  const vm = await t.prisma.variantMarket.create({
    data: { variantId: variant.id, marketCode: market, availability: 'available' },
  });
  for (const i of inlets) {
    await t.prisma.variantMarketInlet.create({
      data: {
        variantMarketId: vm.id,
        connectorTypeCode: i.type,
        currentType: i.current,
        maxPowerKw: i.kw,
        reliability: i.reliability,
      },
    });
  }
  return variant.id;
}

export interface ListBody {
  data: {
    id: string;
    name: string;
    distanceM: number | null;
    openNow: string;
    maxPowerKw: number | null;
    availability: { status: string; availableConnectors: number | null; liveConnectors: number };
    compatibility: { compatibleConnectors: number; maxUsablePowerKw: number | null } | null;
    [k: string]: unknown;
  }[];
  meta: {
    nextCursor: string | null;
    total: number;
    truncated: boolean;
    compatibility: Record<string, unknown> | null;
    [k: string]: unknown;
  };
}

/** Ids of a list response. */
export const idsOf = (body: ListBody): string[] => body.data.map((s) => s.id);
