/**
 * Hand-written types for the fixed shared contract (ARCHITECTURE.md §4.3, §4.4.1).
 * Everything else is generated into `schema.d.ts` by `npm run api:types` once the
 * backend exports `backend/openapi.json`.
 */

export type Locale = 'ar' | 'en';

export interface ItemResponse<T> {
  data: T;
}

export interface ListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  nextCursor?: string | null;
}

export interface ListResponse<T> {
  data: T[];
  meta: ListMeta;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

/** `user` from §4.4.1. */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  locale: Locale | string;
  roles: string[];
  permissions: string[];
  createdAt: string;
}

/** Response of POST /auth/login and POST /auth/refresh. */
export interface AuthSession {
  accessToken: string;
  /** Seconds until the access token expires. */
  accessTokenExpiresIn: number;
  /** Only present for mobile clients; web clients get the httpOnly `evcar_rt` cookie. */
  refreshToken?: string;
  user: AuthUser;
}

export interface MarketConfig {
  code: string;
  nameAr: string;
  nameEn: string;
  currency: string;
  timezone: string;
  enabled: boolean;
}

export interface HomeSectionConfig {
  key: string;
  enabled: boolean;
  order: number;
}

export interface BrandingConfig {
  appName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
}

export interface MapConfig {
  tileUrlTemplate: string | null;
  attribution: string | null;
  maxZoom: number | null;
  configured: boolean;
}

/** GET /app-config (public). */
export interface AppConfig {
  branding: BrandingConfig;
  languages: string[];
  defaultLanguage: string;
  defaultMarket: string;
  markets: MarketConfig[];
  homeSections: HomeSectionConfig[];
  features: Record<string, boolean>;
  map: MapConfig;
  share: { baseUrl: string | null };
  legal: { privacyUrl: string | null; termsUrl: string | null };
}

/** Content workflow status (§4.5). */
export const CONTENT_STATUSES = [
  'draft',
  'in_review',
  'scheduled',
  'published',
  'archived',
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/** Spec reliability (§3). */
export const RELIABILITY_LEVELS = [
  'verified',
  'manufacturer_claim',
  'estimated',
  'unverified',
  'disputed',
] as const;
export type Reliability = (typeof RELIABILITY_LEVELS)[number];

/** Money (§4.3): amount is a decimal string, never a float. */
export interface Money {
  amount: string;
  currency: string;
}
