import type { ProviderCheckResult } from '../provider-check';
import type { StatusReporter } from '../provider-status';

export interface GeocodeResult {
  displayName: string;
  lat: number;
  lng: number;
  /** e.g. "city", "road", "charging_station". */
  type: string | null;
  category: string | null;
  countryCode: string | null;
  /** [south, north, west, east] */
  boundingBox: [number, number, number, number] | null;
  address: {
    road?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  /** OSM reference, e.g. "node/123". */
  osmRef: string | null;
}

export interface GeocodeSearchOptions {
  lang?: 'ar' | 'en';
  /** ISO alpha-2 codes to restrict results. */
  countryCodes?: string[];
  /** 1..10, default 5. */
  limit?: number;
}

/**
 * Optional geocoder (manual city/point choice when location permission is
 * denied, station address lookup). Not configured → 503.
 */
export interface GeocodingProvider extends StatusReporter {
  readonly name: string;
  readonly configured: boolean;
  search(query: string, opts?: GeocodeSearchOptions): Promise<GeocodeResult[]>;
  reverse(lat: number, lng: number, opts?: { lang?: 'ar' | 'en' }): Promise<GeocodeResult | null>;
  check(): Promise<ProviderCheckResult>;
}
