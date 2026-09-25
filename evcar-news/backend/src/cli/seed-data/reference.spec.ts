import { normalizeSearchText } from '../../common/i18n/arabic-normalize';
import { AdSurface, ContentReportReason, StationReportType } from '../../generated/prisma/enums';
import { normalizeConnectorName } from '../../providers/stations/connector-type-index';
import {
  AD_PLACEMENTS,
  CONNECTOR_TYPES,
  DEFAULT_CATEGORIES,
  ENCYCLOPEDIA_CATEGORIES,
  REPORT_REASONS,
  SEARCH_ALIASES,
} from './reference';

describe('reference data: default news categories', () => {
  it('covers the categories required by REQUIREMENTS §5', () => {
    expect(DEFAULT_CATEGORIES.map((c) => c.systemKey).sort()).toEqual(
      [
        'batteries_charging',
        'buying_guides',
        'news',
        'reviews',
        'safety',
        'software_ota',
        'test_drives',
      ].sort(),
    );
  });

  it('has unique, well-formed keys and slugs (same rule as the SQL CHECK)', () => {
    const keys = DEFAULT_CATEGORIES.map((c) => c.systemKey);
    const slugs = DEFAULT_CATEGORIES.map((c) => c.slug);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const c of DEFAULT_CATEGORIES) {
      expect(c.systemKey).toMatch(/^[a-z][a-z0-9_]{1,63}$/);
      expect(c.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('names every category in Arabic and English', () => {
    for (const c of DEFAULT_CATEGORIES) {
      for (const locale of ['ar', 'en'] as const) {
        expect(c.translations[locale].name.trim().length).toBeGreaterThan(0);
        expect(c.translations[locale].name.length).toBeLessThanOrEqual(200);
      }
      expect(c.translations.ar.name).toMatch(/[؀-ۿ]/);
    }
  });
});

describe('reference data: search aliases', () => {
  it('has no duplicate (term, canonical) pairs and no blank values', () => {
    const pairs = SEARCH_ALIASES.map((a) => `${a.term}\u0000${a.canonical}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    for (const a of SEARCH_ALIASES) {
      expect(a.term.trim()).toBe(a.term);
      expect(a.canonical.trim()).toBe(a.canonical);
      expect(a.term.length).toBeGreaterThan(0);
      expect(a.term.length).toBeLessThanOrEqual(200);
      expect(a.canonical.length).toBeLessThanOrEqual(200);
    }
  });

  it('only contains aliases that change the normalized query (useful expansions)', () => {
    for (const a of SEARCH_ALIASES) {
      expect(normalizeSearchText(a.term)).not.toBe(normalizeSearchText(a.canonical));
    }
  });

  it('never repeats a term that normalizes to an already seeded (term, canonical)', () => {
    const seen = new Set<string>();
    const repeated: string[] = [];
    for (const a of SEARCH_ALIASES) {
      const key = `${normalizeSearchText(a.term)}→${normalizeSearchText(a.canonical)}`;
      if (seen.has(key)) repeated.push(`${a.term} → ${a.canonical}`);
      seen.add(key);
    }
    // Pre-existing spelling variants that only differ by ى/ي or إ/ا are
    // kept for rows seeded in phase 1 (removing them would not delete them
    // from existing databases); no NEW redundant pairs may be added.
    expect(repeated).toEqual([
      'بى واى دى → BYD',
      'بي إم دبليو → BMW',
      'هيونداى → Hyundai',
      'إم جي → MG',
    ]);
  });
});

describe('reference data: connector types', () => {
  it('covers the standards of REQUIREMENTS §10 plus domestic sockets', () => {
    expect(CONNECTOR_TYPES.map((c) => c.code)).toEqual(
      expect.arrayContaining([
        'type2',
        'ccs2',
        'ccs1',
        'chademo',
        'nacs',
        'gbt_ac',
        'gbt_dc',
        'type1',
        'chaoji',
        'schuko',
        'bs1363',
        'iec60309',
      ]),
    );
  });

  it('has consistent AC/DC flags and typical powers (same rules as the SQL CHECKs)', () => {
    for (const c of CONNECTOR_TYPES) {
      expect(c.supportsAc || c.supportsDc).toBe(true);
      if (c.typicalMaxAcKw !== null) expect(c.supportsAc).toBe(true);
      if (c.typicalMaxDcKw !== null) expect(c.supportsDc).toBe(true);
      expect(c.code).toMatch(/^[a-z0-9_]{2,32}$/);
    }
  });

  it('never maps one provider name to two connector types', () => {
    const seen = new Map<string, string>();
    for (const c of CONNECTOR_TYPES) {
      for (const name of [c.code, c.nameEn, ...c.aliases]) {
        const key = normalizeConnectorName(name);
        expect(seen.get(key) ?? c.code).toBe(c.code);
        seen.set(key, c.code);
      }
    }
  });
});

describe('reference data: encyclopedia categories', () => {
  it('covers the beginner topics of REQUIREMENTS §15 with ar/en names', () => {
    expect(ENCYCLOPEDIA_CATEGORIES.map((c) => c.key)).toEqual(
      expect.arrayContaining([
        'vehicle_types',
        'connectors',
        'batteries',
        'range_cycles',
        'home_charging',
        'fast_charging',
        'warranty',
        'used_ev_inspection',
      ]),
    );
    const keys = ENCYCLOPEDIA_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of ENCYCLOPEDIA_CATEGORIES) {
      expect(c.key).toMatch(/^[a-z][a-z0-9_]{1,63}$/);
      expect(c.nameAr).toMatch(/[؀-ۿ]/);
      expect(c.nameEn.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('reference data: report reasons and ad placements', () => {
  it('labels every station report type and content report reason exactly once', () => {
    const codes = (scope: 'station' | 'content') =>
      REPORT_REASONS.filter((r) => r.scope === scope)
        .map((r) => r.code)
        .sort();
    expect(codes('station')).toEqual(Object.values(StationReportType).sort());
    expect(codes('content')).toEqual(Object.values(ContentReportReason).sort());
    for (const r of REPORT_REASONS) {
      expect(r.labelAr).toMatch(/[؀-ۿ]/);
      expect(r.requiresDetails).toBe(r.code === 'other');
    }
  });

  it('places ads only on allowed surfaces (never the map or a 360° view)', () => {
    const surfaces = Object.values(AdSurface) as string[];
    expect(surfaces).not.toContain('map');
    expect(surfaces).not.toContain('panorama');
    for (const a of AD_PLACEMENTS) expect(surfaces).toContain(a.surface);
    const keys = AD_PLACEMENTS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
