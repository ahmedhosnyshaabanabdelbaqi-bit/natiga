import {
  connectorAvailability,
  countAvailability,
  stationStatusOf,
  toPublicStatus,
} from './availability';
import { connectorCompatibility, inletPairs, usableInlets } from './compatibility';
import { dedupeVerdict, orderedPair } from './dedupe';
import { tariffElementProblems } from '../services/station-tariffs.service';
import { accessNotesOf, licenceUrlOf, ocmSourceUrl } from '../services/station-sync.service';
import type { ExternalStationRecord } from '../../../providers/stations/station-source.types';

describe('live availability (expired → unknown, never available by default)', () => {
  const now = new Date('2026-09-25T12:00:00Z');
  const obs = (status: 'available' | 'charging' | 'inoperative', minutesLeft: number) => ({
    provider: 'partner:test',
    status,
    observedAt: new Date(now.getTime() - 60_000),
    expiresAt: new Date(now.getTime() + minutesLeft * 60_000),
  });

  it('no observation → unknown with freshness none', () => {
    expect(connectorAvailability(null, now)).toMatchObject({
      status: 'unknown',
      freshness: 'none',
      source: null,
    });
  });

  it('a live observation is shown with its source and dates', () => {
    expect(connectorAvailability(obs('available', 5), now)).toMatchObject({
      status: 'available',
      providerStatus: 'available',
      freshness: 'live',
      source: 'partner:test',
    });
  });

  it('an expired "available" observation is unknown (uncertain), not available', () => {
    const v = connectorAvailability(obs('available', -1), now);
    expect(v).toMatchObject({
      status: 'unknown',
      providerStatus: 'available',
      freshness: 'expired',
    });
  });

  it('maps the provider vocabulary', () => {
    expect(toPublicStatus('charging')).toBe('occupied');
    expect(toPublicStatus('reserved')).toBe('occupied');
    expect(toPublicStatus('inoperative')).toBe('out_of_order');
    expect(toPublicStatus('unknown')).toBe('unknown');
  });

  it('station status: available wins; unknown connectors keep the station unknown', () => {
    const live = [obs('charging', 5), obs('inoperative', 5)].map((o) =>
      connectorAvailability(o, now),
    );
    expect(stationStatusOf(countAvailability(live))).toBe('occupied');
    const mixed = [...live, connectorAvailability(null, now)];
    expect(stationStatusOf(countAvailability(mixed))).toBe('unknown');
    const withFree = [...mixed, connectorAvailability(obs('available', 5), now)];
    expect(stationStatusOf(countAvailability(withFree))).toBe('available');
    expect(stationStatusOf(countAvailability([]))).toBe('unknown');
  });
});

describe('vehicle compatibility (verified inlets, same plug AND current, no adapters)', () => {
  const inlets = [
    {
      connectorTypeCode: 'ccs2',
      currentType: 'DC' as const,
      maxPowerKw: 150,
      reliability: 'verified',
    },
    {
      connectorTypeCode: 'type2',
      currentType: 'AC' as const,
      maxPowerKw: 11,
      reliability: 'manufacturer_claim',
    },
    {
      connectorTypeCode: 'chademo',
      currentType: 'DC' as const,
      maxPowerKw: 50,
      reliability: 'unverified',
    },
    {
      connectorTypeCode: 'gbt_dc',
      currentType: 'DC' as const,
      maxPowerKw: null,
      reliability: 'estimated',
    },
  ];

  it('ignores unverified / estimated / disputed inlets', () => {
    expect(usableInlets(inlets).map((i) => i.connectorTypeCode)).toEqual(['ccs2', 'type2']);
    expect(inletPairs(inlets)).toEqual([
      { code: 'ccs2', current: 'DC' },
      { code: 'type2', current: 'AC' },
    ]);
  });

  it('matches type AND current; usable power = min(connector, inlet)', () => {
    expect(
      connectorCompatibility(
        { connectorTypeCode: 'ccs2', currentType: 'DC', maxPowerKw: 60 },
        inlets,
      ),
    ).toEqual({ compatible: true, maxUsablePowerKw: 60 });
    expect(
      connectorCompatibility(
        { connectorTypeCode: 'type2', currentType: 'AC', maxPowerKw: 22 },
        inlets,
      ),
    ).toEqual({ compatible: true, maxUsablePowerKw: 11 });
    // Unknown power stays unknown (never 0).
    expect(
      connectorCompatibility(
        { connectorTypeCode: 'ccs2', currentType: 'DC', maxPowerKw: null },
        inlets,
      ),
    ).toEqual({ compatible: true, maxUsablePowerKw: null });
  });

  it('never infers compatibility from a similar plug or an unverified inlet', () => {
    // Type 2 plug but DC current: not the same inlet.
    expect(
      connectorCompatibility(
        { connectorTypeCode: 'type2', currentType: 'DC', maxPowerKw: 22 },
        inlets,
      ).compatible,
    ).toBe(false);
    // CHAdeMO inlet exists but is unverified → no.
    expect(
      connectorCompatibility(
        { connectorTypeCode: 'chademo', currentType: 'DC', maxPowerKw: 50 },
        inlets,
      ).compatible,
    ).toBe(false);
    // CCS1 is not CCS2 (no adapter assumed).
    expect(
      connectorCompatibility(
        { connectorTypeCode: 'ccs1', currentType: 'DC', maxPowerKw: 50 },
        inlets,
      ).compatible,
    ).toBe(false);
  });
});

