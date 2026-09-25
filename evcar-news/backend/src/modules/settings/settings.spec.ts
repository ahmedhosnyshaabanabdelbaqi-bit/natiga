import { getMetadataStorage } from 'class-validator';
import { buildAppConfig, etagOf } from './app-config.service';
import { FeaturesSettingsDto } from './settings.dto';
import {
  FEATURE_FLAGS,
  type FeatureFlag,
  type FeaturesSettings,
  IMPLEMENTED_FEATURES,
  SETTING_DEFAULTS,
  SETTING_KEYS,
  type SettingValues,
} from './settings.types';
import { settingWarnings, validateSetting } from './settings.validation';

const dev = { requireHttps: false };
const prod = { requireHttps: true };

function appConfigInput(overrides: Partial<SettingValues> = {}) {
  return {
    settings: { ...SETTING_DEFAULTS, ...overrides },
    markets: [
      {
        code: 'EG',
        nameAr: 'مصر',
        nameEn: 'Egypt',
        currencyCode: 'EGP',
        timezone: 'Africa/Cairo',
        enabled: true,
      },
      {
        code: 'SA',
        nameAr: 'السعودية',
        nameEn: 'Saudi Arabia',
        currencyCode: 'SAR',
        timezone: 'Asia/Riyadh',
        enabled: true,
      },
    ],
    defaultMarket: 'EG',
    capabilities: { routing: false, assistant: false },
  };
}

