import { APP_SETTINGS } from '../../cli/seed-data/reference';

/** Typed app_settings keys (the value shape of each is below). */
export const SETTING_KEYS = [
  'branding',
  'defaults',
  'home.sections',
  'features',
  'map',
  'share',
  'legal',
  'app_links',
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export function isSettingKey(value: string): value is SettingKey {
  return (SETTING_KEYS as readonly string[]).includes(value);
}

/** URL-friendly aliases used by the admin routes (home-sections → home.sections). */
export const SETTING_ROUTE_KEYS: Record<string, SettingKey> = {
  branding: 'branding',
  defaults: 'defaults',
  'home-sections': 'home.sections',
  features: 'features',
  map: 'map',
  share: 'share',
  legal: 'legal',
  'app-links': 'app_links',
};

export const HOME_SECTION_KEYS = [
  'top_story',
  'latest_news',
  'interior_tours',
  'new_cars',
  'featured_comparisons',
  'reviews',
  'nearby_stations',
  'charging_guides',
] as const;
export type HomeSectionKey = (typeof HOME_SECTION_KEYS)[number];

export const FEATURE_FLAGS = [
  'news',
  'cars',
  'comparisons',
  'interiorTours',
  'stations',
  'calculators',
  'garage',
  'favorites',
  'chargingLogs',
  'reminders',
  'encyclopedia',
  'notifications',
  'community',
  'tripPlanner',
  'servicesDirectory',
  'assistant',
  'ads',
  'exteriorSpin',
] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

/**
 * Features whose module exists end-to-end (DB → API → admin → app). Every
 * other flag is forced OFF in /app-config whatever is stored, so a feature
 * that is not built yet can never be announced to the apps (REQUIREMENTS
 * §21: unfinished features stay hidden in production). Add a flag here in
 * the same change that ships its module.
 */
export const IMPLEMENTED_FEATURES: ReadonlySet<FeatureFlag> = new Set<FeatureFlag>([]);

export interface BrandingSettings {
  appName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  /** Storage key of an uploaded logo (internal; not exposed in /app-config). */
  logoStorageKey?: string | null;
}

export interface DefaultsSettings {
  defaultLanguage: 'ar' | 'en';
  defaultMarket: string;
  languages: ('ar' | 'en')[];
}

export interface HomeSection {
  key: HomeSectionKey;
  enabled: boolean;
  order: number;
}

export type FeaturesSettings = Record<FeatureFlag, boolean>;

export interface MapSettings {
  tileUrlTemplate: string | null;
  attribution: string | null;
  maxZoom: number;
  subdomains?: string[];
}

export interface ShareSettings {
  baseUrl: string;
  paths: { article: string; car: string; comparison: string };
  defaultImageUrl: string | null;
  /** Language of shared links: "auto" keeps the sharer's language. */
  language?: 'auto' | 'ar' | 'en';
}

export interface LegalSettings {
  privacyUrl: string | null;
  termsUrl: string | null;
}

export interface AppLinksSettings {
  androidPackage: string;
  androidSha256CertFingerprints: string[];
  iosTeamId: string | null;
  iosBundleId: string;
  /** Paths opened by the app (Universal Links / App Links). */
  paths?: string[];
}

export interface SettingValues {
  branding: BrandingSettings;
  defaults: DefaultsSettings;
  'home.sections': HomeSection[];
  features: FeaturesSettings;
  map: MapSettings;
  share: ShareSettings;
  legal: LegalSettings;
  app_links: AppLinksSettings;
}

/**
 * Share links plus the account e-mail links (auth sends SHARE_BASE_URL
 * /verify-email and /reset-password links that the app handles).
 */
export const DEFAULT_APP_LINK_PATHS = [
  '/n/*',
  '/cars/*',
  '/compare/*',
  '/verify-email',
  '/reset-password',
];

const seeded = new Map(APP_SETTINGS.map((s) => [s.key, s]));

/** Defaults = the reference seed values (src/cli/seed-data/reference.ts) + typed extras. */
export const SETTING_DEFAULTS: SettingValues = {
  branding: seeded.get('branding')!.value as BrandingSettings,
  defaults: seeded.get('defaults')!.value as DefaultsSettings,
  'home.sections': seeded.get('home.sections')!.value as HomeSection[],
  features: seeded.get('features')!.value as FeaturesSettings,
  map: seeded.get('map')!.value as MapSettings,
  share: { language: 'auto', ...(seeded.get('share')!.value as ShareSettings) },
  legal: seeded.get('legal')!.value as LegalSettings,
  app_links: {
    paths: DEFAULT_APP_LINK_PATHS,
    ...(seeded.get('app_links')!.value as AppLinksSettings),
  },
};

export const SETTING_META: Record<SettingKey, { isPublic: boolean; description: string }> = {
  branding: { isPublic: true, description: seeded.get('branding')!.description },
  defaults: { isPublic: true, description: seeded.get('defaults')!.description },
  'home.sections': { isPublic: true, description: seeded.get('home.sections')!.description },
  features: { isPublic: true, description: seeded.get('features')!.description },
  map: { isPublic: true, description: seeded.get('map')!.description },
  share: { isPublic: true, description: seeded.get('share')!.description },
  legal: { isPublic: true, description: seeded.get('legal')!.description },
  app_links: { isPublic: false, description: seeded.get('app_links')!.description },
};
