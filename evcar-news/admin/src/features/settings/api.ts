/**
 * Application settings admin API (backed by `app_settings`, backend
 * src/modules/settings). Each key has its own write route and validated DTO:
 *
 *   GET    /admin/settings                   → { data: SettingDto[] }
 *   PUT    /admin/settings/branding          BrandingSettingsDto (appName, logoUrl, primaryColor, accentColor)
 *   POST   /admin/settings/branding/logo     multipart `file` (PNG/JPEG/WebP ≤ 1 MB) → SettingDto
 *   DELETE /admin/settings/branding/logo     → SettingDto (logoUrl null)
 *   PUT    /admin/settings/defaults          DefaultsSettingsDto
 *   PUT    /admin/settings/home-sections     { sections: HomeSectionDto[] }
 *   PATCH  /admin/settings/features          partial { flag: boolean }
 *   PUT    /admin/settings/map | share | legal | app-links   full value
 *   POST   /admin/settings/:key/reset        → back to the built-in default
 *
 * The tabs always send the stored value merged with their edits, because the
 * PUT routes replace the whole value. Public keys are what GET /app-config
 * exposes to the apps.
 */
import { api } from '@/api/client';
import type { components } from '@/api/schema';
import type { HomeSectionConfig, ItemResponse } from '@/api/types';

type SettingDto = components['schemas']['SettingDto'];

/** SettingDto with the JSON value left as `unknown` (validated by readers below). */
export type SettingRecord<V = unknown> = Omit<SettingDto, 'value'> & { value: V };

export type SettingsMap = Record<string, SettingRecord>;

export const SETTING_KEYS = {
  branding: 'branding',
  homeSections: 'home.sections',
  features: 'features',
  share: 'share',
  legal: 'legal',
  map: 'map',
  defaults: 'defaults',
  appLinks: 'app_links',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

/** Write route per key; the body is the value itself except for home sections. */
const WRITE_ROUTES: Record<
  SettingKey,
  { method: 'put' | 'patch'; path: string; body?: (value: unknown) => unknown }
> = {
  branding: { method: 'put', path: 'branding' },
  defaults: { method: 'put', path: 'defaults' },
  'home.sections': {
    method: 'put',
    path: 'home-sections',
    body: (v) => ({
      sections: Array.isArray(v) ? v : ((v as { sections?: unknown } | null)?.sections ?? []),
    }),
  },
  features: { method: 'patch', path: 'features' },
  map: { method: 'put', path: 'map' },
  share: { method: 'put', path: 'share' },
  legal: { method: 'put', path: 'legal' },
  app_links: { method: 'put', path: 'app-links' },
};

export const settingsKeys = { all: ['admin', 'settings'] as const };

export function normalizeSettings(data: unknown): SettingsMap {
  const out: SettingsMap = {};
  if (!Array.isArray(data)) return out;
  for (const row of data) {
    if (row && typeof row === 'object' && typeof (row as SettingRecord).key === 'string') {
      const rec = row as SettingRecord;
      out[rec.key] = rec;
    }
  }
  return out;
}

export const settingsApi = {
  async getAll(signal?: AbortSignal): Promise<SettingsMap> {
    const res = await api.get<{ data: unknown }>('/admin/settings', undefined, { signal });
    return normalizeSettings(res?.data);
  },
  async save<V>(key: SettingKey, value: V): Promise<SettingRecord | undefined> {
    const route = WRITE_ROUTES[key];
    const body = route.body ? route.body(value) : value;
    const path = `/admin/settings/${route.path}`;
    const res =
      route.method === 'patch'
        ? await api.patch<ItemResponse<SettingRecord>>(path, body)
        : await api.put<ItemResponse<SettingRecord>>(path, body);
    return res?.data;
  },
  async reset(key: SettingKey): Promise<SettingRecord | undefined> {
    const res = await api.post<ItemResponse<SettingRecord>>(
      `/admin/settings/${encodeURIComponent(key)}/reset`,
    );
    return res?.data;
  },
  async uploadLogo(file: File): Promise<SettingRecord | undefined> {
    const form = new FormData();
    form.append('file', file);
    const res = await api.post<ItemResponse<SettingRecord>>('/admin/settings/branding/logo', form);
    return res?.data;
  },
  async removeLogo(): Promise<SettingRecord | undefined> {
    const res = await api.delete<ItemResponse<SettingRecord>>('/admin/settings/branding/logo');
    return res?.data;
  },
};

/** Accepted by POST /admin/settings/branding/logo (SVG is refused server-side). */
export const LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const LOGO_MAX_BYTES = 1024 * 1024;

// ---- typed accessors (defensive: values are JSON from the DB) --------------

export function objectValue(settings: SettingsMap, key: string): Record<string, unknown> {
  const v = settings[key]?.value;
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function homeSectionsValue(settings: SettingsMap): HomeSectionConfig[] {
  const raw = settings[SETTING_KEYS.homeSections]?.value;
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { sections?: unknown }).sections)
      ? (raw as { sections: unknown[] }).sections
      : [];
  return list
    .filter((s): s is HomeSectionConfig => !!s && typeof (s as HomeSectionConfig).key === 'string')
    .map((s, i) => ({
      key: s.key,
      enabled: s.enabled !== false,
      order: Number.isFinite(s.order) ? s.order : i + 1,
    }))
    .sort((a, b) => a.order - b.order);
}

/** Re-numbers orders 1..n following the array order. */
export function renumber(sections: HomeSectionConfig[]): HomeSectionConfig[] {
  return sections.map((s, i) => ({ ...s, order: i + 1 }));
}

/** http(s) URL; the server additionally requires https in production. */
export function isWebUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Slippy-map tile template: http(s) URL containing {z}, {x} and {y} (same rule
 * as the API; the server additionally requires https in production).
 */
export function isValidTileTemplate(value: string): boolean {
  if (!/^https?:\/\/\S+$/.test(value)) return false;
  return ['{z}', '{x}', '{y}'].every((p) => value.includes(p));
}

export function booleanFlags(value: Record<string, unknown>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(value)) if (typeof v === 'boolean') out[k] = v;
  return out;
}

/** Zoom-3 tile covering Egypt / the Levant — used only to test the template. */
const SAMPLE_TILE = { z: 3, x: 4, y: 3 };

export function sampleTileUrl(template: string): string {
  return template
    .replace('{z}', String(SAMPLE_TILE.z))
    .replace('{x}', String(SAMPLE_TILE.x))
    .replace('{y}', String(SAMPLE_TILE.y))
    .replace('{s}', 'a')
    .replace('{r}', '');
}
