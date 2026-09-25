import { latinSlug, resolveSlug } from '../common/slugs';
import { visibilityBlockers } from '../common/visibility';
import {
  CsvFormatError,
  guardCell,
  parseBoolCell,
  parseCsv,
  parseNumberCell,
  toCsv,
  unguardCell,
} from './csv-codec';
import { IMPORT_TYPES, TEMPLATES } from './templates';

describe('CSV codec', () => {
  it('parses UTF-8 with BOM, quoted cells and Arabic text', () => {
    const { headers, rows } = parseCsv(
      Buffer.from('\uFEFFVariant_Slug,value\n"a-b","1,5"\nx,"نص ""مقتبس"""\n\n', 'utf8'),
    );
    expect(headers).toEqual(['variant_slug', 'value']);
    expect(rows).toEqual([
      { variant_slug: 'a-b', value: '1,5' },
      { variant_slug: 'x', value: 'نص "مقتبس"' },
    ]);
  });

  it('rejects empty, binary and malformed files', () => {
    expect(() => parseCsv(Buffer.from(''))).toThrow(CsvFormatError);
    expect(() => parseCsv(Buffer.from('a,b\n1,\u0000'))).toThrow('binary_content');
    expect(() => parseCsv(Buffer.from('a,b\n1,2,3\n'))).toThrow('parse_error');
  });

  it('guards spreadsheet formulas on export and reverses it on import', () => {
    expect(guardCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(guardCell('@cmd')).toBe("'@cmd");
    expect(guardCell('-5')).toBe('-5');
    expect(guardCell('plain')).toBe('plain');
    expect(unguardCell("'=SUM(A1)")).toBe('=SUM(A1)');
    expect(unguardCell("'quoted")).toBe("'quoted");
    const out = toCsv(['a', 'b'], [['=1+1', null]]);
    expect(out.startsWith('\uFEFF')).toBe(true);
    expect(parseCsv(Buffer.from(out)).rows[0]).toEqual({ a: '=1+1', b: '' });
  });

  it('reads numbers in common notations and never turns empty into 0', () => {
    expect(parseNumberCell('')).toBeNull();
    expect(parseNumberCell(undefined)).toBeNull();
    expect(parseNumberCell('75.5')).toBe(75.5);
    expect(parseNumberCell('1,234.5')).toBe(1234.5);
    expect(parseNumberCell('1,234,567')).toBe(1234567);
    expect(parseNumberCell('75,5')).toBe(75.5);
    expect(parseNumberCell('٧٥٫٥')).toBe(75.5);
    expect(parseNumberCell('abc')).toBeNaN();
    expect(parseNumberCell('0')).toBe(0);
  });

  it('reads booleans in ar/en', () => {
    expect(parseBoolCell('نعم')).toBe(true);
    expect(parseBoolCell('FALSE')).toBe(false);
    expect(parseBoolCell('')).toBeNull();
    expect(parseBoolCell('maybe')).toBeUndefined();
  });
});

describe('templates', () => {
  it('every template has unique snake_case columns and required keys', () => {
    for (const type of IMPORT_TYPES) {
      const names = TEMPLATES[type].columns.map((c) => c.name);
      expect(new Set(names).size).toBe(names.length);
      for (const n of names) expect(n).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(TEMPLATES[type].columns.some((c) => c.required)).toBe(true);
    }
    expect(TEMPLATES.prices.extraPermission).toBe('prices.write');
  });
});

describe('slugs and visibility', () => {
  it('builds latin slugs', () => {
    expect(latinSlug('BYD', 'Seal', 2025, 'Design AWD', 'BEV')).toBe(
      'byd-seal-2025-design-awd-bev',
    );
    expect(latinSlug('Škoda Enyaq')).toBe('skoda-enyaq');
  });

  it('finds a free slug with a numeric suffix, refuses a taken explicit one', async () => {
    const taken = new Set(['a', 'a-2']);
    await expect(resolveSlug(undefined, 'a', (s) => Promise.resolve(taken.has(s)))).resolves.toBe(
      'a-3',
    );
    await expect(resolveSlug('a', 'x', (s) => Promise.resolve(taken.has(s)))).rejects.toMatchObject(
      {
        code: 'SLUG_TAKEN',
      },
    );
    await expect(resolveSlug('Bad Slug', 'x', () => Promise.resolve(false))).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('explains why a variant is not public', () => {
    const published = { status: 'published' as const, deletedAt: null };
    expect(
      visibilityBlockers({
        brand: published,
        model: { status: 'draft', deletedAt: null },
        generation: { deletedAt: null },
        variant: published,
        marketAvailabilities: ['not_available'],
      }),
    ).toEqual(['model_not_published', 'no_market_listing']);
    expect(
      visibilityBlockers({
        brand: published,
        model: published,
        variant: published,
        marketAvailabilities: ['coming_soon'],
      }),
    ).toEqual([]);
  });
});
