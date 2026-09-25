import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { type FieldError, flattenValidationErrors } from '../../common/pipes/validation.pipe';
import { tr } from '../../common/validation/messages';
import {
  AppLinksSettingsDto,
  BrandingSettingsDto,
  DefaultsSettingsDto,
  FeaturesSettingsDto,
  HomeSectionsSettingsDto,
  LegalSettingsDto,
  MapSettingsDto,
  ShareSettingsDto,
} from './settings.dto';
import {
  type AppLinksSettings,
  type BrandingSettings,
  DEFAULT_APP_LINK_PATHS,
  FEATURE_FLAGS,
  type FeaturesSettings,
  IMPLEMENTED_FEATURES,
  type HomeSection,
  type MapSettings,
  SETTING_DEFAULTS,
  type SettingKey,
  type SettingValues,
  type ShareSettings,
} from './settings.types';

/** Languages the product must always offer (REQUIREMENTS §1). */
export const MANDATORY_LANGUAGES = ['ar', 'en'] as const;

export type ValidationResult<K extends SettingKey> =
  { ok: true; value: SettingValues[K] } | { ok: false; errors: FieldError[] };

interface ValidateOptions {
  /** Production requires https for every URL. */
  requireHttps: boolean;
  /** Current stored value (features are merged into it). */
  current?: unknown;
}

function dto<T extends object>(cls: new () => T, value: unknown): FieldError[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [
      {
        field: '',
        constraints: {
          isObject: tr({ ar: 'يجب أن تكون القيمة كائنًا.', en: 'The value must be an object.' }),
        },
      },
    ];
  }
  const instance = plainToInstance(cls, value);
  return flattenValidationErrors(
    validateSync(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
      validationError: { target: true, value: false },
    }),
  );
}

function https(
  fields: Record<string, string | null | undefined>,
  requireHttps: boolean,
): FieldError[] {
  if (!requireHttps) return [];
  return Object.entries(fields)
    .filter(([, v]) => typeof v === 'string' && !v.toLowerCase().startsWith('https://'))
    .map(([field]) => ({
      field,
      constraints: {
        https: tr({
          ar: 'يجب أن يستخدم الرابط https في بيئة الإنتاج.',
          en: 'Must use https in production.',
        }),
      },
    }));
}

function withoutInternal(branding: Record<string, unknown>): Record<string, unknown> {
  const { logoStorageKey: _ignored, ...rest } = branding;
  return rest;
}

/**
 * Validates and normalizes a value for a typed setting key. Used for admin
 * writes and to guard reads of stored JSON (an invalid stored value falls
 * back to the default instead of breaking /app-config).
 */