describe('dedupe heuristics', () => {
  it.each([
    [{ distanceM: 20, nameSimilarity: 0, sameOperator: false }, true],
    [{ distanceM: 50, nameSimilarity: null, sameOperator: false }, true],
    [{ distanceM: 120, nameSimilarity: 0.55, sameOperator: false }, true],
    [{ distanceM: 120, nameSimilarity: 0.1, sameOperator: true }, true],
    [{ distanceM: 120, nameSimilarity: 0.1, sameOperator: false }, false],
    [{ distanceM: 400, nameSimilarity: 1, sameOperator: true }, false],
  ])('%j → candidate %s', (evidence, expected) => {
    expect(dedupeVerdict(evidence).candidate).toBe(expected);
  });

  it('orders pairs like the database CHECK (station_id < other_station_id)', () => {
    const a = '01900000-0000-7000-8000-000000000001';
    const b = '01900000-0000-7000-8000-00000000000a';
    expect(orderedPair(b, a)).toEqual([a, b]);
    expect(orderedPair(a, b)).toEqual([a, b]);
  });
});

describe('tariff components and units', () => {
  it('accepts the unit of each component and rejects mismatches', () => {
    expect(
      tariffElementProblems([
        { componentType: 'energy', price: '5', priceUnit: 'per_kwh' },
        { componentType: 'flat', price: '10', priceUnit: 'per_session' },
        { componentType: 'idle', price: '2', priceUnit: 'per_minute' },
        { componentType: 'parking_time', price: '20', priceUnit: 'per_hour' },
      ]),
    ).toEqual([]);
    const problems = tariffElementProblems([
      { componentType: 'energy', price: '5', priceUnit: 'per_minute' },
      {
        componentType: 'time',
        price: '1',
        priceUnit: 'per_session',
        minPowerKw: 50,
        maxPowerKw: 22,
      },
    ]);
    expect(problems.map((p) => p.field)).toEqual([
      'elements[0].priceUnit',
      'elements[1].priceUnit',
      'elements[1].minPowerKw',
    ]);
  });
});

describe('source provenance helpers', () => {
  it('licence URLs of known open licences only', () => {
    expect(
      licenceUrlOf('Licensed under Creative Commons Attribution 4.0 International (CC BY 4.0)'),
    ).toBe('https://creativecommons.org/licenses/by/4.0/');
    expect(licenceUrlOf('ODbL 1.0')).toBe('https://opendatacommons.org/licenses/odbl/1-0/');
    expect(licenceUrlOf('All rights reserved')).toBeNull();
    expect(licenceUrlOf(null)).toBeNull();
  });

  it('OCM record page URL', () => {
    expect(ocmSourceUrl('900001')).toBe('https://openchargemap.org/site/poi/details/900001');
    expect(ocmSourceUrl('conn:1')).toBeNull();
  });

  it('access notes come from the usage flags only when they are true', () => {
    const rec = {
      usageFlags: { membershipRequired: true, accessKeyRequired: null, payAtLocation: true },
    } as unknown as ExternalStationRecord;
    expect(accessNotesOf(rec)).toBe('Membership required.');
    expect(
      accessNotesOf({
        usageFlags: { membershipRequired: null, accessKeyRequired: null, payAtLocation: null },
      } as unknown as ExternalStationRecord),
    ).toBeNull();
  });
});
