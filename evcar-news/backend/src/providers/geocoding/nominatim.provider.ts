import type { AppConfig } from '../../config/app-config';
import { AppException } from '../../common/errors/app.exception';
import { expectJson, type OutboundHttp, upstreamException } from '../http/outbound-http';
import { NOT_CONFIGURED_CHECK, timedCheck, type ProviderCheckResult } from '../provider-check';
import { ProviderActivity, type ProviderStatus } from '../provider-status';
import type { GeocodeResult, GeocodeSearchOptions, GeocodingProvider } from './geocoding.types';
import { IntervalRateLimiter, TtlCache } from './rate-limiter';

interface NominatimPlace {
  display_name?: string;
  lat?: string;
  lon?: string;
  type?: string;
  category?: string;
  class?: string;
  boundingbox?: string[];
  osm_type?: string;
  osm_id?: number;
  address?: Record<string, string>;
  error?: string;
}

export function mapNominatimPlace(p: NominatimPlace): GeocodeResult | null {
  const lat = Number(p.lat);
  const lng = Number(p.lon);
  if (!p.display_name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const bb = (p.boundingbox ?? []).map(Number);
  const a = p.address ?? {};
  return {
    displayName: p.display_name,
    lat,
    lng,
    type: p.type ?? null,
    category: p.category ?? p.class ?? null,
    countryCode: a.country_code ? a.country_code.toUpperCase() : null,
    boundingBox:
      bb.length === 4 && bb.every(Number.isFinite)
        ? (bb as [number, number, number, number])
        : null,
    address: {
      road: a.road,
      city: a.city ?? a.town ?? a.village ?? a.municipality,
      state: a.state ?? a.governorate ?? a.province,
      postcode: a.postcode,
      country: a.country,
    },
    osmRef: p.osm_type && p.osm_id ? `${p.osm_type}/${p.osm_id}` : null,
  };
}

const PUBLIC_NOMINATIM = /(^|\.)nominatim\.openstreetmap\.org$/i;

/**
 * Nominatim-compatible geocoder (public nominatim.openstreetmap.org or a
 * self-hosted instance). Sends the configured User-Agent and contact e-mail,
 * is limited to 1 request/second per process and caches answers for 24 h,
 * as the Nominatim usage policy requires. Not for search-as-you-type on the
 * public instance.
 */
export class NominatimGeocodingProvider implements GeocodingProvider {
  readonly name = 'nominatim';
  private readonly activity = new ProviderActivity();
  private readonly limiter = new IntervalRateLimiter(1_100);
  private readonly cache = new TtlCache<unknown>(24 * 3600_000, 2_000);

  constructor(
    private readonly config: AppConfig,
    private readonly http: OutboundHttp,
  ) {}

  private get baseUrl(): string {
    return this.config.integrations.geocoding.baseUrl.replace(/\/+$/, '');
  }

  get configured(): boolean {
    return /^https?:\/\//.test(this.baseUrl);
  }

  status(): ProviderStatus {
    const base = { type: 'geocoding', name: 'nominatim', ...this.activity.snapshot() };
    if (!this.configured) {
      return { ...base, configured: false, reason: 'GEOCODING_BASE_URL is not set (optional).' };
    }
    const notes = ['Limited to 1 request/second per API instance; results are cached for 24 h.'];
    let host = '';
    try {
      host = new URL(this.baseUrl).hostname;
    } catch {
      /* configured check above guarantees a URL shape */
    }
    if (PUBLIC_NOMINATIM.test(host)) {
      notes.push(
        'Public Nominatim: no heavy use and no autocomplete; set GEOCODING_EMAIL and consider self-hosting.',
      );
      if (!this.config.integrations.geocoding.email) notes.push('GEOCODING_EMAIL is not set.');
    }
    return { ...base, configured: true, notes, attribution: '© OpenStreetMap contributors' };
  }

  private params(extra: Record<string, string>): URLSearchParams {
    const p = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', ...extra });
    const email = this.config.integrations.geocoding.email;
    if (email) p.set('email', email);
    return p;
  }

  private async getJson<T>(path: string, params: URLSearchParams): Promise<T> {
    const url = `${this.baseUrl}${path}?${params.toString()}`;
    const cached = this.cache.get(url);
    if (cached !== undefined) return cached as T;
    const data = await this.limiter.schedule(async () => {
      try {
        const res = await this.http.fetchOperatorEndpoint(this.baseUrl, url, {
          headers: { accept: 'application/json' },
        });
        const json = expectJson<T>('geocoding.nominatim', res);
        this.activity.success();
        return json;
      } catch (err) {
        this.activity.failure(err);
        throw upstreamException('geocoding.nominatim', err);
      }
    });
    this.cache.set(url, data);
    return data;
  }

  async search(query: string, opts: GeocodeSearchOptions = {}): Promise<GeocodeResult[]> {
    if (!this.configured) throw AppException.integrationNotConfigured('geocoding.nominatim');
    const q = query.trim().slice(0, 200);
    if (q.length < 2) return [];
    const extra: Record<string, string> = {
      q,
      limit: String(Math.min(10, Math.max(1, opts.limit ?? 5))),
      'accept-language': opts.lang ?? 'ar',
    };
    const codes = (opts.countryCodes ?? []).filter((c) => /^[A-Za-z]{2}$/.test(c));
    if (codes.length > 0) extra.countrycodes = codes.join(',').toLowerCase();
    const body = await this.getJson<NominatimPlace[]>('/search', this.params(extra));
    return (Array.isArray(body) ? body : [])
      .map(mapNominatimPlace)
      .filter((r): r is GeocodeResult => r !== null);
  }

  async reverse(
    lat: number,
    lng: number,
    opts: { lang?: 'ar' | 'en' } = {},
  ): Promise<GeocodeResult | null> {
    if (!this.configured) throw AppException.integrationNotConfigured('geocoding.nominatim');
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      throw AppException.validation([{ field: 'lat/lng', constraints: { range: 'out of range' } }]);
    }
    const body = await this.getJson<NominatimPlace>(
      '/reverse',
      this.params({
        lat: lat.toFixed(6),
        lon: lng.toFixed(6),
        zoom: '18',
        'accept-language': opts.lang ?? 'ar',
      }),
    );
    if (!body || body.error) return null;
    return mapNominatimPlace(body);
  }

  async check(): Promise<ProviderCheckResult> {
    if (!this.configured) return NOT_CONFIGURED_CHECK;
    return timedCheck(() => this.search('Cairo', { limit: 1, lang: 'en' }));
  }
}

/** Geocoding disabled (GEOCODING_BASE_URL empty). */
export class NoneGeocodingProvider implements GeocodingProvider {
  readonly name = 'none';
  readonly configured = false;

  status(): ProviderStatus {
    return {
      type: 'geocoding',
      name: 'none',
      configured: false,
      reason: 'GEOCODING_BASE_URL is not set (optional): users pick a point on the map instead.',
    };
  }

  search(): Promise<GeocodeResult[]> {
    return Promise.reject(AppException.integrationNotConfigured('geocoding'));
  }

  reverse(): Promise<GeocodeResult | null> {
    return Promise.reject(AppException.integrationNotConfigured('geocoding'));
  }

  check(): Promise<ProviderCheckResult> {
    return Promise.resolve(NOT_CONFIGURED_CHECK);
  }
}