export function validateSetting<K extends SettingKey>(
  key: K,
  raw: unknown,
  opts: ValidateOptions,
): ValidationResult<K> {
  const fail = (errors: FieldError[]): ValidationResult<K> => ({ ok: false, errors });
  const done = (value: SettingValues[SettingKey]): ValidationResult<K> => ({
    ok: true,
    value: value as SettingValues[K],
  });

  switch (key) {
    case 'branding': {
      const obj = (raw ?? {}) as Record<string, unknown>;
      const errors = dto(BrandingSettingsDto, withoutInternal(obj));
      const b = obj as unknown as BrandingSettings;
      errors.push(...https({ logoUrl: b.logoUrl }, opts.requireHttps));
      if (errors.length) return fail(errors);
      const storageKey = typeof obj.logoStorageKey === 'string' ? obj.logoStorageKey : null;
      return done({
        appName: b.appName.trim(),
        logoUrl: b.logoUrl,
        primaryColor: b.primaryColor.toUpperCase(),
        accentColor: b.accentColor.toUpperCase(),
        ...(storageKey && b.logoUrl ? { logoStorageKey: storageKey } : {}),
      });
    }
    case 'defaults': {
      const errors = dto(DefaultsSettingsDto, raw);
      if (errors.length) return fail(errors);
      const d = raw as SettingValues['defaults'];
      // REQUIREMENTS §1: Arabic (RTL) and English (LTR) are both mandatory.
      const missing = MANDATORY_LANGUAGES.filter((l) => !d.languages.includes(l));
      if (missing.length) {
        return fail([
          {
            field: 'languages',
            constraints: {
              mandatoryLanguages: tr({
                ar: 'العربية والإنجليزية لغتان إلزاميتان ولا يمكن إزالة أي منهما.',
                en: 'Arabic and English are both mandatory and cannot be removed.',
              }),
            },
          },
        ]);
      }
      if (!d.languages.includes(d.defaultLanguage)) {
        return fail([
          {
            field: 'defaultLanguage',
            constraints: {
              inLanguages: tr({
                ar: 'يجب أن تكون اللغة الافتراضية ضمن اللغات المدعومة.',
                en: 'The default language must be one of the supported languages.',
              }),
            },
          },
        ]);
      }
      return done({
        defaultLanguage: d.defaultLanguage,
        defaultMarket: d.defaultMarket,
        languages: [...d.languages],
      });
    }
    case 'home.sections': {
      const errors = dto(HomeSectionsSettingsDto, { sections: raw });
      if (errors.length)
        return fail(errors.map((e) => ({ ...e, field: e.field.replace(/^sections\.?/, '') })));
      const sections = raw as HomeSection[];
      const keys = new Set(sections.map((s) => s.key));
      const orders = new Set(sections.map((s) => s.order));
      if (keys.size !== sections.length) {
        return fail([
          {
            field: 'key',
            constraints: {
              unique: tr({
                ar: 'لا يجوز تكرار مفتاح القسم.',
                en: 'Each section key may appear once.',
              }),
            },
          },
        ]);
      }
      if (orders.size !== sections.length) {
        return fail([
          {
            field: 'order',
            constraints: {
              unique: tr({ ar: 'يجب ألا يتكرر الترتيب.', en: 'Orders must be unique.' }),
            },
          },
        ]);
      }
      return done(
        [...sections]
          .sort((a, b) => a.order - b.order)
          .map((s) => ({ key: s.key, enabled: s.enabled, order: s.order })),
      );
    }
    case 'features': {
      const errors = dto(FeaturesSettingsDto, raw);
      if (errors.length) return fail(errors);
      const base = {
        ...SETTING_DEFAULTS.features,
        ...((opts.current as Partial<FeaturesSettings> | undefined) ?? {}),
      };
      // Only explicitly provided booleans change (DTO instances carry undefined for omitted flags).
      const provided = Object.fromEntries(
        Object.entries(raw as Record<string, unknown>).filter(([, v]) => typeof v === 'boolean'),
      ) as Partial<FeaturesSettings>;
      const merged = { ...base, ...provided };
      const out = {} as FeaturesSettings;
      for (const flag of FEATURE_FLAGS) out[flag] = merged[flag] === true;
      return done(out);
    }
    case 'map': {
      const errors = dto(MapSettingsDto, raw);
      if (errors.length) return fail(errors);
      const m = raw as MapSettings;
      if (m.tileUrlTemplate) {
        for (const p of ['{z}', '{x}', '{y}']) {
          if (!m.tileUrlTemplate.includes(p)) {
            errors.push({
              field: 'tileUrlTemplate',
              constraints: {
                placeholders: tr({
                  ar: `يجب أن يحتوي قالب البلاطات على ${p}.`,
                  en: `The tile URL template must contain ${p}.`,
                }),
              },
            });
          }
        }
        if (!m.attribution) {
          errors.push({
            field: 'attribution',
            constraints: {
              required: tr({
                ar: 'الإسناد مطلوب عند إعداد مزود البلاطات.',
                en: 'Attribution is required when tiles are configured.',
              }),
            },
          });
        }
        if (m.tileUrlTemplate.includes('{s}') && !m.subdomains?.length) {
          errors.push({
            field: 'subdomains',
            constraints: {
              required: tr({
                ar: 'القالب يستخدم {s} ويحتاج إلى نطاقات فرعية.',
                en: 'The template uses {s} and needs subdomains.',
              }),
            },
          });
        }
      }
      errors.push(...https({ tileUrlTemplate: m.tileUrlTemplate }, opts.requireHttps));
      if (errors.length) return fail(errors);
      return done({
        tileUrlTemplate: m.tileUrlTemplate,
        attribution: m.attribution?.trim() ?? null,
        maxZoom: m.maxZoom,
        ...(m.subdomains?.length ? { subdomains: m.subdomains } : {}),
      });
    }
    case 'share': {
      const errors = dto(ShareSettingsDto, raw);
      const s = (raw ?? {}) as ShareSettings;
      if (!errors.length) {
        errors.push(
          ...https({ baseUrl: s.baseUrl, defaultImageUrl: s.defaultImageUrl }, opts.requireHttps),
        );
      }
      if (errors.length) return fail(errors);
      return done({
        baseUrl: s.baseUrl.replace(/\/+$/, ''),
        paths: { article: s.paths.article, car: s.paths.car, comparison: s.paths.comparison },
        defaultImageUrl: s.defaultImageUrl,
        language: s.language ?? 'auto',
      });
    }
    case 'legal': {
      const errors = dto(LegalSettingsDto, raw);
      const l = (raw ?? {}) as SettingValues['legal'];
      if (!errors.length) {
        errors.push(
          ...https({ privacyUrl: l.privacyUrl, termsUrl: l.termsUrl }, opts.requireHttps),
        );
      }
      if (errors.length) return fail(errors);
      return done({ privacyUrl: l.privacyUrl, termsUrl: l.termsUrl });
    }
    case 'app_links': {
      const errors = dto(AppLinksSettingsDto, raw);
      if (errors.length) return fail(errors);
      const a = raw as AppLinksSettings;
      return done({
        androidPackage: a.androidPackage,
        androidSha256CertFingerprints: [...a.androidSha256CertFingerprints],
        iosTeamId: a.iosTeamId,
        iosBundleId: a.iosBundleId,
        paths: a.paths?.length ? a.paths : DEFAULT_APP_LINK_PATHS,
      });
    }
    default:
      return fail([
        {
          field: '',
          constraints: { unknown: tr({ ar: 'إعداد غير معروف.', en: 'Unknown setting.' }) },
        },
      ]);
  }
}

