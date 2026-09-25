import { describe, expect, it } from 'vitest';
import { resources } from '@/app/i18n';
import { makeUser } from '@/test/fixtures';
import { buildNavigation, canSeeFeature, features, hasAdminAccess } from './registry';

const REQUIRED_SECTIONS = [
  'dashboard',
  'articles',
  'taxonomy',
  'rss-sources',
  'vehicles',
  'specs',
  'prices',
  'media',
  'tours',
  'stations',
  'station-reports',
  'moderation',
  'encyclopedia',
  'services-directory',
  'notifications',
  'ads',
  'users',
  'audit-log',
  'imports',
  'translations',
  'settings',
  'system',
  'reports',
  'markets',
];

describe('feature registry', () => {
  it('contains every admin section exactly once', () => {
    const keys = features.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of REQUIRED_SECTIONS) expect(keys).toContain(key);
    const paths = features.map((f) => f.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('has ar and en locale files with a title and description for each feature', () => {
    for (const f of features) {
      for (const lang of ['ar', 'en']) {
        const ns = resources[lang]?.[f.key] as Record<string, unknown> | undefined;
        expect(ns, `${lang}/${f.key}.json`).toBeDefined();
        expect(typeof ns?.title, `${lang}/${f.key}.json title`).toBe('string');
        expect(typeof ns?.description, `${lang}/${f.key}.json description`).toBe('string');
      }
    }
  });

  it('keeps ar and en locale files structurally in sync', () => {
    const flatten = (obj: unknown, prefix = ''): string[] =>
      obj && typeof obj === 'object'
        ? Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
            flatten(v, prefix ? `${prefix}.${k}` : k),
          )
        : [prefix];
    // Arabic has extra plural forms (_zero/_two/_few/_many); compare base keys.
    const base = (keys: string[]) =>
      new Set(keys.map((k) => k.replace(/_(zero|one|two|few|many|other)$/, '')));
    for (const ns of Object.keys(resources.en ?? {})) {
      const en = base(flatten(resources.en?.[ns]));
      const ar = base(flatten(resources.ar?.[ns]));
      expect(
        [...en].filter((k) => !ar.has(k)),
        `keys missing in ar/${ns}.json`,
      ).toEqual([]);
      expect(
        [...ar].filter((k) => !en.has(k)),
        `keys missing in en/${ns}.json`,
      ).toEqual([]);
    }
  });

  it('shows only permitted sections in the navigation', () => {
    const editor = makeUser({
      roles: ['editor'],
      permissions: ['articles.create', 'articles.update', 'tags.write'],
    });
    const nav = buildNavigation(editor);
    const keys = nav.flatMap((g) => g.items.map((i) => i.key));
    expect(keys).toContain('dashboard');
    expect(keys).toContain('articles');
    expect(keys).toContain('taxonomy');
    expect(keys).not.toContain('users');
    expect(keys).not.toContain('settings');
    expect(keys).not.toContain('audit-log');
  });

  it('shows everything to a wildcard owner', () => {
    const owner = makeUser({ roles: ['owner'], permissions: ['*'] });
    const count = buildNavigation(owner).reduce((n, g) => n + g.items.length, 0);
    expect(count).toBe(features.length);
  });

  it('denies admin access to plain app users', () => {
    const appUser = makeUser({ roles: ['user'], permissions: ['me.read'] });
    expect(hasAdminAccess(appUser)).toBe(false);
    expect(buildNavigation(appUser)).toEqual([]);
    const dashboard = features.find((f) => f.key === 'dashboard')!;
    expect(canSeeFeature(dashboard, appUser)).toBe(false);
    expect(hasAdminAccess(makeUser({ roles: ['station_manager'], permissions: [] }))).toBe(true);
  });
});
