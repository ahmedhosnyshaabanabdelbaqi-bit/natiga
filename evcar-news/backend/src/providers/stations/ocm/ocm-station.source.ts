import type { AppConfig } from '../../../config/app-config';
import { AppException } from '../../../common/errors/app.exception';
import { expectJson, type OutboundHttp, upstreamException } from '../../http/outbound-http';
import { NOT_CONFIGURED_CHECK, timedCheck, type ProviderCheckResult } from '../../provider-check';
import { ProviderActivity, type ProviderStatus } from '../../provider-status';
import type { ConnectorTypeIndex } from '../connector-type-index';
import type {
  SourceLicence,
  StationSource,
  StationSourcePage,
  StationSourceQuery,
} from '../station-source.types';
import { mapOcmPoi } from './ocm.mapper';
import { OCM_ATTRIBUTION, OCM_USER_DATA_LICENCE } from './ocm.types';

export const OCM_DEFAULT_PAGE_SIZE = 200;
export const OCM_MAX_PAGE_SIZE = 1000;

/**
 * Open Charge Map client (API v3). Requires OCM_API_KEY (sent in the
 * X-API-Key header, never in the URL). Every request goes through the
 * SSRF-safe fetcher.
 *
 * Paging: `sortby=id_asc&greaterthanid=<last id>`; the cursor is the highest
 * OCM id of the previous page. Incremental syncs pass `modifiedSince`.
 *
 * Licensing (openchargemap.org terms): user-contributed data is CC BY 4.0;
 * records imported from third-party data providers keep that provider's
 * licence. By default only open-data-licensed records are returned
 * (`opendata=true` + a per-record check) and every record carries its data
 * provider attribution, which apps must show to end users.
 */
export class OcmStationSource implements StationSource {
  readonly key = 'ocm' as const;
  readonly displayName = 'Open Charge Map';
  readonly supportsSync = true;
  readonly licence: SourceLicence = {
    providerName: 'Open Charge Map',
    providerUrl: 'https://openchargemap.org',
    licence: `${OCM_USER_DATA_LICENCE} (user contributions); third-party data providers keep their own licence`,
    isOpenData: true,
    attribution: `© ${OCM_ATTRIBUTION} contributors and the listed data providers`,
  };
  private readonly activity = new ProviderActivity();

  constructor(
    private readonly config: AppConfig,
    private readonly http: OutboundHttp,
    private readonly connectorTypes: () => Promise<ConnectorTypeIndex>,
  ) {}

  private get apiKey(): string {
    return this.config.integrations.ocm.apiKey;
  }

  status(): ProviderStatus {
    const base = {
      type: 'stations',
      name: 'open_charge_map',
      attribution: this.licence.attribution,
      ...this.activity.snapshot(),
    };
    if (!this.apiKey) {
      return { ...base, configured: false, reason: 'OCM_API_KEY is not set.' };
    }
    return {
      ...base,
      configured: true,
      notes: [
        'Show the data provider attribution and licence of every imported station to end users.',
        'Coverage is community-maintained; it is not complete for any country.',
        'OCM statuses are operational statuses, not live availability.',
      ],
    };
  }

  buildUrl(query: StationSourceQuery, pageSize: number): string {
    const url = new URL(`${this.config.integrations.ocm.baseUrl.replace(/\/+$/, '')}/poi/`);
    const p = url.searchParams;
    p.set('output', 'json');
    p.set('compact', 'false');
    p.set('verbose', 'false');
    p.set('camelcase', 'false');
    p.set('includecomments', 'false');
    p.set('maxresults', String(pageSize));
    p.set('sortby', 'id_asc');
    if (query.cursor) {
      if (!/^\d{1,12}$/.test(query.cursor)) throw AppException.badRequest('Invalid OCM cursor');
      p.set('greaterthanid', query.cursor);
    }
    if (query.countryCode) {
      const cc = query.countryCode.toUpperCase();
      if (!/^[A-Z]{2}$/.test(cc)) throw AppException.badRequest('Invalid country code');
      p.set('countrycode', cc);
    }
    if (query.boundingBox) {
      const { south, west, north, east } = query.boundingBox;
      const nums = [south, west, north, east];
      if (nums.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
        throw AppException.badRequest('Invalid bounding box');
      }
      p.set('boundingbox', `(${north},${west}),(${south},${east})`);
    }
    if (query.modifiedSince) p.set('modifiedsince', query.modifiedSince.toISOString());
    if (query.openDataOnly ?? true) p.set('opendata', 'true');
    return url.toString();
  }

  async fetchPage(query: StationSourceQuery = {}): Promise<StationSourcePage> {
    if (!this.apiKey) throw AppException.integrationNotConfigured('stations.ocm');
    const pageSize = Math.min(
      OCM_MAX_PAGE_SIZE,
      Math.max(1, Math.floor(query.pageSize ?? OCM_DEFAULT_PAGE_SIZE)),
    );
    const url = this.buildUrl(query, pageSize);
    let payload: unknown;
    try {
      const res = await this.http.fetch(url, {
        headers: { 'X-API-Key': this.apiKey, accept: 'application/json' },
        // The API key must never follow a redirect.
        followRedirects: false,
        maxBytes: 50 * 1024 * 1024,
        timeoutMs: 60_000,
      });
      payload = expectJson<unknown>('stations.ocm', res);
      if (!Array.isArray(payload)) throw new Error('OCM response is not an array');
    } catch (err) {
      this.activity.failure(err);
      throw upstreamException('stations.ocm', err);
    }

    const types = await this.connectorTypes();
    const page: StationSourcePage = {
      items: [],
      skipped: [],
      nextCursor: null,
      fetchedAt: new Date().toISOString(),
      received: payload.length,
    };
    let maxId = 0;
    for (const raw of payload as unknown[]) {
      const id = (raw as { ID?: unknown })?.ID;
      if (typeof id === 'number' && id > maxId) maxId = id;
      const mapped = mapOcmPoi(raw, {
        connectorTypes: types,
        openDataOnly: query.openDataOnly ?? true,
      });
      if (mapped.ok) page.items.push(mapped.record);
      else page.skipped.push({ externalId: mapped.externalId, reason: mapped.reason });
    }
    page.nextCursor = payload.length >= pageSize && maxId > 0 ? String(maxId) : null;
    this.activity.success();
    return page;
  }

  async check(): Promise<ProviderCheckResult> {
    if (!this.apiKey) return NOT_CONFIGURED_CHECK;
    const result = await timedCheck(() => this.fetchPage({ pageSize: 1 }));
    return result;
  }
}