const PUBLIC_OSM = /(^|\/\/)(tile\.openstreetmap\.org|[abc]\.tile\.openstreetmap\.org)\//i;

/** Non-blocking hints shown next to a setting in the admin. */
export function settingWarnings(
  key: SettingKey,
  value: unknown,
  ctx: { routingConfigured: boolean; assistantConfigured: boolean; isProduction: boolean },
): string[] {
  const out: string[] = [];
  if (key === 'map') {
    const m = value as MapSettings;
    if (!m.tileUrlTemplate || !m.attribution) out.push('map_not_configured');
    else if (PUBLIC_OSM.test(m.tileUrlTemplate)) out.push('osm_public_tile_usage_policy');
  }
  if (key === 'features') {
    const f = value as FeaturesSettings;
    if (FEATURE_FLAGS.some((flag) => f[flag] && !IMPLEMENTED_FEATURES.has(flag))) {
      out.push('features_not_implemented_hidden');
    }
    if (f.tripPlanner && !ctx.routingConfigured)
      out.push('trip_planner_hidden_routing_not_configured');
    if (f.assistant && !ctx.assistantConfigured) out.push('assistant_hidden_not_configured');
  }
  if (key === 'legal') {
    const l = value as SettingValues['legal'];
    if (!l.privacyUrl) out.push('privacy_url_missing');
    if (!l.termsUrl) out.push('terms_url_missing');
  }
  if (key === 'app_links') {
    const a = value as AppLinksSettings;
    if (a.androidSha256CertFingerprints.length === 0) out.push('android_fingerprints_missing');
    if (!a.iosTeamId) out.push('ios_team_id_missing');
  }
  if (
    key === 'share' &&
    ctx.isProduction &&
    !(value as ShareSettings).baseUrl.startsWith('https://')
  ) {
    out.push('share_base_url_not_https');
  }
  return out;
}
