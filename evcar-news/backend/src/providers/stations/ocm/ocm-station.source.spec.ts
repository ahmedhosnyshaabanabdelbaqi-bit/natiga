import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppConfig } from '../../../config/app-config';
import { AppException } from '../../../common/errors/app.exception';
import type { OutboundHttp, OutboundRequest, OutboundResponse } from '../../http/outbound-http';
import { ConnectorTypeIndex } from '../connector-type-index';
import { OcmStationSource } from './ocm-station.source';

const DB = 'postgresql://evcar:x@localhost:5432/unit';
const fixture = readFileSync(join(__dirname, '__fixtures__', 'ocm-poi.synthetic.json'));

function response(status: number, body: Buffer | string): OutboundResponse {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  return {
    status,
    headers: {},
    url: 'https://api.openchargemap.io/v3/poi/',
    body: buf,
    text: () => buf.toString(),
    json: <T>() => JSON.parse(buf.toString()) as T,
  };
}

function setup(env: Record<string, string>, reply = response(200, fixture)) {
  const calls: { url: string; req?: OutboundRequest }[] = [];
  const http = {
    fetch: jest.fn((url: string, req?: OutboundRequest) => {
      calls.push({ url, req });
      return Promise.resolve(reply);
    }),
    fetchOperatorEndpoint: jest.fn(),
  } as unknown as OutboundHttp;
  const config = AppConfig.fromEnv({ NODE_ENV: 'test', DATABASE_URL: DB, ...env });
  const source = new OcmStationSource(config, http, () =>
    Promise.resolve(ConnectorTypeIndex.default()),
  );
  return { source, http, calls };
}

describe('OcmStationSource', () => {
  it('is not configured without OCM_API_KEY and refuses to fetch (503)', async () => {
    const { source, http } = setup({});
    expect(source.status()).toMatchObject({
      configured: false,
      reason: 'OCM_API_KEY is not set.',
    });
    await expect(source.fetchPage({})).rejects.toMatchObject({
      code: 'INTEGRATION_NOT_CONFIGURED',
    });
    expect(http.fetch).not.toHaveBeenCalled();
    await expect(source.check()).resolves.toMatchObject({ ok: false, skipped: true });
  });

  it('fetches through the SSRF-safe client with the key in a header, never in the URL', async () => {
    const { source, calls, http } = setup({ OCM_API_KEY: 'unit-ocm-key-123' });
    const page = await source.fetchPage({ countryCode: 'eg', pageSize: 4 });
    expect(http.fetch).toHaveBeenCalledTimes(1);
    expect(http.fetchOperatorEndpoint).not.toHaveBeenCalled();
    // The key never follows a redirect (a 3xx is an upstream error).
    expect(calls[0].req?.followRedirects).toBe(false);
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe('https://api.openchargemap.io/v3/poi/');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      output: 'json',
      compact: 'false',
      verbose: 'false',
      includecomments: 'false',
      maxresults: '4',
      sortby: 'id_asc',
      countrycode: 'EG',
      opendata: 'true',
    });
    expect(calls[0].url).not.toContain('unit-ocm-key-123');
    expect(calls[0].req?.headers?.['X-API-Key']).toBe('unit-ocm-key-123');

    expect(page.received).toBe(4);
    expect(page.items.map((i) => i.externalId)).toEqual(['900001', '900003']);
    expect(page.skipped).toEqual([
      { externalId: '900002', reason: 'licence_not_open_data' },
      { externalId: '900004', reason: 'invalid_coordinates' },
    ]);
    // A full page → cursor = highest OCM id seen.
    expect(page.nextCursor).toBe('900004');
    expect(source.status()).toMatchObject({ configured: true });
    expect(source.status().lastSuccessAt).toBeDefined();
  });

  it('pages with greaterthanid, bounding box and modifiedsince', async () => {
    const { source, calls } = setup({ OCM_API_KEY: 'k' });
    const page = await source.fetchPage({
      cursor: '900004',
      pageSize: 200,
      boundingBox: { south: 29, west: 30, north: 31, east: 32 },
      modifiedSince: new Date('2026-01-01T00:00:00Z'),
    });
    const p = new URL(calls[0].url).searchParams;
    expect(p.get('greaterthanid')).toBe('900004');
    expect(p.get('boundingbox')).toBe('(31,30),(29,32)');
    expect(p.get('modifiedsince')).toBe('2026-01-01T00:00:00.000Z');
    // Fewer records than the page size → last page.
    expect(page.nextCursor).toBeNull();
  });

  it('rejects malformed cursors and country codes before any request', async () => {
    const { source, http } = setup({ OCM_API_KEY: 'k' });
    await expect(source.fetchPage({ cursor: '1&key=x' })).rejects.toBeInstanceOf(AppException);
    await expect(source.fetchPage({ countryCode: 'EGY' })).rejects.toBeInstanceOf(AppException);
    expect(http.fetch).not.toHaveBeenCalled();
  });

  it('maps upstream failures to 502 UPSTREAM_ERROR and records the error', async () => {
    const { source } = setup({ OCM_API_KEY: 'k' }, response(401, '{"error":"bad key"}'));
    await expect(source.fetchPage({})).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
      details: { provider: 'stations.ocm', reason: 'HTTP_401' },
    });
    expect(source.status().lastError).toContain('401');
  });

  it('rejects non-array payloads', async () => {
    const { source } = setup({ OCM_API_KEY: 'k' }, response(200, '{"not":"an array"}'));
    await expect(source.fetchPage({})).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
  });
});