describe('GET /app-config shape (ARCHITECTURE §4.4.1)', () => {
  it('has exactly the contract fields', () => {
    const body = buildAppConfig(appConfigInput());
    expect(Object.keys(body).sort()).toEqual(
      [
        'branding',
        'languages',
        'defaultLanguage',
        'defaultMarket',
        'markets',
        'homeSections',
        'features',
        'map',
        'share',
        'legal',
      ].sort(),
    );
    expect(Object.keys(body.branding).sort()).toEqual(
      ['accentColor', 'appName', 'logoUrl', 'primaryColor'].sort(),
    );
    expect(Object.keys(body.markets[0]).sort()).toEqual(
      ['code', 'currency', 'enabled', 'nameAr', 'nameEn', 'timezone'].sort(),
    );
    expect(Object.keys(body.homeSections[0]).sort()).toEqual(['enabled', 'key', 'order']);
    expect(Object.keys(body.map).sort()).toEqual(
      ['attribution', 'configured', 'maxZoom', 'tileUrlTemplate'].sort(),
    );
    expect(Object.keys(body.share)).toEqual(['baseUrl']);
    expect(Object.keys(body.legal).sort()).toEqual(['privacyUrl', 'termsUrl']);
  });

  it('maps the seeded defaults', () => {
    const body = buildAppConfig(appConfigInput());
    expect(body).toMatchObject({
      branding: {
        appName: 'EV Car News',
        logoUrl: null,
        primaryColor: '#0A5CFF',
        accentColor: '#00C2E0',
      },
      languages: ['ar', 'en'],
      defaultLanguage: 'ar',
      defaultMarket: 'EG',
      markets: [
        { code: 'EG', currency: 'EGP', timezone: 'Africa/Cairo', enabled: true },
        { code: 'SA' },
      ],
      share: { baseUrl: 'https://evcar.news' },
      legal: { privacyUrl: null, termsUrl: null },
      map: { configured: true, maxZoom: 19, attribution: '© OpenStreetMap contributors' },
    });
    expect(body.homeSections.map((h) => h.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(Object.keys(body.features).sort()).toEqual([...FEATURE_FLAGS].sort());
  });

  it('forces trip planner / assistant off until their services are configured', () => {
    const features = { ...SETTING_DEFAULTS.features, tripPlanner: true, assistant: true };
    expect(buildAppConfig(appConfigInput({ features })).features).toMatchObject({
      tripPlanner: false,
      assistant: false,
    });
    const on = {
      ...appConfigInput({ features }),
      capabilities: { routing: true, assistant: true },
      implemented: new Set<FeatureFlag>(['tripPlanner', 'assistant']),
    };
    expect(buildAppConfig(on).features).toMatchObject({ tripPlanner: true, assistant: true });
  });

  it('never announces a feature whose module is not implemented (REQUIREMENTS §21)', () => {
    const allOn = Object.fromEntries(FEATURE_FLAGS.map((f) => [f, true])) as FeaturesSettings;
    const cfg = buildAppConfig({
      ...appConfigInput({ features: allOn }),
      capabilities: { routing: true, assistant: true },
    });
    for (const flag of FEATURE_FLAGS) {
      expect({ flag, on: cfg.features[flag] }).toEqual({
        flag,
        on: IMPLEMENTED_FEATURES.has(flag),
      });
    }
    // Only implemented + enabled flags pass.
    const some = buildAppConfig({
      ...appConfigInput({ features: allOn }),
      implemented: new Set<FeatureFlag>(['news']),
    });
    expect(Object.entries(some.features).filter(([, v]) => v)).toEqual([['news', true]]);
  });

  it('seeds every feature flag off (nothing is built yet)', () => {
    expect(Object.values(SETTING_DEFAULTS.features).every((v) => v === false)).toBe(true);
  });

  it('warns when enabled flags are hidden because their module does not exist', () => {
    const warnings = settingWarnings(
      'features',
      { ...SETTING_DEFAULTS.features, news: true },
      { routingConfigured: false, assistantConfigured: false, isProduction: false },
    );
    expect(warnings).toContain('features_not_implemented_hidden');
  });

  it('reports the map as not configured without tiles or attribution', () => {
    const map = { tileUrlTemplate: null, attribution: null, maxZoom: 19 };
    expect(buildAppConfig(appConfigInput({ map })).map.configured).toBe(false);
  });

  it('sorts home sections by order', () => {
    const sections = [
      { key: 'reviews' as const, enabled: true, order: 2 },
      { key: 'top_story' as const, enabled: false, order: 1 },
    ];
    expect(buildAppConfig(appConfigInput({ 'home.sections': sections })).homeSections).toEqual([
      { key: 'top_story', enabled: false, order: 1 },
      { key: 'reviews', enabled: true, order: 2 },
    ]);
  });

  it('produces a stable strong ETag that changes with content', () => {
    const a = buildAppConfig(appConfigInput());
    expect(etagOf(a)).toBe(etagOf(buildAppConfig(appConfigInput())));
    expect(etagOf(a)).toMatch(/^"ac-[A-Za-z0-9_-]{27}"$/);
    const b = buildAppConfig(
      appConfigInput({ legal: { privacyUrl: 'https://evcar.news/p', termsUrl: null } }),
    );
    expect(etagOf(b)).not.toBe(etagOf(a));
  });
});

describe('typed settings validation', () => {
  it('accepts every built-in default', () => {
    for (const key of SETTING_KEYS) {
      const r = validateSetting(key, SETTING_DEFAULTS[key], dev);
      expect({ key, ok: r.ok }).toEqual({ key, ok: true });
    }
  });

  it('validates branding colors, name and URL (https in production)', () => {
    const base = SETTING_DEFAULTS.branding;
    expect(validateSetting('branding', { ...base, primaryColor: 'blue' }, dev).ok).toBe(false);
    expect(validateSetting('branding', { ...base, appName: '' }, dev).ok).toBe(false);
    expect(validateSetting('branding', { ...base, extra: 1 }, dev).ok).toBe(false);
    expect(validateSetting('branding', { ...base, logoUrl: 'javascript:alert(1)' }, dev).ok).toBe(
      false,
    );
    expect(
      validateSetting('branding', { ...base, logoUrl: 'http://cdn.example.test/l.png' }, prod).ok,
    ).toBe(false);
    const ok = validateSetting('branding', { ...base, primaryColor: '#0a5cff' }, prod);
    expect(ok.ok && ok.value.primaryColor).toBe('#0A5CFF');
  });

  it('keeps Arabic and English mandatory (REQUIREMENTS §1)', () => {
    const r = validateSetting(
      'defaults',
      { defaultLanguage: 'en', defaultMarket: 'EG', languages: ['en'] },
      dev,
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors[0]).toMatchObject({
      field: 'languages',
      constraints: { mandatoryLanguages: expect.any(String) as string },
    });
    expect(
      validateSetting(
        'defaults',
        { defaultLanguage: 'en', defaultMarket: 'EG', languages: ['ar', 'en'] },
        dev,
      ).ok,
    ).toBe(true);
  });

  it('validates defaults (language must be supported)', () => {
    expect(
      validateSetting(
        'defaults',
        { defaultLanguage: 'en', defaultMarket: 'EG', languages: ['ar'] },
        dev,
      ).ok,
    ).toBe(false);
    expect(
      validateSetting(
        'defaults',
        { defaultLanguage: 'fr', defaultMarket: 'EG', languages: ['ar'] },
        dev,
      ).ok,
    ).toBe(false);
  });

  it('validates home sections (known keys, unique keys and orders)', () => {
    expect(
      validateSetting('home.sections', [{ key: 'nope', enabled: true, order: 1 }], dev).ok,
    ).toBe(false);
    expect(
      validateSetting(
        'home.sections',
        [
          { key: 'top_story', enabled: true, order: 1 },
          { key: 'top_story', enabled: true, order: 2 },
        ],
        dev,
      ).ok,
    ).toBe(false);
    expect(
      validateSetting(
        'home.sections',
        [
          { key: 'top_story', enabled: true, order: 1 },
          { key: 'reviews', enabled: true, order: 1 },
        ],
        dev,
      ).ok,
    ).toBe(false);
  });

  it('merges partial feature flag updates and rejects unknown flags', () => {
    const r = validateSetting(
      'features',
      { community: true },
      { ...dev, current: SETTING_DEFAULTS.features },
    );
    expect(r.ok && r.value).toMatchObject({ community: true, news: false, tripPlanner: false });
    expect(validateSetting('features', { teleport: true }, dev).ok).toBe(false);
    expect(validateSetting('features', { news: 'yes' }, dev).ok).toBe(false);
  });

  it('ignores omitted flags that DTO instances carry as undefined', () => {
    const r = validateSetting(
      'features',
      { community: true, news: undefined },
      { ...dev, current: { ...SETTING_DEFAULTS.features, news: true } },
    );
    expect(r.ok && r.value).toMatchObject({ community: true, news: true });
  });

  it('FeaturesSettingsDto declares every flag', () => {
    const props = new Set(
      getMetadataStorage()
        .getTargetValidationMetadatas(FeaturesSettingsDto, '', true, false)
        .map((m) => m.propertyName),
    );
    expect([...props].sort()).toEqual([...FEATURE_FLAGS].sort());
  });

  it('requires tile placeholders, attribution and https tiles in production', () => {
    const map = {
      tileUrlTemplate: 'https://tiles.example.test/{z}/{x}.png',
      attribution: 'x',
      maxZoom: 19,
    };
    expect(validateSetting('map', map, dev).ok).toBe(false);
    expect(
      validateSetting(
        'map',
        { ...map, tileUrlTemplate: 'https://t.example.test/{z}/{x}/{y}.png', attribution: null },
        dev,
      ).ok,
    ).toBe(false);
    expect(
      validateSetting(
        'map',
        { ...map, tileUrlTemplate: 'http://t.example.test/{z}/{x}/{y}.png' },
        prod,
      ).ok,
    ).toBe(false);
    expect(
      validateSetting(
        'map',
        { ...map, tileUrlTemplate: 'https://{s}.t.example.test/{z}/{x}/{y}.png' },
        dev,
      ).ok,
    ).toBe(false);
    expect(
      validateSetting('map', { tileUrlTemplate: null, attribution: null, maxZoom: 19 }, prod).ok,
    ).toBe(true);
  });

  it('validates share paths and base URL', () => {
    const share = SETTING_DEFAULTS.share;
    expect(
      validateSetting('share', { ...share, paths: { ...share.paths, article: '/n/' } }, dev).ok,
    ).toBe(false);
    expect(validateSetting('share', { ...share, baseUrl: 'https://evcar.news/path' }, dev).ok).toBe(
      false,
    );
    expect(validateSetting('share', { ...share, baseUrl: 'http://evcar.news' }, prod).ok).toBe(
      false,
    );
  });

  it('validates app links fingerprints and team id', () => {
    const a = SETTING_DEFAULTS.app_links;
    expect(
      validateSetting('app_links', { ...a, androidSha256CertFingerprints: ['AA:BB'] }, dev).ok,
    ).toBe(false);
    expect(validateSetting('app_links', { ...a, iosTeamId: 'short' }, dev).ok).toBe(false);
    const fp = Array.from({ length: 32 }, () => 'AB').join(':');
    const ok = validateSetting(
      'app_links',
      { ...a, androidSha256CertFingerprints: [fp], iosTeamId: 'ABCDE12345' },
      dev,
    );
    expect(ok.ok && ok.value.paths).toEqual([
      '/n/*',
      '/cars/*',
      '/compare/*',
      '/verify-email',
      '/reset-password',
    ]);
  });

  it('produces admin warnings (OSM tile policy, hidden trip planner, missing legal URLs)', () => {
    const ctx = { routingConfigured: false, assistantConfigured: false, isProduction: false };
    expect(settingWarnings('map', SETTING_DEFAULTS.map, ctx)).toContain(
      'osm_public_tile_usage_policy',
    );
    expect(
      settingWarnings('features', { ...SETTING_DEFAULTS.features, tripPlanner: true }, ctx),
    ).toContain('trip_planner_hidden_routing_not_configured');
    expect(settingWarnings('legal', SETTING_DEFAULTS.legal, ctx)).toEqual([
      'privacy_url_missing',
      'terms_url_missing',
    ]);
  });
});
