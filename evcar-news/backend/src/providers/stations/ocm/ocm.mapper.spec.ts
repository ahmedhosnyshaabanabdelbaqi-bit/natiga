import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConnectorTypeIndex } from '../connector-type-index';
import type { ExternalStationRecord } from '../station-source.types';
import { canonicalJson, licenceOf, mapOcmAccess, mapOcmPoi, mapOcmStatus } from './ocm.mapper';

/** Hand-written synthetic records (see the _comment fields) — not real OCM data. */
const fixture = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__', 'ocm-poi.synthetic.json'), 'utf8'),
) as unknown[];

const types = ConnectorTypeIndex.default();

function mapped(index: number, openDataOnly = true): ExternalStationRecord {
  const result = mapOcmPoi(fixture[index], { connectorTypes: types, openDataOnly });
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result.record;
}

describe('Open Charge Map mapping (synthetic fixture)', () => {
  it('maps station, operator, address, access and provenance fields', () => {
    const s = mapped(0);
    expect(s).toMatchObject({
      provider: 'ocm',
      externalId: '900001',
      externalUuid: '00000000-0000-4000-8000-000000900001',
      name: 'Synthetic Fixture Station A (not a real place)',
      latitude: 29.5,
      longitude: 30.5,
      addressLine: '1 Example Street, Fixture Mall, level -1',
      city: 'Fixture City',
      region: 'Fixture Governorate',
      postalCode: '00000',
      countryCode: 'EG',
      timezone: null,
      accessEntranceNote: 'Fixture: entrance from the north gate',
      accessType: 'public',
      usageFlags: { membershipRequired: true, accessKeyRequired: true, payAtLocation: false },
      usageCostText: 'FIXTURE: cost text is free text, never a tariff',
      websiteUrl: 'https://example.invalid/station-a',
      openingHours: null,
      isAlwaysOpen: null,
      numberOfPoints: 2,
      removedAtSource: null,
      lastVerifiedAt: '2026-01-15T10:00:00.000Z',
      sourceUpdatedAt: '2026-02-01T08:30:00.000Z',
      sourceCreatedAt: '2025-06-01T00:00:00.000Z',
    });
    expect(s.operator).toEqual({
      externalId: 'operator:990001',
      name: 'Synthetic Operator Ltd (fixture)',
      websiteUrl: 'https://www.example.invalid/',
      phone: '+00 0000 0000',
      email: 'ops@example.invalid',
    });
  });

  it('keeps the data-provider licence and attribution on every record', () => {
    const s = mapped(0);
    expect(s.licence).toEqual({
      providerName: 'Open Charge Map Contributors',
      providerUrl: 'https://openchargemap.org/',
      licence: 'Licensed under Creative Commons Attribution 4.0 International (CC BY 4.0)',
      isOpenData: true,
      attribution: expect.stringContaining('Open Charge Map') as string,
    });
    const c = mapped(2);
    expect(c.licence.providerName).toBe('Synthetic Open Registry (fixture)');
    expect(c.licence.attribution).toBe(
      'Synthetic Open Registry (fixture) — CC BY 4.0 (fixture) via Open Charge Map (openchargemap.org)',
    );
  });

  it('treats "currently available" as operational status only, never live availability', () => {
    const s = mapped(0);
    expect(s.operationalStatus).toBe('operational');
    expect(JSON.stringify(s)).not.toMatch(/"available"/);
  });

  it('maps connectors with type, current, phases, format, power and quantity', () => {
    const [ccs, type2, unknown] = mapped(0).connectors;
    expect(ccs).toEqual({
      externalId: 'conn:800001',
      connectorTypeCode: 'ccs2',
      originalTypeId: 33,
      originalTypeName: 'CCS (Type 2)',
      currentType: 'DC',
      phases: null,
      format: null,
      maxPowerKw: 60,
      maxVoltage: 500,
      maxAmperage: 200,
      quantity: 2,
      operationalStatus: 'operational',
    });
    expect(type2).toMatchObject({
      connectorTypeCode: 'type2',
      currentType: 'AC',
      phases: 3,
      format: 'socket',
      maxPowerKw: 22,
      operationalStatus: 'temporarily_unavailable',
    });
    // Unknown plug: no guessing, and a missing power stays null (never 0).
    expect(unknown).toMatchObject({
      connectorTypeCode: null,
      originalTypeName: 'Fixture Unknown Plug',
      currentType: null,
      maxPowerKw: null,
      operationalStatus: 'unknown',
    });
    expect(mapped(0).warnings).toEqual(
      expect.arrayContaining([
        'unknown_connector_type:Fixture Unknown Plug',
        'unknown_current_type:conn:800003',
        'missing_power:conn:800003',
      ]),
    );
  });

  it('infers the current type from an AC-only or DC-only standard', () => {
    const c = mapped(2);
    expect(c.connectors[0]).toMatchObject({ connectorTypeCode: 'chademo', currentType: 'DC' });
  });

  it('marks decommissioned records and hides the unknown operator', () => {
    const c = mapped(2);
    expect(c.operationalStatus).toBe('permanently_closed');
    expect(c.removedAtSource).toBe('decommissioned');
    expect(c.operator).toBeNull();
    expect(c.accessType).toBe('customers_only');
    expect(c.countryCode).toBe('SA');
  });

  it('skips records whose data provider is not open-data licensed (unless asked)', () => {
    expect(mapOcmPoi(fixture[1], { connectorTypes: types })).toEqual({
      ok: false,
      externalId: '900002',
      reason: 'licence_not_open_data',
    });
    const b = mapped(1, false);
    expect(b.licence.isOpenData).toBe(false);
    expect(b.warnings).toContain('no_connectors');
  });

  it('skips records without usable coordinates or ids', () => {
    expect(mapOcmPoi(fixture[3], { connectorTypes: types })).toEqual({
      ok: false,
      externalId: '900004',
      reason: 'invalid_coordinates',
    });
    expect(mapOcmPoi({}, { connectorTypes: types })).toMatchObject({
      ok: false,
      reason: 'missing_id',
    });
    expect(mapOcmPoi(null, { connectorTypes: types })).toMatchObject({ ok: false });
  });

  it('produces a stable payload hash independent of key order', () => {
    const a = { ID: 1, B: { y: 1, x: 2 } };
    const b = { B: { x: 2, y: 1 }, ID: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(mapped(0).payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(mapped(0).payloadHash).toBe(mapped(0).payloadHash);
  });

  it('maps every OCM status type', () => {
    expect(mapOcmStatus(0).status).toBe('unknown');
    expect(mapOcmStatus(20).status).toBe('operational');
    expect(mapOcmStatus(30).status).toBe('temporarily_unavailable');
    expect(mapOcmStatus(75).status).toBe('operational');
    expect(mapOcmStatus(150).status).toBe('planned');
    expect(mapOcmStatus(210)).toEqual({ status: 'permanently_closed', removed: 'duplicate' });
    expect(mapOcmStatus(undefined, { IsOperational: false }).status).toBe(
      'temporarily_unavailable',
    );
    expect(mapOcmStatus(undefined).status).toBe('unknown');
  });

  it('maps usage types to access types', () => {
    expect(mapOcmAccess({ Title: 'Public - Pay At Location' })).toBe('public');
    expect(mapOcmAccess({ Title: 'Private - Restricted Access' })).toBe('restricted');
    expect(mapOcmAccess({ Title: 'Privately Owned - Notice Required' })).toBe('restricted');
    expect(mapOcmAccess({ Title: 'Private' })).toBe('private');
    expect(mapOcmAccess(null)).toBe('unknown');
  });

  it('defaults the licence of user-contributed data to CC BY 4.0', () => {
    expect(licenceOf(undefined)).toMatchObject({ licence: 'CC BY 4.0', isOpenData: true });
  });
});
